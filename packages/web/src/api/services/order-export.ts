import { asc } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { safeCell, toCsv } from "../../shared/csv";
import { statusLabels, type OrderSnapshot, type OrderStatus } from "../../shared/orders";

const rub = (kopecks: number) => (kopecks / 100).toFixed(2).replace(".", ",");
const status = (value: string) => statusLabels[value as OrderStatus] || value;
const when = (iso: string) => iso.replace("T", " ").slice(0, 19);

async function allOrders() {
  const rows: { id: string; createdAt: string; status: string; assignedTo: string; notification: string; emailNotification: string; data: OrderSnapshot }[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await db.select().from(s.orders).orderBy(asc(s.orders.createdAt), asc(s.orders.id)).limit(500).offset(offset);
    for (const row of page) { try { rows.push({ id: row.id, createdAt: row.createdAt, status: row.status, assignedTo: row.assignedTo || "", notification: row.notification, emailNotification: row.emailNotification, data: JSON.parse(row.data) }); } catch { /* skip unreadable legacy row */ } }
    if (page.length < 500) return rows;
  }
}

/** One row per reservation request. Personal data: call only from owner-only procedures. */
export async function ordersCsv() {
  const orders = await allOrders();
  const rows = orders.map(o => [o.id, when(o.createdAt), status(o.status), safeCell(o.data.name), o.data.phone, safeCell(o.data.email || ""), safeCell(o.data.preferredTime || ""), safeCell(o.data.telegram || ""), safeCell(o.assignedTo), safeCell(o.data.comment || ""),
    safeCell(o.data.items.map(i => `${i.name} × ${i.qty}`).join("; ")), rub(o.data.subtotalKopecks), rub(o.data.deliveryKopecks), rub(o.data.totalKopecks), o.notification, o.emailNotification]);
  return { count: rows.length, csv: toCsv([["Номер заявки", "Дата", "Статус", "Имя", "Телефон", "Email", "Удобное время связи", "Telegram-ник", "Взял в работу", "Комментарий", "Позиции", "Товары, ₽", "Доставка, ₽", "Итого, ₽", "Telegram уведомление", "Почта"], ...rows]) };
}

/** One row per customer (grouped by phone). Cancelled requests are not counted in the total. */
export async function customersCsv() {
  const groups = new Map<string, { name: string; phone: string; email: string; preferredTime: string; telegram: string; orders: number; totalKopecks: number; first: string; last: string; lastStatus: string }>();
  for (const o of await allOrders()) {
    const key = o.data.phone.replace(/\D/g, "") || o.id; const g = groups.get(key);
    const counted = o.status === "cancelled" ? 0 : o.data.totalKopecks;
    if (!g) groups.set(key, { name: o.data.name, phone: o.data.phone, email: o.data.email || "", preferredTime: o.data.preferredTime || "", telegram: o.data.telegram || "", orders: 1, totalKopecks: counted, first: o.createdAt, last: o.createdAt, lastStatus: o.status });
    else { g.name = o.data.name; g.email = o.data.email || g.email; g.preferredTime = o.data.preferredTime || g.preferredTime; g.telegram = o.data.telegram || g.telegram; g.orders++; g.totalKopecks += counted; g.last = o.createdAt; g.lastStatus = o.status; }
  }
  const rows = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last)).map(g => [safeCell(g.name), g.phone, safeCell(g.email), safeCell(g.preferredTime), safeCell(g.telegram), g.orders, rub(g.totalKopecks), when(g.first), when(g.last), status(g.lastStatus)]);
  return { count: rows.length, csv: toCsv([["Имя", "Телефон", "Email", "Удобное время связи", "Telegram-ник", "Заявок", "Сумма заявок, ₽", "Первая заявка", "Последняя заявка", "Статус последней"], ...rows]) };
}
