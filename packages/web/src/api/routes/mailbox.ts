import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { admin } from "../middleware/admin";
import { sendEmail, smtpConfigured } from "../services/mail";
import { listMailboxMessages, mailboxAccount, mailboxConfigured, readMailboxMessage } from "../services/mailbox-imap";

export const mailboxManagement = {
  mailboxStatus: admin.handler(async () => ({
    configured: mailboxConfigured(),
    smtpConfigured: smtpConfigured(),
    account: mailboxAccount(),
  })),
  mailboxMessages: admin.input(z.object({ limit: z.number().int().min(1).max(30).default(20) })).handler(async ({ input }) => {
    if (!mailboxConfigured()) throw new ORPCError("PRECONDITION_FAILED", { message: "Почта не настроена. Добавьте IMAP/SMTP-параметры в серверный .env." });
    try { return { messages: await listMailboxMessages(input.limit) }; }
    catch { throw new ORPCError("BAD_GATEWAY", { message: "Не удалось получить письма. Проверьте IMAP-настройки и пароль в .env." }); }
  }),
  mailboxMessage: admin.input(z.object({ uid: z.string().regex(/^\d{1,20}$/) })).handler(async ({ input }) => {
    if (!mailboxConfigured()) throw new ORPCError("PRECONDITION_FAILED", { message: "Почта не настроена. Добавьте IMAP/SMTP-параметры в серверный .env." });
    try {
      const message = await readMailboxMessage(input.uid);
      if (!message) throw new ORPCError("NOT_FOUND", { message: "Письмо не найдено или оно было удалено." });
      return message;
    } catch (error) {
      if (error instanceof ORPCError) throw error;
      throw new ORPCError("BAD_GATEWAY", { message: "Не удалось открыть письмо. Проверьте подключение к IMAP." });
    }
  }),
  sendMailboxEmail: admin.input(z.object({
    to: z.email().trim().max(254),
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(16000),
  })).handler(async ({ input, context }) => {
    if (!smtpConfigured()) throw new ORPCError("PRECONDITION_FAILED", { message: "SMTP не настроен. Проверьте настройки почты в .env." });
    if (/[\r\n]/.test(input.subject)) throw new ORPCError("BAD_REQUEST", { message: "Тема письма содержит недопустимые символы." });
    try {
      await sendEmail(input.to, input.subject, input.text);
      console.info(`Mailbox email accepted by SMTP for ${input.to}; sender ${context.user.email}`);
      return { ok: true };
    } catch {
      throw new ORPCError("BAD_GATEWAY", { message: "SMTP не подтвердил приём письма. Проверьте настройки; доставка адресату не гарантируется." });
    }
  }),
};
