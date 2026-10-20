import { z } from "zod";
export const visitStatus = z.enum(["new", "contacted", "scheduled", "completed", "cancelled"]);
export const visitLabels: Record<z.infer<typeof visitStatus>, string> = { new: "Новая", contacted: "Связались", scheduled: "Встреча согласована", completed: "Визит состоялся", cancelled: "Отменена" };
export const visitConfigSchema = z.object({ enabled: z.boolean().default(false), telegramEnabled: z.boolean().default(false), chatId: z.string().trim().regex(/^$|^-?\d{1,20}$/).default("") }).strict();
export const visitInputSchema = z.object({
  requestId: z.string().uuid(), name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(24).regex(/^\+?[\d\s()\-]+$/).refine(v => { const n = v.replace(/\D/g, "").length; return n >= 10 && n <= 15; }),
  preferredAt: z.iso.datetime({ offset: true }), consent: z.literal(true), policyHash: z.string().length(64), captchaToken: z.string().max(4096).default(""),
}).strict();
export const visitUpdateSchema = z.object({ id: z.string().uuid(), version: z.number().int().min(0), status: visitStatus, managerId: z.string().max(100), appointmentAt: z.union([z.literal(""), z.iso.datetime({ offset: true })]) }).strict();
