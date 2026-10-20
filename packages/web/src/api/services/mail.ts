import nodemailer from "nodemailer";
import { z } from "zod";

/** Standard SMTP transport. Trioz connection values must come from the owner's panel,
 * not from its panel URL. No secrets or message bodies are logged or returned. */
export const smtpConfigured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_FROM && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD;
export function smtpOptions() {
  if (!smtpConfigured()) throw new Error("SMTP не настроен");
  const host = process.env.SMTP_HOST!.trim();
  if (!/^[A-Za-z0-9.:-]+$/.test(host)) throw new Error("Недопустимый SMTP_HOST");
  const secure = process.env.SMTP_SECURE !== "false";
  const port = Number(process.env.SMTP_PORT || (secure ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Недопустимый SMTP_PORT");
  const local = process.env.NODE_ENV !== "production" && process.env.SMTP_ALLOW_INSECURE_LOCAL === "true" && ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!z.email().safeParse(process.env.SMTP_FROM).success) throw new Error("SMTP_FROM должен содержать подтверждённый email без имени и заголовков");
  return { host, port, secure, requireTLS: !secure && !local,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! }, tls: { rejectUnauthorized: true },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000, disableFileAccess: true, disableUrlAccess: true };
}
export async function sendEmail(to: string, subject: string, text: string) {
  if (!z.email().safeParse(to).success || /[\r\n]/.test(subject) || subject.length > 200 || text.length > 16000) throw new Error("Недопустимое письмо");
  const transport = nodemailer.createTransport(smtpOptions());
  try {
    const result = await transport.sendMail({ from: process.env.SMTP_FROM!, to, subject, text });
    if (!result.accepted?.some(value => String(value).toLowerCase() === to.toLowerCase()) || result.rejected?.length) throw new Error("Recipient rejected");
    return { acceptedByProvider: true as const }; // NOT proof of recipient/inbox delivery.
  } catch { throw new Error("SMTP не подтвердил приём сообщения. Доставка не подтверждена."); }
  finally { transport.close(); }
}
