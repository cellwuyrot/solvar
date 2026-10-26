import { z } from "zod";
export const sectionSchema = z.enum(["sets", "cigars", "cigarettes", "accessories", "tobacco"]);
export type SectionId = z.infer<typeof sectionSchema>;
export const productSchema = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(50),
  name: z.string().trim().min(1).max(200),
  seoTitle: z.string().trim().max(160).default(""),
  seoDescription: z.string().trim().max(320).default(""),
  seoNoindex: z.boolean().default(false),
  section: sectionSchema,
  country: z.string().max(60).default(""),
  category: z.string().max(100).default(""),
  brand: z.string().max(120).default(""),
  sub: z.string().max(1500).default(""),
  description: z.string().max(6000).default(""),
  weight: z.string().max(1000).default(""),
  price: z.number().nonnegative().max(1000000),
  oldPrice: z.number().nonnegative().max(1000000).nullable().default(null),
  spice: z.number().int().min(0).max(5).default(0),
  availability: z.enum(["unknown", "in_stock", "out_of_stock"]).default("unknown"),
  ingredients: z.string().max(3000).default(""),
  allergens: z.string().max(1000).default(""),
  storage: z.string().max(1000).default(""),
  shelfLife: z.string().max(500).default(""),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  badge: z.string().max(60).default(""),
  image: z.string().max(3000000).default(""),
  contents: z
    .array(z.object({ productId: z.string().max(50), qty: z.number().int().min(1).max(100) }))
    .max(100)
    .default([]),
  people: z.string().max(50).default(""),
  extras: z.string().max(1500).default(""),
  season: z.string().max(100).default(""),
  cost: z.number().nonnegative().max(1000000).default(0),
  priority: z.string().max(5).default(""),
  demand: z.number().min(0).max(5).default(0),
  sort: z.number().int().default(0),
});
export type Product = z.infer<typeof productSchema>;
export const settingsSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().max(150),
  heroTitle: z.string().max(250),
  heroText: z.string().max(1500),
  company: z.string().max(200),
  inn: z.string().refine((s) => !s || /^\d{10}(\d{2})?$/.test(s), "ИНН: 10 или 12 цифр"),
  ogrn: z.string().refine((s) => !s || /^\d{13}(\d{2})?$/.test(s), "ОГРН: 13 или 15 цифр"),
  phone: z.string().max(60),
  email: z
    .string()
    .refine((s) => !s || z.string().email().safeParse(s).success, "Некорректный email"),
  address: z.string().max(500),
  hours: z.string().max(150),
  telegram: z.string().max(300),
  vk: z.string().max(300),
  avito: z.string().max(300),
  freeShipping: z.number().min(0).max(1000000),
  deliveryFee: z.number().min(0).max(100000),
  delivery: z.string().max(30000),
  payment: z.string().max(30000),
  privacy: z.string().max(30000),
  offer: z.string().max(30000),
  returns: z.string().max(30000),
  about: z.string().max(10000),
  // Brand images, editable in admin → «Логотип». Empty string = built-in SOLVAR files from /brand.
  logoMark: z.string().max(3000000).default(""),
  logoHero: z.string().max(3000000).default(""),
  favicon: z.string().max(1000000).default(""),
});
export const BRAND_DEFAULTS = {
  logoMark: "/brand/solvar-s.png",
  logoHero: "/brand/solvar-s.png",
  favicon: "/brand/favicon-32.png",
} as const;
export function brandImage(settings: Partial<Settings> | undefined, key: keyof typeof BRAND_DEFAULTS) {
  return settings?.[key] || BRAND_DEFAULTS[key];
}
export type Settings = z.infer<typeof settingsSchema>;

/** Keep the public brand consistent when settings were carried over from the former CHERNOGOR name. */
export function normalizeSettings(value: unknown): Settings {
  const parsed = settingsSchema.parse(value);
  const normalized = { ...parsed };
  const normalize = (text: string) => text.replace(/chernogor/gi, "Solvar").replace(/черногор/gi, "Solvar");
  for (const key of ["name", "tagline", "heroTitle", "heroText", "delivery", "payment", "privacy", "offer", "returns", "about"] as const) {
    normalized[key] = normalize(normalized[key]);
  }
  if (/информация о способах оплаты готовится/i.test(normalized.payment) || /онлайн-оплата пока не подключена/i.test(normalized.payment)) {
    normalized.payment = "Информация по оплате предоставляется менеджером";
  }
  return normalized;
}
export const initialSettings: Settings = {
  name: "SOLVAR",
  tagline: "SOLVAR — Эстетика характера.",
  heroTitle: "Эстетика\nхарактера.",
  heroText:
    "Сигары, табак и аксессуары в сдержанной эстетике. Каталог с прозрачными характеристиками, актуальным наличием и вниманием к деталям.",
  company: "",
  inn: "",
  ogrn: "",
  phone: "",
  email: "",
  address: "",
  hours: "",
  telegram: "",
  vk: "",
  avito: "",
  freeShipping: 0,
  deliveryFee: 0,
  logoMark: "",
  logoHero: "",
  favicon: "",
  about:
    "SOLVAR — каталог сигар, табака и аксессуаров. Условия предложения, продажи и доставки должны соответствовать законодательству страны, в которой работает магазин.",
  delivery:
    "Информация о доставке готовится. Уточните регионы, сроки, стоимость и условия перевозки у продавца перед оформлением заказа.",
  payment: "Информация по оплате предоставляется менеджером",
  privacy:
    "Политика конфиденциальности пока не опубликована. Продавцу необходимо заполнить сведения об операторе, целях и основаниях обработки, сроках хранения и порядке реализации прав субъекта персональных данных до запуска приёма заказов.",
  offer:
    "Публичная оферта пока не опубликована. Укажите реквизиты продавца, условия продажи, оплаты и доставки перед запуском магазина.",
  returns:
    "Условия возврата не настроены. До включения приёма заказов укажите реальные реквизиты продавца и порядок обращений с учётом законодательства страны продаж.",
};
export { SECTIONS, rub } from "./catalog-display";
