import { databaseRetry } from "./database-retry";
import { and, eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import type { OrderSnapshot } from "../../shared/orders";
import { normalizePhone, privateHash } from "./order-security";
export async function persistOrder(id: string, requestHash: string, device: string, data: OrderSnapshot, telegram: boolean, email: boolean) {
  const now = new Date().toISOString();
  return databaseRetry(() => db.transaction(async tx => {
    const [existing] = await tx.select().from(s.orders).where(eq(s.orders.id, id));
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ORPCError("CONFLICT", { message: "Создайте новую заявку" });
      return false;
    }
    for (const key of [privateHash("phone:" + normalizePhone(data.phone)), privateHash("device:" + device)]) {
      const [guard] = await tx.select().from(s.orderGuards).where(eq(s.orderGuards.key, key));
      if (guard) {
        const [prior] = await tx.select({ status: s.orders.status }).from(s.orders).where(eq(s.orders.id, guard.orderId));
        if (prior && !["completed", "cancelled"].includes(prior.status))
          throw new ORPCError("CONFLICT", { message: "У вас уже есть заявка в обработке. Дождитесь ответа продавца или попросите изменить её." });
        if (guard.blockedUntil > Date.now()) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Повторную заявку можно отправить через 10 минут после предыдущей." });
      }
      await tx.insert(s.orderGuards).values({ key, orderId: id, blockedUntil: Date.now() + 600000 })
        .onConflictDoUpdate({ target: s.orderGuards.key, set: { orderId: id, blockedUntil: Date.now() + 600000 } });
    }
    await tx.insert(s.orders).values({ id, requestHash, createdAt: now, data: JSON.stringify(data),
      notification: telegram ? "pending" : "disabled", notificationUpdatedAt: now,
      emailNotification: email ? "pending" : "disabled", emailUpdatedAt: now });
    await tx.insert(s.orderHistory).values({ id: crypto.randomUUID(), orderId: id, at: now, actor: "customer", action: "created" });
    return true;
  }));
}
export async function editOrder(id: string, version: number, actor: string, action: string, patch: Partial<typeof s.orders.$inferInsert>) {
  return databaseRetry(() => db.transaction(async tx => {
    const updated = await tx.update(s.orders).set({ ...patch, version: sql`${s.orders.version} + 1` })
      .where(and(eq(s.orders.id, id), eq(s.orders.version, version))).returning({ id: s.orders.id });
    if (!updated.length) {
      const [row] = await tx.select({ id: s.orders.id }).from(s.orders).where(eq(s.orders.id, id));
      throw new ORPCError(row ? "CONFLICT" : "NOT_FOUND", { message: row ? "Заявка изменена в другой вкладке. Обновите список." : "Заявка не найдена" });
    }
    await tx.insert(s.orderHistory).values({ id: crypto.randomUUID(), orderId: id, at: new Date().toISOString(), actor, action });
    return { ok: true };
  }));
}
