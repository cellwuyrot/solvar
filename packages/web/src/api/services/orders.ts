import { createHash } from "node:crypto";
import { eq, desc, and, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { integrationSchema, type OrderSnapshot } from "../../shared/orders";
import { productSchema, normalizeSettings, rub } from "../../shared/shop";
import { captchaConfigured, captchaRequired } from "./order-security";

export const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export async function getIntegration() {
  const [row] = await db.select().from(s.orderIntegration).where(eq(s.orderIntegration.id, "main"));
  return integrationSchema.parse(row ? JSON.parse(row.data) : {});
}
export const tokenConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
/** Requests are accepted only when the owner enabled intake and, if required, CAPTCHA keys are present (fail closed). */
export async function ordersAvailable() {
  if (captchaRequired() && !captchaConfigured()) return false;
  return (await getIntegration()).enabled;
}
export async function getSettings() {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Выполните db:seed" });
  return normalizeSettings(JSON.parse(row.data));
}
export async function makeSnapshot(input: { name: string; phone: string; email?: string; preferredTime?: string; telegram?: string; comment: string; items: { productId: string; qty: number }[]; expectedTotalKopecks: number }): Promise<OrderSnapshot> {
  if (new Set(input.items.map(i => i.productId)).size !== input.items.length)
    throw new ORPCError("BAD_REQUEST", { message: "Повторяющиеся позиции корзины" });
  const catalog = (await db.select().from(s.products)).map(row => productSchema.parse(JSON.parse(row.data)));
  const settings = await getSettings();
  const items = input.items.map(item => {
    const product = catalog.find(p => p.id === item.productId && p.active && p.availability !== "out_of_stock");
    if (!product) throw new ORPCError("CONFLICT", { message: "Товар недоступен. Обновите корзину." });
    return { ...item, name: product.name, priceKopecks: Math.round(product.price * 100) };
  });
  const subtotalKopecks = items.reduce((sum, item) => sum + item.priceKopecks * item.qty, 0);
  const deliveryKopecks = subtotalKopecks < Math.round(settings.freeShipping * 100) ? Math.round(settings.deliveryFee * 100) : 0;
  const totalKopecks = subtotalKopecks + deliveryKopecks;
  if (totalKopecks !== input.expectedTotalKopecks)
    throw new ORPCError("CONFLICT", { message: "Цена или доставка изменились. Обновите страницу и проверьте сумму." });
  return { name: input.name, phone: input.phone, email: input.email || "", preferredTime: input.preferredTime || "", telegram: input.telegram || "", comment: input.comment, items, subtotalKopecks, deliveryKopecks, totalKopecks,
    consent: { acceptedAt: new Date().toISOString(), policyHash: digest(settings.privacy), policyText: settings.privacy, text: "Согласен на обработку имени, телефона, email, желаемого времени связи, Telegram-ника и комментария для обработки заявки согласно политике конфиденциальности." } };
}
export function checkOrigin(headers: Headers) {
  const origin = headers.get("origin");
  const allowed = [process.env.WEBSITE_URL, ...(process.env.AUTH_TRUSTED_ORIGINS || "").split(",")]
    .filter(Boolean).map(v => v!.trim().replace(/\/$/, ""));
  if (!origin || !allowed.includes(origin)) throw new ORPCError("FORBIDDEN", { message: "Недопустимый источник запроса" });
}
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !chatId) throw new Error("Telegram не настроен");
  // No parse_mode: buyer content cannot inject markup. Never log token or request URL.
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, protect_content: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new Error("Сеть или таймаут Telegram; доставка сообщения неизвестна"); }
  let result: { ok?: boolean; error_code?: number };
  try { result = await response.json() as typeof result; } catch { throw new Error("Некорректный ответ Telegram"); }
  if (!response.ok || !result.ok) throw new Error(`Telegram отклонил запрос (код ${result.error_code || response.status})`);
}
export function formatOrderMessage(orderNumber: number, at: string, data: OrderSnapshot) {
  const lines = data.items.map(i => `${i.name.slice(0, 28)} × ${i.qty} — ${rub(i.priceKopecks * i.qty / 100)}`);
  return ["Новая заявка SOLVAR (не оплачена)", `№ ${orderNumber}`, `Дата: ${at}`, `Имя: ${data.name}`, `Телефон: ${data.phone}`, data.email ? `Email: ${data.email}` : "", data.preferredTime ? `Удобное время связи: ${data.preferredTime}` : "", data.telegram ? `Telegram: ${data.telegram}` : "",
    ...lines, `Товары: ${rub(data.subtotalKopecks / 100)}`, `Доставка предварительно: ${rub(data.deliveryKopecks / 100)}`,
    `Итого предварительно: ${rub(data.totalKopecks / 100)}`, data.comment ? `Комментарий: ${data.comment}` : "",
    "Наличие, доставка и окончательная сумма требуют подтверждения продавцом."].filter(Boolean).join("\n");
}
export async function listOrders(offset: number, search = "", status = "") {
  const escaped = "%" + search.replace(/[\\%_]/g, v => "\\" + v) + "%";
  const where = and(status ? eq(s.orders.status, status) : undefined, search ? sql`(json_extract(${s.orders.data}, '$.name') LIKE ${escaped} ESCAPE '\\' OR json_extract(${s.orders.data}, '$.phone') LIKE ${escaped} ESCAPE '\\' OR json_extract(${s.orders.data}, '$.email') LIKE ${escaped} ESCAPE '\\' OR json_extract(${s.orders.data}, '$.telegram') LIKE ${escaped} ESCAPE '\\' OR CAST(${s.orders.orderNumber} AS TEXT) LIKE ${escaped} ESCAPE '\\' OR ${s.orders.id} LIKE ${escaped} ESCAPE '\\')` : undefined);
  const rows = await db.select().from(s.orders).where(where).orderBy(desc(s.orders.createdAt), desc(s.orders.id)).limit(51).offset(offset);
  return { hasMore: rows.length > 50, orders: rows.slice(0, 50).map(({ requestHash: _hash, telegramDeliveredChats: _telegramDeliveredChats, ...row }) => ({ ...row, paymentData: JSON.parse(row.paymentData) as { invoiceNumber?: string; paymentUrl?: string; finalTotalKopecks?: number; state?: string }, data: JSON.parse(row.data) as OrderSnapshot })) };
}
