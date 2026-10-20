import { requireCommerce } from "../services/commerce-policy";
import { databaseRetry } from "../services/database-retry";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { admin, owner } from "../middleware/admin";
import { db } from "../database";
import * as s from "../database/schema";
import { integrationSchema, orderInputSchema, orderStatusSchema } from "../../shared/orders";
import { checkOrigin, digest, getIntegration, listOrders, makeSnapshot, ordersAvailable, sendTelegram, tokenConfigured } from "../services/orders";
import { captchaConfigured, captchaRequired, deviceId, normalizePhone, persistentRate, verifyCaptcha } from "../services/order-security";
import { deliverOrder, sendEmail, smtpConfigured } from "../services/order-notifications";
import { editOrder, persistOrder } from "../services/order-persistence";
const editSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() });
export const orderPublic = {
  createOrder: base.input(orderInputSchema).handler(async ({ input, context }) => {
    requireCommerce();
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
      return { id: requestId, accepted: true };
    }
    if (!await ordersAvailable()) throw new ORPCError("PRECONDITION_FAILED", { message: "Приём заявок пока отключён" });
    await persistentRate("phone:" + payload.phone, 3, 600000);
    await persistentRate("device:" + device, 3, 600000);
    await persistentRate("global-orders", 60, 60000);
    await verifyCaptcha(input.captchaToken, context.clientIp);
    const data = await makeSnapshot(payload);
    const config = await getIntegration();
    await persistOrder(requestId, requestHash, device, data, config.telegramEnabled && tokenConfigured() && !!config.chatId, config.emailEnabled && smtpConfigured() && !!config.notifyEmail);
    // Delivery is picked up by the durable worker, not awaited in the buyer's HTTP request.
    return { id: requestId, accepted: true };
  }),
};
export const orderManagement = {
  integration: admin.handler(async () => ({ ...await getIntegration(), tokenConfigured: tokenConfigured(), smtpConfigured: smtpConfigured(), captchaRequired: captchaRequired(), captchaConfigured: captchaConfigured() })),
  saveIntegration: owner.input(integrationSchema).handler(async ({ input }) => {
    if (input.enabled) requireCommerce();
    // A notification channel is optional: saved requests always appear in the admin panel.
    if (input.enabled && (!input.documentsReady || (captchaRequired() && !captchaConfigured())))
      throw new ORPCError("BAD_REQUEST", { message: "Подтвердите готовность документов и настройте CAPTCHA, если она обязательна" });
    await db.insert(s.orderIntegration).values({ id: "main", data: JSON.stringify(input) })
      .onConflictDoUpdate({ target: s.orderIntegration.id, set: { data: JSON.stringify(input) } });
    return { ok: true };
  }),
  testTelegram: owner.handler(async () => {
    if (process.env.DEPLOYMENT_ENV !== "staging") throw new ORPCError("FORBIDDEN", { message: "Тестовые отправки разрешены только на staging" });
    const config = await getIntegration();
    try { await sendTelegram(config.chatId, "SOLVAR: тест уведомлений."); }
    catch (error) { throw new ORPCError("BAD_GATEWAY", { message: error instanceof Error ? error.message : "Telegram недоступен" }); }
    return { ok: true };
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
  setOrderStatus: admin.input(editSchema.extend({ status: orderStatusSchema })).handler(({ input, context }) => {
    if (input.status === "confirmed") requireCommerce();
    return editOrder(input.id, input.version, context.user.email, "status:" + input.status, { status: input.status });
  }),
  setAdminNote: admin.input(editSchema.extend({ note: z.string().max(5000) })).handler(({ input, context }) =>
    editOrder(input.id, input.version, context.user.email, "note_updated", { adminNote: input.note })),
  setPaymentDetails: admin.input(editSchema.extend({
    invoiceNumber: z.string().trim().max(100), paymentUrl: z.string().trim().max(1000), finalTotalKopecks: z.number().int().nonnegative().max(1000000000000),
    state: z.enum(["not_invoiced", "invoiced", "paid"]),
  })).handler(async ({ input, context }) => {
    requireCommerce();
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
  deleteClosedOrder: admin.input(editSchema).handler(async ({ input, context }) => databaseRetry(() => db.transaction(async tx => {
    const [row] = await tx.select().from(s.orders).where(eq(s.orders.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.version !== input.version) throw new ORPCError("CONFLICT");
    if (!["completed", "cancelled"].includes(row.status)) throw new ORPCError("CONFLICT", { message: "Удалять можно только завершённые или отменённые заявки" });
    if (row.notification === "sending" || row.emailNotification === "sending") throw new ORPCError("CONFLICT", { message: "Дождитесь окончания отправки" });
    await tx.delete(s.orders).where(and(eq(s.orders.id, input.id), eq(s.orders.version, input.version)));
    await tx.delete(s.orderHistory).where(eq(s.orderHistory.orderId, input.id));
    await tx.insert(s.orderHistory).values({ id: crypto.randomUUID(), orderId: input.id, at: new Date().toISOString(), actor: context.user.email, action: "personal_data_deleted" });
    return { ok: true };
  }))),
  retryNotification: admin.input(z.object({ id: z.string().uuid(), channel: z.enum(["telegram", "email"]).default("telegram") })).handler(async ({ input }) => {
    const [row] = await db.select().from(s.orders).where(eq(s.orders.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND");
    requireCommerce();
    await deliverOrder(input.id, input.channel, true);
    const [updated] = await db.select().from(s.orders).where(eq(s.orders.id, input.id));
    return { notification: input.channel === "telegram" ? updated.notification : updated.emailNotification, error: input.channel === "telegram" ? updated.notificationError : updated.emailError };
  }),
};
