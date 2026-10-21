import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import sharp from "sharp";
import { base } from "../__core/app";
import { admin } from "../middleware/admin";
import { db } from "../database";
import * as s from "../database/schema";
import { productSchema, settingsSchema } from "../../shared/shop";
import { invalidatePageCache } from "../services/page-seo";
import { httpsImage, productRuleError } from "../services/product-rules";
import { MAX_IMPORT_BYTES, parseProductImport, productsToCsv, productTemplateCsv } from "../services/product-csv";
import { captchaRequired } from "../services/order-security";
import { ordersAvailable } from "../services/orders";
async function list() {
  return (await db.select().from(s.products))
    .map((x) => productSchema.parse(JSON.parse(x.data)))
    .sort((a, b) => a.sort - b.sort);
}
async function settings() {
  const [r] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
  if (!r) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Выполните db:seed" });
  const data = settingsSchema.parse(JSON.parse(r.data));
  return data;
}
const brandImageOk = (v: string) => !v || httpsImage(v) || /^\/brand\/[A-Za-z0-9_-]+\.(png|webp)$/.test(v) || /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(v);
export const shop = {
  information: base.handler(async () => {
    const s = await settings();
    return { name: s.name, company: s.company, inn: s.inn, ogrn: s.ogrn, phone: s.phone, email: s.email,
      address: s.address, hours: s.hours, privacy: s.privacy, logoMark: s.logoMark, favicon: s.favicon };
  }),
  catalog: base.handler(async () => ({
    // Only published items; internal purchasing fields (cost, demand, priority) never leave the server.
    products: (await list()).filter((item) => item.active).map(({ cost: _cost, demand: _demand, priority: _priority, ...item }) => ({ ...item, cost: 0, demand: 0, priority: "" })),
    settings: await settings(), // Public storefront texts and contacts only; integration secrets live elsewhere.
    ordersEnabled: await ordersAvailable(),
    captchaSiteKey: captchaRequired() ? process.env.TURNSTILE_SITE_KEY || "" : "",
  })),
};
export const management = {
  me: admin.handler(({ context }) => ({ email: context.user.email, role: context.adminRole })),
  catalog: admin.handler(async () => ({ products: await list(), settings: await settings() })),
  saveProduct: admin.input(productSchema).handler(async ({ input }) => {
    const ruleError = productRuleError(input, await list());
    if (ruleError) throw new ORPCError("BAD_REQUEST", { message: ruleError });
    await db
      .insert(s.products)
      .values({ id: input.id, data: JSON.stringify(input) })
      .onConflictDoUpdate({ target: s.products.id, set: { data: JSON.stringify(input) } });
    invalidatePageCache();
    return input;
  }),
  exportProducts: admin.input(z.object({ template: z.boolean().default(false) })).handler(async ({ input }) => {
    const products = input.template ? [] : await list();
    return { filename: input.template ? "solvar-products-template.csv" : `solvar-products-${new Date().toISOString().slice(0, 10)}.csv`, count: products.length, csv: input.template ? productTemplateCsv() : productsToCsv(products) };
  }),
  /** dryRun validates and reports; a real import is all-or-nothing, so a file with any error changes nothing. */
  importProducts: admin.input(z.object({ csv: z.string().min(1).max(MAX_IMPORT_BYTES), dryRun: z.boolean().default(true) })).handler(async ({ input }) => {
    const result = parseProductImport(input.csv, await list());
    const summary = { created: result.created, updated: result.updated, ignoredColumns: result.ignoredColumns, errorCount: result.errors.length, errors: result.errors.slice(0, 50) };
    if (result.errors.length || input.dryRun) return { ...summary, applied: false };
    await db.transaction(async (tx) => {
      for (const product of result.products)
        await tx.insert(s.products).values({ id: product.id, data: JSON.stringify(product) }).onConflictDoUpdate({ target: s.products.id, set: { data: JSON.stringify(product) } });
    });
    invalidatePageCache();
    return { ...summary, applied: true };
  }),
  deleteProduct: admin.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const all = await list();
    if (all.some((p) => p.contents.some((c) => c.productId === input.id)))
      throw new ORPCError("CONFLICT", {
        message: "Товар входит в набор. Уберите его из состава или скройте товар.",
      });
    await db.delete(s.products).where(eq(s.products.id, input.id));
    invalidatePageCache();
    return { ok: true };
  }),
  saveBrand: admin.input(z.object({ logoMark: settingsSchema.shape.logoMark, logoHero: settingsSchema.shape.logoHero, favicon: settingsSchema.shape.favicon })).handler(async ({ input }) => {
    for (const value of Object.values(input)) if (!brandImageOk(value)) throw new ORPCError("BAD_REQUEST", { message: "Недопустимое изображение" });
    const rows = await db.all(sql`UPDATE shop_settings SET data = json_set(data, '$.logoMark', ${input.logoMark}, '$.logoHero', ${input.logoHero}, '$.favicon', ${input.favicon}) WHERE id = 'main' RETURNING id`);
    if (!rows.length) throw new ORPCError("PRECONDITION_FAILED", { message: "Настройки не инициализированы" });
    invalidatePageCache();
    return { ok: true };
  }),
  saveSettings: admin.input(settingsSchema).handler(async ({ input }) => {
    for (const url of [input.telegram, input.vk, input.avito])
      if (url && !url.startsWith("https://"))
        throw new ORPCError("BAD_REQUEST", { message: "Соцсети: используйте HTTPS-ссылки" });
    for (const v of [input.logoMark, input.logoHero, input.favicon])
      if (!brandImageOk(v))
        throw new ORPCError("BAD_REQUEST", { message: "Логотип: загрузите файл или укажите HTTPS-ссылку" });
    await db
      .insert(s.settings)
      .values({ id: "main", data: JSON.stringify(input) })
      .onConflictDoUpdate({ target: s.settings.id, set: { data: sql`json_set(${JSON.stringify(input)}, '$.logoMark', json_extract(shop_settings.data, '$.logoMark'), '$.logoHero', json_extract(shop_settings.data, '$.logoHero'), '$.favicon', json_extract(shop_settings.data, '$.favicon'))` } });
    invalidatePageCache();
    return input;
  }),
  upload: admin.input(z.object({ data: z.string().max(3000000) })).handler(async ({ input }) => {
    const m = input.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new ORPCError("BAD_REQUEST", { message: "Только JPG, PNG или WebP, до 2 МБ" });
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > 2 * 1024 * 1024)
      throw new ORPCError("BAD_REQUEST", { message: "Максимальный размер — 2 МБ" });
    try {
      const out = await sharp(buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return { image: "data:image/webp;base64," + out.toString("base64") };
    } catch {
      throw new ORPCError("BAD_REQUEST", { message: "Не удалось прочитать изображение" });
    }
  }),
  uploadLogo: admin
    .input(z.object({ data: z.string().max(3000000), kind: z.enum(["logoMark", "logoHero", "favicon"]) }))
    .handler(async ({ input }) => {
      const m = input.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) throw new ORPCError("BAD_REQUEST", { message: "Только PNG, JPG или WebP, до 2 МБ" });
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > 2 * 1024 * 1024)
        throw new ORPCError("BAD_REQUEST", { message: "Максимальный размер — 2 МБ" });
      try {
        const img = sharp(buffer, { limitInputPixels: 25000000 }).rotate();
        if (input.kind === "favicon") {
          const out = await img
            .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          return { image: "data:image/png;base64," + out.toString("base64") };
        }
        const out = await img
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 90, alphaQuality: 100 })
          .toBuffer();
        return { image: "data:image/webp;base64," + out.toString("base64") };
      } catch {
        throw new ORPCError("BAD_REQUEST", { message: "Не удалось прочитать изображение" });
      }
    }),
};
