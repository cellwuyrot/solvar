import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/api/database";
import * as s from "../src/api/database/schema";
import seed from "../src/shared/catalog-seed.json";
import { initialSettings, productSchema, settingsSchema } from "../src/shared/shop";
import { eq } from "drizzle-orm";

if (process.env.SOLVAR_MIGRATE_CATALOG !== "YES") {
  throw new Error("Ничего не изменено. Для явной замены старого каталога задайте SOLVAR_MIGRATE_CATALOG=YES после резервного копирования.");
}

const oldProducts = await db.select().from(s.products);
const [settingsRow] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
const backupDir = resolve(process.cwd(), "../../backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(backupDir, `solvar-before-catalog-migration-${stamp}.json`);
await writeFile(backupPath, JSON.stringify({ backedUpAt: new Date().toISOString(), products: oldProducts, settings: settingsRow || null }, null, 2), { flag: "wx" });

let nextSettings = initialSettings;
if (settingsRow) {
  try {
    const old = settingsSchema.parse(JSON.parse(settingsRow.data));
    nextSettings = settingsSchema.parse({
      ...old,
      name: "SOLVAR",
      tagline: initialSettings.tagline,
      heroTitle: initialSettings.heroTitle,
      heroText: initialSettings.heroText,
      about: initialSettings.about,
      returns: /продукт(?:ы|ов|ами)? питания/i.test(old.returns) ? initialSettings.returns : old.returns,
    });
  } catch {
    nextSettings = initialSettings;
  }
}

await db.transaction(async (tx) => {
  // The archive is saved before this transaction. Orders and order history tables are untouched.
  await tx.delete(s.products);
  for (const item of seed) {
    const product = productSchema.parse(item);
    await tx.insert(s.products).values({ id: product.id, data: JSON.stringify(product) });
  }
  await tx.insert(s.settings).values({ id: "main", data: JSON.stringify(nextSettings) })
    .onConflictDoUpdate({ target: s.settings.id, set: { data: JSON.stringify(nextSettings) } });
});

console.log(`SOLVAR migration complete: archived ${oldProducts.length} catalogue rows to ${backupPath}`);
console.log(`Inserted ${seed.length} hidden templates. Existing admin account, customer orders, order history and integration settings were not deleted.`);
console.log("Review legal pages, contacts and age-verification requirements before enabling order intake.");
