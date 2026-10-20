import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { owner } from "../middleware/admin";
import { db } from "../database";
import * as s from "../database/schema";
import { auth } from "../auth";
import { databaseRetry } from "../services/database-retry";
import { persistentRate } from "../services/order-security";
import { smtpConfigured } from "../services/mail";
const secretSchema = z.object({ ownerPassword: z.string().min(1).max(128) });
export async function reauthenticate(userId: string, password: string) {
  await persistentRate("admin-reauth:" + userId, 5, 15 * 60000);
  const [account] = await db.select({ password: s.account.password }).from(s.account).where(and(eq(s.account.userId, userId), eq(s.account.providerId, "credential")));
  if (!account?.password || !await verifyPassword({ hash: account.password, password })) throw new ORPCError("FORBIDDEN", { message: "Не удалось подтвердить пароль владельца" });
}
async function invite(userId: string, email: string) {
  if (!smtpConfigured()) return { notification: "not_configured" as const };
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: new URL("/admin/reset-password", process.env.WEBSITE_URL!).href } });
    const [row] = await db.select({ state: s.adminMembers.inviteState }).from(s.adminMembers).where(eq(s.adminMembers.userId, userId));
    return { notification: row?.state === "accepted" ? "accepted" as const : "unconfirmed" as const };
  } catch { return { notification: "unconfirmed" as const }; }
}
export const adminMemberManagement = {
  adminMembers: owner.handler(async () => ({
    smtpConfigured: smtpConfigured(),
    members: await db.select({ id: s.user.id, name: s.user.name, email: s.user.email, role: s.adminMembers.role, active: s.adminMembers.active, createdAt: s.adminMembers.createdAt, inviteState: s.adminMembers.inviteState })
      .from(s.adminMembers).innerJoin(s.user, eq(s.user.id, s.adminMembers.userId)),
  })),
  createAdmin: owner.input(secretSchema.extend({ email: z.email().max(254).transform(v => v.trim().toLowerCase()), name: z.string().trim().min(2).max(100) })).handler(async ({ input, context }) => {
    await reauthenticate(context.user.id, input.ownerPassword);
    const id = crypto.randomUUID(), password = await hashPassword(randomBytes(48).toString("base64url")), now = new Date();
    await databaseRetry(() => db.transaction(async tx => {
      if ((await tx.select({ id: s.adminMembers.userId }).from(s.adminMembers)).length >= 50) throw new ORPCError("PRECONDITION_FAILED", { message: "Достигнут лимит 50 учётных записей" });
      if ((await tx.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, input.email))).length) throw new ORPCError("CONFLICT", { message: "Такая учётная запись уже существует" });
      await tx.insert(s.user).values({ id, email: input.email, name: input.name, emailVerified: false, updatedAt: now });
      await tx.insert(s.account).values({ id: crypto.randomUUID(), accountId: id, userId: id, providerId: "credential", password, updatedAt: now });
      await tx.insert(s.adminMembers).values({ userId: id, role: "admin", active: true, createdAt: now.toISOString(), createdBy: context.user.id });
      await tx.insert(s.adminEvents).values({ id: crypto.randomUUID(), actorId: context.user.id, targetId: id, action: "admin_created", at: now.toISOString() });
    }));
    // A transport failure never rolls back the account. The owner can repeat the invitation.
    return { created: true, ...await invite(id, input.email) };
  }),
  resendAdminInvite: owner.input(secretSchema.extend({ id: z.string().uuid() })).handler(async ({ input, context }) => {
    await reauthenticate(context.user.id, input.ownerPassword);
    const [target] = await db.select({ email: s.user.email, role: s.adminMembers.role, active: s.adminMembers.active }).from(s.adminMembers).innerJoin(s.user, eq(s.user.id, s.adminMembers.userId)).where(eq(s.adminMembers.userId, input.id));
    if (!target || target.role !== "admin" || !target.active) throw new ORPCError("BAD_REQUEST", { message: "Приглашение доступно только активному администратору" });
    return invite(input.id, target.email);
  }),
  setAdminActive: owner.input(secretSchema.extend({ id: z.string().uuid(), active: z.boolean() })).handler(async ({ input, context }) => {
    await reauthenticate(context.user.id, input.ownerPassword);
    await databaseRetry(() => db.transaction(async tx => {
      const [member] = await tx.select().from(s.adminMembers).where(eq(s.adminMembers.userId, input.id));
      if (!member || member.role === "owner" || input.id === context.user.id) throw new ORPCError("FORBIDDEN", { message: "Нельзя отключить владельца или собственную учётную запись" });
      await tx.update(s.adminMembers).set({ active: input.active }).where(eq(s.adminMembers.userId, input.id));
      if (!input.active) await tx.delete(s.session).where(eq(s.session.userId, input.id));
      await tx.insert(s.adminEvents).values({ id: crypto.randomUUID(), actorId: context.user.id, targetId: input.id, action: input.active ? "admin_enabled" : "admin_disabled", at: new Date().toISOString() });
    }));
    return { ok: true };
  }),
  adminAccessHistory: owner.handler(() => db.select().from(s.adminEvents).orderBy(desc(s.adminEvents.at)).limit(100)),
};
