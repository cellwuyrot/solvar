import { databaseRetry } from "../services/database-retry";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { admin, owner } from "../middleware/admin";
import { db } from "../database";
import * as s from "../database/schema";
import { integrationSchema, orderInputSchema, orderStatusSchema } from "../../shared/orders";
import { getOrderChatIds } from "../../shared/order-helpers";
import { checkOrigin, digest, getIntegration, listOrders, makeSnapshot, ordersAvailable, sendTelegram, tokenConfigured } from "../services/orders";
import { captchaConfigured, captchaRequired, deviceId, normalizePhone, persistentRate, verifyCaptcha } from "../services/order-security";
import { deliverOrder, sendEmail, smtpConfigured } from "../services/order-notifications";
import { editOrder, persistOrder } from "../services/order-persistence";
import { customersCsv, ordersCsv } from "../services/order-export";
const editSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() });
const deleteOrderProcedure = admin.input(editSchema).handler(async ({ input, context }) => databaseRetry(() => db.transaction(async tx => {
  const [row] = await tx.select().from(s.orders).where(eq(s.orders.id, input.id));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Заявка не найдена" });
  if (row.version !== input.version) throw new ORPCError("CONFLICT", { message: "Заявка обновилась. Обновите список и повторите удаление." });
  if (row.notification === "sending" || row.emailNotification === "sending") throw new ORPCError("CONFLICT", { message: "Дождитесь окончания отправки уведомлений." });
  await tx.delete(s.orderHistory).where(eq(s.orderHistory.orderId, input.id));
  await tx.delete(s.orderGuards).where(eq(s.orderGuards.orderId, input.id));
  const deleted = await tx.delete(s.orders).where(and(eq(s.orders.id, input.id), eq(s.orders.version, input.version))).returning({ orderNumber: s.orders.orderNumber });
  if (!deleted.length) throw new ORPCError("CONFLICT", { message: "Заявка обновилась. Обновите список и повторите удаление." });
  console.info(`Deleted order #${deleted[0].orderNumber} by administrator ${context.user.email}`);
  return { ok: true };
})));
export const orderPublic = {
  createOrder: base.input(orderInputSchema).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    if (input.website) throw new ORPCError("BAD_REQUEST", { message: "Не удалось отправить заявку" });
    const device = deviceId(context.headers);
    if (!device) throw new ORPCError("PRECONDITION_FAILED", { message: "Обновите форму заявки (необходимы cookies)." });
    await persistentRate("ip:" + context.clientIp, 20, 600000);
    const { requestId, website: _website, captchaToken: _captcha, ...payload } = input;
    payload.phone = normalizePhone(payload.phone);
    const requestHash = digest(JSON.stringify(payload));
    const [existing] = await db.select().from(s.orders).where(eq(s.orders.id, requestId));
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ORPCError("CONFLICT", { message: "Создайте новую заявку" });
      return { id: requestId, number: existing.orderNumber, accepted: true };
    }
    if (!await ordersAvailable()) throw new ORPCError("PRECONDITION_FAILED", { message: "Приём заявок пока отключён" });
    await persistentRate("phone:" + payload.phone, 3, 600000);
    await persistentRate("device:" + device, 3, 600000);
    await persistentRate("global-orders", 60, 60000);
    await verifyCaptcha(input.captchaToken, context.clientIp);
    const data = await makeSnapshot(payload);
    const config = await getIntegration();
    await persistOrder(requestId, requestHash, device, data, config.telegramEnabled && tokenConfigured() && getOrderChatIds(config).length > 0, config.emailEnabled && smtpConfigured() && !!config.notifyEmail);
    const [saved] = await db.select({ orderNumber: s.orders.orderNumber }).from(s.orders).where(eq(s.orders.id, requestId));
    if (!saved) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Заявка не найдена после сохранения" });
    // Delivery is picked up by the durable worker, not awaited in the buyer's HTTP request.
    return { id: requestId, number: saved.orderNumber, accepted: true };
  }),
};
export const orderManagement = {
  integration: owner.handler(async () => ({ ...await getIntegration(), tokenConfigured: tokenConfigured(), smtpConfigured: smtpConfigured(), captchaRequired: captchaRequired(), captchaConfigured: captchaConfigured(), testNotificationsAvailable: process.env.DEPLOYMENT_ENV === "staging" })),
  saveIntegration: owner.input(integrationSchema).handler(async ({ input }) => {
    // A notification channel is optional: saved requests always appear in the admin panel.
    if (input.enabled && captchaRequired() && !captchaConfigured())
      throw new ORPCError("BAD_REQUEST", { message: "Для включения приёма заявок настройте обязательную CAPTCHA в серверном окружении" });
    await db.insert(s.orderIntegration).values({ id: "main", data: JSON.stringify(input) })
      .onConflictDoUpdate({ target: s.orderIntegration.id, set: { data: JSON.stringify(input) } });
    return { ok: true };
  }),
  /** Bulk personal-data export: owner only. Only the count and the actor are logged, never the contents. */
  exportOrders: owner.input(z.object({ kind: z.enum(["orders", "customers"]) })).handler(async ({ input, context }) => {
    const result = input.kind === "customers" ? await customersCsv() : await ordersCsv();
    console.info(`Personal data export (${input.kind}, ${result.count} rows) by ${context.user.email}`);
    return { ...result, filename: `solvar-${input.kind}-${new Date().toISOString().slice(0, 10)}.csv` };
  }),
  testTelegram: owner.handler(async () => {
    if (process.env.DEPLOYMENT_ENV !== "staging") throw new ORPCError("FORBIDDEN", { message: "Тестовые отправки разрешены только на staging" });
    const config = await getIntegration();
    const chatIds = getOrderChatIds(config);
    if (!chatIds.length) throw new ORPCError("PRECONDITION_FAILED", { message: "Добавьте хотя бы один Chat ID в настройках уведомлений" });
    const results = await Promise.allSettled(chatIds.map(chatId => sendTelegram(chatId, "SOLVAR: тест уведомлений.")));
    const failed = results.filter(result => result.status === "rejected").length;
    if (failed) throw new ORPCError("BAD_GATEWAY", { message: `Telegram: успешно ${chatIds.length - failed} из ${chatIds.length}; проверьте доступ бота и Chat ID.` });
    return { ok: true, sent: chatIds.length };
  }),
  testEmail: owner.handler(async () => {
    if (process.env.DEPLOYMENT_ENV !== "staging") throw new ORPCError("FORBIDDEN", { message: "Тестовые отправки разрешены только на staging" });
    const config = await getIntegration();
    try { await sendEmail(config.notifyEmail, "SOLVAR: тест уведомлений", "Тест доставки уведомлений SOLVAR."); }
    catch { throw new ORPCError("BAD_GATEWAY", { message: "SMTP: отправка не подтверждена. Проверьте настройки." }); }
    return { ok: true };
  }),
  orders: admin.input(z.object({ offset: z.number().int().min(0).max(1000000).default(0), search: z.string().max(100).default(""), status: z.union([orderStatusSchema, z.literal("")]).default("") }))
    .handler(({ input }) => listOrders(input.offset, input.search, input.status)),
  claimOrder: admin.input(editSchema).handler(async ({ input, context }) => {
    const actor = context.user.email;
    let publicOrderNumber = 0;
    await databaseRetry(() => db.transaction(async tx => {
      const [row] = await tx.select().from(s.orders).where(eq(s.orders.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Заявка не найдена" });
      publicOrderNumber = row.orderNumber;
      if (row.version !== input.version) throw new ORPCError("CONFLICT", { message: "Заявка обновлена. Перезагрузите список." });
      if (row.assignedTo) throw new ORPCError("CONFLICT", { message: `Эту заявку уже взял ${row.assignedTo}` });
      if (["completed", "cancelled"].includes(row.status)) throw new ORPCError("CONFLICT", { message: "Закрытую заявку нельзя взять в работу" });
      const updated = await tx.update(s.orders).set({ assignedTo: actor, status: "contacted", version: row.version + 1 })
        .where(and(eq(s.orders.id, input.id), eq(s.orders.version, input.version), eq(s.orders.assignedTo, ""))).returning({ id: s.orders.id });
      if (!updated.length) throw new ORPCError("CONFLICT", { message: "Заявку уже взял другой администратор. Обновите список." });
      await tx.insert(s.orderHistory).values({ id: crypto.randomUUID(), orderId: input.id, at: new Date().toISOString(), actor, action: "claimed_order" });
    }));
    const config = await getIntegration();
    const chatIds = config.telegramEnabled && tokenConfigured() ? getOrderChatIds(config) : [];
    let sent = 0;
    await Promise.all(chatIds.map(async chatId => {
      try { await sendTelegram(chatId, `SOLVAR: заявку № ${publicOrderNumber} взял администратор ${actor}.`); sent++; }
      catch { /* Assignment is saved; notification outcome is reported to the admin UI. */ }
    }));
    return { ok: true, assignedTo: actor, telegramSent: sent, telegramTotal: chatIds.length };
  }),
  setOrderStatus: admin.input(editSchema.extend({ status: orderStatusSchema })).handler(({ input, context }) => {
    return editOrder(input.id, input.version, context.user.email, "status:" + input.status, { status: input.status });
  }),
  setAdminNote: admin.input(editSchema.extend({ note: z.string().max(5000) })).handler(({ input, context }) =>
    editOrder(input.id, input.version, context.user.email, "note_updated", { adminNote: input.note })),
  setPaymentDetails: admin.input(editSchema.extend({
    invoiceNumber: z.string().trim().max(100), paymentUrl: z.string().trim().max(1000), finalTotalKopecks: z.number().int().nonnegative().max(1000000000000),
    state: z.enum(["not_invoiced", "invoiced", "paid"]),
  })).handler(async ({ input, context }) => {
    if (input.paymentUrl) {
      let url: URL; try { url = new URL(input.paymentUrl); } catch { throw new ORPCError("BAD_REQUEST", { message: "Некорректная ссылка оплаты" }); }
      const allowed = (process.env.PAYMENT_ALLOWED_HOSTS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
      if (url.protocol !== "https:" || url.username || url.password || !allowed.includes(url.hostname.toLowerCase()))
        throw new ORPCError("BAD_REQUEST", { message: "Ссылка должна быть HTTPS на домене вашего банка/провайдера из PAYMENT_ALLOWED_HOSTS" });
    }
    if (input.state === "invoiced" && (!input.invoiceNumber || !input.paymentUrl))
      throw new ORPCError("BAD_REQUEST", { message: "Укажите номер счёта и ссылку оплаты" });
    const { id, version, ...payment } = input;
    return editOrder(id, version, context.user.email, "payment:" + payment.state, { paymentData: JSON.stringify(payment) });
  }),
  orderHistory: admin.input(z.object({ id: z.string().uuid() })).handler(({ input }) =>
    db.select().from(s.orderHistory).where(eq(s.orderHistory.orderId, input.id)).orderBy(desc(s.orderHistory.at)).limit(100)),
  deleteOrder: deleteOrderProcedure,
  /** Backwards-compatible alias for older clients; new UI uses deleteOrder. */
  deleteClosedOrder: deleteOrderProcedure,
  retryNotification: admin.input(z.object({ id: z.string().uuid(), channel: z.enum(["telegram", "email"]).default("telegram") })).handler(async ({ input }) => {
    const [row] = await db.select().from(s.orders).where(eq(s.orders.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND");
    await deliverOrder(input.id, input.channel, true);
    const [updated] = await db.select().from(s.orders).where(eq(s.orders.id, input.id));
    return { notification: input.channel === "telegram" ? updated.notification : updated.emailNotification, error: input.channel === "telegram" ? updated.notificationError : updated.emailError };
  }),
};
