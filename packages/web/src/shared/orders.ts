import { z } from "zod";
export const orderInputSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(40).regex(/^[+\d\s()-]+$/)
    .refine(v => v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15),
  email: z.string().trim().max(254).refine(v => !v || z.email().safeParse(v).success, "Некорректный email").default(""),
  captchaToken: z.string().max(2048).default(""),
  comment: z.string().trim().max(500).default(""),
  consent: z.literal(true),
  website: z.string().max(100).default(""),
  expectedTotalKopecks: z.number().int().nonnegative(),
  items: z.array(z.object({ productId: z.string().max(50), qty: z.number().int().min(1).max(99) })).min(1).max(50),
});
export const integrationSchema = z.object({
  enabled: z.boolean().default(false),
  chatId: z.string().trim().max(30).refine(v => !v || /^-?\d+$/.test(v), "Chat ID должен быть числом").default(""),
  telegramEnabled: z.boolean().default(true),
  emailEnabled: z.boolean().default(false),
  notifyEmail: z.string().trim().max(254).refine(v => !v || z.email().safeParse(v).success, "Некорректный email").default(""),
  documentsReady: z.boolean().default(false),
});
export const orderStatusSchema = z.enum(["new", "contacted", "confirmed", "completed", "cancelled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export const statusLabels: Record<OrderStatus, string> = {
  new: "Новая", contacted: "Связались", confirmed: "Подтверждена", completed: "Завершена", cancelled: "Отменена",
};
export type OrderSnapshot = {
  name: string; phone: string; email?: string; comment: string;
  items: { productId: string; name: string; qty: number; priceKopecks: number }[];
  subtotalKopecks: number; deliveryKopecks: number; totalKopecks: number;
  consent: { acceptedAt: string; policyHash: string; policyText?: string; text: string };
};
