import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { staff, owner } from "../middleware/admin";
import { db } from "../database";
import * as s from "../database/schema";
import { visitConfigSchema, visitInputSchema, visitUpdateSchema } from "../../shared/visits";
import { checkOrigin, sendTelegram } from "../services/orders";
import { normalizePhone, persistentRate, privateHash, verifyCaptcha } from "../services/order-security";
import { getVisitConfig, visitPublicConfig, visitCaptchaRequired } from "../services/visits";
import { databaseRetry } from "../services/database-retry";
const fail = (message: string) => new ORPCError("PRECONDITION_FAILED", { message });
export const visitPublic = {
  config: base.handler(visitPublicConfig),
  create: base.input(visitInputSchema).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    const config = await visitPublicConfig();
    if (!config.enabled) throw fail("Запись на визит пока недоступна. Свяжитесь с магазином по телефону.");
    if (config.policyHash !== input.policyHash) throw fail("Политика обновилась. Обновите страницу и подтвердите согласие ещё раз.");
    const date = Date.parse(input.preferredAt);
    if (date < Date.now() || date > Date.now() + 90 * 86400000) throw fail("Выберите будущее время в пределах 90 дней.");
    const phone = normalizePhone(input.phone);
    const requestHash = privateHash(JSON.stringify([input.name, phone, input.preferredAt, input.policyHash]));
    await persistentRate("visit-ip:" + context.clientIp, 10, 3600000);
    const [existing] = await db.select({ hash: s.visits.requestHash }).from(s.visits).where(eq(s.visits.id, input.requestId));
    if (existing) {
      if (existing.hash !== requestHash) throw new ORPCError("CONFLICT", { message: "Начните новую запись." });
      return { id: input.requestId, created: true };
    }
    await verifyCaptcha(input.captchaToken, context.clientIp, "visit", visitCaptchaRequired());
    await persistentRate("visit-phone:" + phone, 2, 3600000);
    await persistentRate("visit-global", 60, 60000);
    const notification = await getVisitConfig();
    await databaseRetry(() => db.insert(s.visits).values({ id: input.requestId, requestHash, createdAt: new Date().toISOString(), name: input.name, phone, preferredAt: input.preferredAt, policyHash: input.policyHash, policyText: config.privacy,
      notification: notification.telegramEnabled ? "pending" : "disabled" }).onConflictDoNothing());
    const [saved] = await db.select({ hash: s.visits.requestHash }).from(s.visits).where(eq(s.visits.id, input.requestId));
    if (saved?.hash !== requestHash) throw new ORPCError("CONFLICT");
    return { id: input.requestId, created: true };
  }),
};
export const visitStaff = {
  me: staff.handler(({ context }) => ({ email: context.user.email, id: context.user.id, role: context.adminRole })),
  list: staff.input(z.object({ page: z.number().int().min(0).max(100000).default(0), status: z.enum(["all", "new", "contacted", "scheduled", "completed", "cancelled"]).default("all") })).handler(async ({ input, context }) => {
    const scope = context.adminRole === "manager" ? or(eq(s.visits.managerId, context.user.id), eq(s.visits.managerId, "")) : undefined;
    const filter = and(scope, input.status === "all" ? undefined : eq(s.visits.status, input.status));
    const rows = await db.select({ id: s.visits.id, name: s.visits.name, phone: s.visits.phone, createdAt: s.visits.createdAt, preferredAt: s.visits.preferredAt, appointmentAt: s.visits.appointmentAt, managerId: s.visits.managerId, status: s.visits.status, version: s.visits.version, notification: s.visits.notification, attempts: s.visits.attempts }).from(s.visits).where(filter).orderBy(desc(s.visits.createdAt), desc(s.visits.id)).limit(51).offset(input.page * 50);
    const members = await db.select({ id: s.user.id, name: s.user.name, role: s.adminMembers.role }).from(s.adminMembers).innerJoin(s.user, eq(s.user.id, s.adminMembers.userId)).where(eq(s.adminMembers.active, true));
    return { rows: rows.slice(0, 50), hasMore: rows.length > 50, members };
  }),
  update: staff.input(visitUpdateSchema).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    if (input.status === "scheduled" && (!input.appointmentAt || !input.managerId)) throw fail("Для согласованной встречи выберите ответственного и время.");
    if (input.appointmentAt && (Date.parse(input.appointmentAt) < Date.now() || Date.parse(input.appointmentAt) > Date.now() + 90 * 86400000) && input.status === "scheduled") throw fail("Согласуйте будущее время в пределах 90 дней.");
    await databaseRetry(() => db.transaction(async tx => {
      const [current] = await tx.select().from(s.visits).where(eq(s.visits.id, input.id));
      if (!current) throw new ORPCError("NOT_FOUND");
      if (context.adminRole === "manager" && ((current.managerId && current.managerId !== context.user.id) || input.managerId !== context.user.id)) throw new ORPCError("FORBIDDEN", { message: "Менеджер может взять свободную запись только себе и изменять только свои записи." });
      if (input.managerId) {
        const [member] = await tx.select().from(s.adminMembers).where(eq(s.adminMembers.userId, input.managerId));
        if (!member?.active || !["owner", "admin", "manager"].includes(member.role)) throw fail("Сотрудник недоступен.");
      }
      const changed = await tx.update(s.visits).set({ status: input.status, managerId: input.managerId, appointmentAt: input.appointmentAt, version: sql`${s.visits.version} + 1` }).where(and(eq(s.visits.id, input.id), eq(s.visits.version, input.version))).returning({ id: s.visits.id });
      if (!changed.length) throw new ORPCError("CONFLICT", { message: "Запись уже изменена. Обновите список." });
      await tx.insert(s.visitEvents).values({ id: crypto.randomUUID(), visitId: input.id, actorId: context.user.id, action: `status:${input.status};manager:${input.managerId};time:${input.appointmentAt}`, at: new Date().toISOString() });
    }));
    return { ok: true };
  }),
};
export const visitOwner = {
  config: owner.handler(async () => ({ ...await visitPublicConfig(), ...await getVisitConfig(), tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN?.trim() })),
  saveConfig: owner.input(visitConfigSchema).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    const current = await visitPublicConfig();
    if (input.enabled && !current.ready) throw fail("Укажите адрес и политику (минимум 50 символов), настройте CAPTCHA на сервере.");
    if (input.telegramEnabled && (!input.chatId || !process.env.TELEGRAM_BOT_TOKEN?.trim())) throw fail("Нужны Chat ID и токен в .env.");
    await db.insert(s.visitConfig).values({ id: "main", data: JSON.stringify(input) }).onConflictDoUpdate({ target: s.visitConfig.id, set: { data: JSON.stringify(input) } });
    return { ok: true };
  }),
  testTelegram: owner.handler(async ({ context }) => {
    checkOrigin(context.headers);
    await persistentRate("visit-telegram-test:" + context.user.id, 3, 3600000);
    const config = await getVisitConfig();
    if (!config.chatId || !process.env.TELEGRAM_BOT_TOKEN?.trim()) throw fail("Сначала сохраните Chat ID и задайте токен в .env.");
    try { await sendTelegram(config.chatId, "SOLVAR: тест уведомлений о записи на визит. Подключение работает."); }
    catch { throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Telegram не подтвердил отправку. Проверьте токен, Chat ID и /start в боте." }); }
    return { ok: true };
  }),
  retry: owner.input(z.object({ id: z.string().uuid() })).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    const config = await getVisitConfig();
    if (!config.telegramEnabled) throw fail("Уведомления выключены.");
    const changed = await db.update(s.visits).set({ notification: "pending", attempts: 0, retryAt: 0 }).where(and(eq(s.visits.id, input.id), eq(s.visits.notification, "failed"))).returning({ id: s.visits.id });
    if (!changed.length) throw fail("Повтор доступен только после окончательной ошибки доставки.");
    return { ok: true };
  }),
  remove: owner.input(z.object({ id: z.string().uuid() })).handler(async ({ input, context }) => {
    checkOrigin(context.headers);
    await databaseRetry(() => db.transaction(async tx => {
      const rows = await tx.delete(s.visits).where(and(eq(s.visits.id, input.id), or(eq(s.visits.status, "completed"), eq(s.visits.status, "cancelled")), sql`${s.visits.notification} != 'sending'`)).returning({ id: s.visits.id });
      if (!rows.length) throw fail("Удалять можно только завершённые/отменённые записи без активной отправки.");
      await tx.delete(s.visitEvents).where(eq(s.visitEvents.visitId, input.id));
    }));
    return { ok: true };
  }),
};
