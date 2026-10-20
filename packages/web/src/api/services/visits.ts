import { createHash } from "node:crypto";
import { and, eq, inArray, lte, lt, sql } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { settingsSchema } from "../../shared/shop";
import { visitConfigSchema } from "../../shared/visits";
import { captchaConfigured } from "./order-security";
import { sendTelegram } from "./orders";
import { databaseRetry } from "./database-retry";
export const visitCaptchaRequired = () => process.env.VISIT_CAPTCHA_REQUIRED !== "false";
export const policyHash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function getVisitConfig() {
  const [row] = await db.select().from(s.visitConfig).where(eq(s.visitConfig.id, "main"));
  return visitConfigSchema.parse(row ? JSON.parse(row.data) : {});
}
export async function visitPublicConfig() {
  const config = await getVisitConfig();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
  const settings = settingsSchema.parse(JSON.parse(row?.data || "{}"));
  const privacy = settings.privacy.trim();
  const ready = !!settings.address.trim() && privacy.length >= 50 && (!visitCaptchaRequired() || captchaConfigured());
  return { enabled: config.enabled && ready, ready, address: settings.address, hours: settings.hours, privacy, policyHash: policyHash(privacy), captchaRequired: visitCaptchaRequired(), captchaSiteKey: visitCaptchaRequired() ? process.env.TURNSTILE_SITE_KEY || "" : "" };
}
let ticking = false;
export async function tickVisitNotifications() {
  if (ticking) return;
  ticking = true;
  try {
    const config = await getVisitConfig();
    if (!config.telegramEnabled || !config.chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
    const candidates = await db.select().from(s.visits).where(and(inArray(s.visits.notification, ["pending", "retry", "sending"]), lte(s.visits.retryAt, Date.now()), lt(s.visits.attempts, 5))).limit(5);
    for (const row of candidates) {
      const attempt = row.attempts + 1;
      const claimed = await databaseRetry(() => db.update(s.visits).set({ notification: "sending", attempts: attempt, retryAt: Date.now() + 120000 })
        .where(and(eq(s.visits.id, row.id), eq(s.visits.notification, row.notification), eq(s.visits.attempts, row.attempts), eq(s.visits.retryAt, row.retryAt))).returning({ id: s.visits.id }));
      if (!claimed.length) continue;
      let delivered = false;
      try {
        // No customer names/phones sent to Telegram. Details require staff sign-in.
        await sendTelegram(config.chatId, `SOLVAR: новая запись на визит\nНомер: ${row.id}\nОткройте панель: ${new URL("/admin", process.env.WEBSITE_URL!).href}\nЭто запись на посещение, не заказ и не резерв товара.`);
        delivered = true;
      } catch { /* Never log provider URLs, tokens, or customer details. */ }
      await databaseRetry(() => db.update(s.visits).set({ notification: delivered ? "sent" : attempt >= 5 ? "failed" : "retry", retryAt: delivered ? 0 : Date.now() + Math.min(3600000, 15000 * 2 ** attempt) })
        .where(and(eq(s.visits.id, row.id), eq(s.visits.attempts, attempt), eq(s.visits.notification, "sending"))));
    }
    // A process may have stopped during its last attempt. Do not leave leases stuck forever.
    await db.update(s.visits).set({ notification: "failed" }).where(and(eq(s.visits.notification, "sending"), lte(s.visits.retryAt, Date.now()), sql`${s.visits.attempts} >= 5`));
  } finally { ticking = false; }
}
export function startVisitWorker() {
  const timer = setInterval(() => { void tickVisitNotifications().catch(() => console.error("Visit notification worker failed; sensitive details withheld")); }, 15000);
  timer.unref();
}
