import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { hashPassword } from "better-auth/crypto";
import { owner } from "../middleware/admin";
import { reauthenticate } from "./admin-members";
import { db } from "../database";
import * as s from "../database/schema";
import { databaseRetry } from "../services/database-retry";
const credentials = z.object({ ownerPassword: z.string().min(1).max(128), managerPassword: z.string().min(12).max(128) });
export const managerManagement = {
  createManager: owner.input(credentials.extend({ name: z.string().trim().min(2).max(100), email: z.email().max(254).transform(v => v.trim().toLowerCase()) })).handler(async ({ input, context }) => {
    await reauthenticate(context.user.id, input.ownerPassword);
    const password = await hashPassword(input.managerPassword), id = crypto.randomUUID(), now = new Date();
    await databaseRetry(() => db.transaction(async tx => {
      if ((await tx.select().from(s.adminMembers)).length >= 50) throw new ORPCError("PRECONDITION_FAILED", { message: "Лимит: 50 сотрудников." });
      if ((await tx.select().from(s.user).where(eq(s.user.email, input.email))).length) throw new ORPCError("CONFLICT", { message: "Email уже используется." });
      await tx.insert(s.user).values({ id, name: input.name, email: input.email, emailVerified: false, updatedAt: now });
      await tx.insert(s.account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password, updatedAt: now });
      await tx.insert(s.adminMembers).values({ userId: id, role: "manager", active: true, createdAt: now.toISOString(), createdBy: context.user.id });
      await tx.insert(s.adminEvents).values({ id: crypto.randomUUID(), actorId: context.user.id, targetId: id, action: "manager_created", at: now.toISOString() });
    }));
    return { created: true };
  }),
  resetManagerPassword: owner.input(credentials.extend({ id: z.string().uuid() })).handler(async ({ input, context }) => {
    await reauthenticate(context.user.id, input.ownerPassword);
    const password = await hashPassword(input.managerPassword);
    await databaseRetry(() => db.transaction(async tx => {
      const [member] = await tx.select().from(s.adminMembers).where(eq(s.adminMembers.userId, input.id));
      if (!member?.active || member.role !== "manager") throw new ORPCError("FORBIDDEN");
      const updated = await tx.update(s.account).set({ password, updatedAt: new Date() }).where(and(eq(s.account.userId, input.id), eq(s.account.providerId, "credential"))).returning({ id: s.account.id });
      if (!updated.length) throw new ORPCError("PRECONDITION_FAILED");
      await tx.delete(s.session).where(eq(s.session.userId, input.id));
      await tx.insert(s.adminEvents).values({ id: crypto.randomUUID(), actorId: context.user.id, targetId: input.id, action: "manager_password_reset", at: new Date().toISOString() });
    }));
    return { ok: true };
  }),
};
