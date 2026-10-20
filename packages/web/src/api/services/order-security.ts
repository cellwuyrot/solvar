import { databaseRetry } from "./database-retry";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";

const secret = () => { const key = process.env.ORDER_GUARD_SECRET || process.env.BETTER_AUTH_SECRET || "";
  if (key.length < 32) throw new Error("Order security secret must contain 32+ characters"); return key; };
export const privateHash = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");
export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "7" + digits;
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  return "+" + digits;
}
export function issueDevice() {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), expires: Date.now() + 7 * 86400000 })).toString("base64url");
  return payload + "." + privateHash(payload);
}
export function deviceId(headers: Headers) {
  const cookieName = "solvar-order-device=";
  const token = headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName))?.slice(cookieName.length);
  if (!token || token.length > 1024 || token.split(".").length !== 2) return "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !/^[a-f0-9]{64}$/.test(sig)) return "";
  const expected = privateHash(payload);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return "";
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.id === "string" && /^[a-f0-9-]{36}$/.test(data.id) && data.expires > Date.now() ? data.id : "";
  } catch { return ""; }
}
export async function persistentRate(key: string, max: number, windowMs: number) {
  const at = Date.now();
  const hashed = privateHash(key);
  const rows = await databaseRetry(() => db.all(sql`INSERT INTO shop_order_rate_limits (key, window_start, hits) VALUES (${hashed}, ${at}, 1)
    ON CONFLICT(key) DO UPDATE SET
      hits = CASE WHEN window_start <= ${at - windowMs} THEN 1 ELSE hits + 1 END,
      window_start = CASE WHEN window_start <= ${at - windowMs} THEN ${at} ELSE window_start END
    WHERE window_start <= ${at - windowMs} OR hits < ${max} RETURNING hits`));
  if (!rows.length) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Слишком много попыток. Попробуйте позже." });
}
export function resolveClientIp(headers: Headers, peer: string | null | undefined) {
  const raw = peer?.replace(/^::ffff:/, "") || "unknown";
  const trusted = (process.env.TRUSTED_PROXY_IPS || "").split(",").map(v => v.trim()).filter(Boolean);
  const forwarded = headers.get("x-real-ip") || "";
  return trusted.includes(raw) && isIP(forwarded) ? forwarded : raw;
}
// Cheap bounded ingress limiter before body parsing/DB. DDoS traffic must also be filtered at the edge.
const ingress = new Map<string, { at: number; hits: number }>();
export function ingressAllowed(ip: string, bucket: string, max: number, windowMs = 60000) {
  const now = Date.now();
  for (const [key, v] of ingress) if (v.at < now - windowMs) ingress.delete(key);
  const key = privateHash(`${bucket}:${ip}`);
  const entry = ingress.get(key) || { at: now, hits: 0 };
  if (!ingress.has(key) && ingress.size >= 10000) return false;
  entry.hits++; ingress.set(key, entry);
  return entry.hits <= max;
}
export const captchaRequired = () => process.env.ORDER_CAPTCHA_REQUIRED === "true" || (process.env.NODE_ENV === "production" && process.env.ORDER_CAPTCHA_REQUIRED !== "false");
export const captchaConfigured = () => !!process.env.TURNSTILE_SITE_KEY && !!process.env.TURNSTILE_SECRET_KEY;
export async function verifyCaptcha(token: string, ip: string, action = "order", required = captchaRequired()) {
  if (!required) return;
  if (!captchaConfigured() || !token) throw new ORPCError("BAD_REQUEST", { message: "Подтвердите проверку от роботов" });
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip, idempotency_key: randomUUID() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error();
    result = await response.json() as typeof result;
  } catch { throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Проверка от роботов временно недоступна" }); }
  const hostname = new URL(process.env.WEBSITE_URL!).hostname;
  if (!result.success || result.hostname !== hostname || result.action !== action)
    throw new ORPCError("BAD_REQUEST", { message: "Проверка от роботов не пройдена. Повторите её." });
}
