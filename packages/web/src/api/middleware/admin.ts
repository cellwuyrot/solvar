import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { base } from "../__core/app";
import { auth } from "../auth";
import { db } from "../database";
import { adminMembers } from "../database/schema";
import { checkOrigin } from "../services/orders";
export const staff = base.use(async ({ context, next }) => {
  if (context.headers.get("origin")) checkOrigin(context.headers);
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Войдите в админку" });
  const [membership] = await db.select().from(adminMembers).where(eq(adminMembers.userId, session.user.id));
  if (!membership?.active || !["owner", "admin", "manager"].includes(membership.role)) throw new ORPCError("FORBIDDEN");
  return next({ context: { user: session.user, adminRole: membership.role as "owner" | "admin" | "manager" } });
});
export const admin = staff.use(({ context, next }) => {
  if (context.adminRole === "manager") throw new ORPCError("FORBIDDEN", { message: "У менеджера нет доступа к настройкам сайта" });
  return next();
});
export const owner = admin.use(({ context, next }) => {
  if (context.adminRole !== "owner") throw new ORPCError("FORBIDDEN", { message: "Доступно только владельцу" });
  return next();
});
