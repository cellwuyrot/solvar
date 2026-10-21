import { parseCsv, safeCell, toCsv } from "../../shared/csv";
import { PRODUCT_COLUMNS, productCsvColumnFromHeader, type ProductCsvColumn } from "../../shared/product-import";
import { productSchema, SECTIONS, type Product } from "../../shared/shop";
import { httpsImage, productRuleError } from "./product-rules";

type Column = ProductCsvColumn;
export { PRODUCT_COLUMNS } from "../../shared/product-import";
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_500_000; // characters; keeps the JSON request under the global body limit

const SECTION_NAMES: Record<string, Product["section"]> = { "коллекции": "sets", "коллекция": "sets", "набор": "sets", "наборы": "sets", "сигары": "cigars", "сигара": "cigars", "табак": "tobacco", "аксессуары": "accessories", "аксессуар": "accessories" };
const AVAILABILITY: Record<string, Product["availability"]> = { "в наличии": "in_stock", "есть": "in_stock", "нет в наличии": "out_of_stock", "нет": "out_of_stock", "уточняется": "unknown", "": "unknown" };
const NUMERIC = new Set<Column>(["price", "oldPrice", "spice", "cost", "demand", "sort"]);
const BOOLEAN = new Set<Column>(["active", "featured", "seoNoindex"]);
// Empty cell keeps the stored value for these columns (an exported file never has them empty unless unset).
const KEEP_WHEN_EMPTY = new Set<Column>(["section", "availability", "image", "price", "spice", "cost", "demand", "sort", ...BOOLEAN]);

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function productsToCsv(products: Product[]) {
  const rows = products.map(p => PRODUCT_COLUMNS.map(column => {
    if (column === "contents") return p.contents.map(c => `${c.productId}:${c.qty}`).join("|");
    if (column === "image") return httpsImage(p.image) ? p.image : ""; // embedded uploads are not exported; leaving it empty keeps the stored image on re-import
    const value = p[column];
    return typeof value === "string" ? safeCell(value) : value;
  }));
  return toCsv([[...PRODUCT_COLUMNS], ...rows]);
}
export function productTemplateCsv() {
  return toCsv([[...PRODUCT_COLUMNS],
    ["CIGAR_001", "Название сигары", "cigars", 1500, "", "in_stock", 1, 0, "", "Куба", "Робусто", "Бренд", "Короткое описание", "Полное описание", "50 г", 3, "", "", "", "", "", "", 0, "https://example.com/photo.jpg", "", "", "", "", 0, "", 0, 10]]);
}

function parseBoolean(v: string): boolean | undefined {
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "да", "y", "д"].includes(t)) return true;
  if (["0", "false", "no", "нет", "n", "н"].includes(t)) return false;
  return undefined;
}
function parseNumber(v: string): number | undefined {
  const t = v.replace(/[\s\u00a0₽]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

/** External systems often use SKUs with spaces or punctuation. Map those values to a stable, valid catalogue ID. */
function externalIdToProductId(value: string, salt = ""): string {
  let hash = 2166136261;
  for (const ch of `${value}${salt}`) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `IMP_${(hash >>> 0).toString(36).toUpperCase()}`;
}

export type ImportError = { row: number; field?: string; message: string };
export type ImportResult = { created: number; updated: number; errors: ImportError[]; ignoredColumns: string[]; products: Product[] };

export function parseProductImport(csv: string, existing: Product[]): ImportResult {
  const fail = (message: string): ImportResult => ({ created: 0, updated: 0, errors: [{ row: 0, message }], ignoredColumns: [], products: [] });
  if (csv.length > MAX_IMPORT_BYTES) return fail("Файл слишком большой (максимум около 1,5 МБ; разбейте на части)");
  let table: string[][];
  try { table = parseCsv(csv); } catch (e) { return fail(e instanceof Error ? e.message : "Не удалось прочитать CSV"); }
  if (table.length < 2) return fail("В файле нет строк с товарами");
  if (table.length - 1 > MAX_IMPORT_ROWS) return fail(`Слишком много строк (максимум ${MAX_IMPORT_ROWS})`);

  const ignoredColumns: string[] = []; const columns: (Column | null)[] = [];
  for (const raw of table[0]) {
    const header = raw.trim().replace(/^\uFEFF/, "");
    const key = productCsvColumnFromHeader(header);
    if (!key || columns.includes(key)) { if (header) ignoredColumns.push(header); columns.push(null); } else columns.push(key);
  }
  if (!columns.includes("name") && !columns.includes("id")) return fail("Нужна колонка name (название) или id (артикул). Скачайте шаблон.");

  const byId = new Map(existing.map(p => [p.id, p]));
  // Pre-map external IDs before rows are parsed so bundle contents can use the same IDs even when the source SKU contains punctuation.
  const idColumnIndex = columns.indexOf("id");
  const externalIdMap = new Map<string, string>();
  if (idColumnIndex >= 0) {
    for (const cells of table.slice(1)) {
      const sourceId = (cells[idColumnIndex] ?? "").trim();
      if (!sourceId || /^[A-Za-z0-9_-]{1,50}$/.test(sourceId) || externalIdMap.has(sourceId)) continue;
      let salt = "";
      let safeId = externalIdToProductId(sourceId);
      while ([...externalIdMap.entries()].some(([key, value]) => key !== sourceId && value === safeId)) {
        salt = `${salt}x`;
        safeId = externalIdToProductId(sourceId, salt);
      }
      externalIdMap.set(sourceId, safeId);
    }
  }
  const errors: ImportError[] = []; const candidates: { product: Product; isNew: boolean; row: number }[] = []; const seen = new Set<string>();
  table.slice(1).forEach((cells, index) => {
    const row = index + 2; const record: Record<string, unknown> = {}; let bad = false;
    const problem = (field: string, message: string) => { errors.push({ row, field, message }); bad = true; };
    const cell = (column: Column) => { const i = columns.indexOf(column); return i < 0 ? undefined : (cells[i] ?? "").trim(); };
    const rawId = cell("id") || "";
    const id = (rawId && externalIdMap.get(rawId)) || rawId || `P_${Date.now().toString(36)}_${index}`;
    if (seen.has(id)) { problem("id", `Повторяющийся id «${id}» в файле`); return; }
    seen.add(id);
    const previous = byId.get(id);
    for (const column of PRODUCT_COLUMNS) {
      const value = cell(column); if (value === undefined || column === "id") continue;
      if (value === "") {
        if (column === "oldPrice") record.oldPrice = null;
        else if (column === "contents") record.contents = [];
        else if (!KEEP_WHEN_EMPTY.has(column)) record[column] = ""; // empty text cell clears the field; numbers/flags/section/image keep the stored value
        continue;
      }
      if (NUMERIC.has(column)) { const n = parseNumber(value); if (n === undefined) problem(column, `${column}: «${value}» не число`); else record[column] = n; }
      else if (BOOLEAN.has(column)) { const b = parseBoolean(value); if (b === undefined) problem(column, `${column}: используйте 1/0 или да/нет`); else record[column] = b; }
      else if (column === "section") { const section = SECTION_NAMES[value.toLowerCase()] || (value in SECTIONS ? value : undefined); if (!section) problem("section", `section: «${value}» неизвестен (sets, cigars, tobacco, accessories)`); else record.section = section; }
      else if (column === "availability") { const a = AVAILABILITY[value.toLowerCase()] || (["unknown", "in_stock", "out_of_stock"].includes(value) ? value : undefined); if (!a) problem("availability", `availability: «${value}» неизвестно (in_stock, out_of_stock, unknown)`); else record.availability = a; }
      else if (column === "contents") {
        const parts = value.split("|").map(v => v.trim()).filter(Boolean).map(v => {
          const separator = v.lastIndexOf(":");
          const sourceId = (separator >= 0 ? v.slice(0, separator) : v).trim();
          const quantity = separator >= 0 ? v.slice(separator + 1).trim() : "1";
          return { productId: externalIdMap.get(sourceId) || sourceId, qty: Number(quantity) };
        });
        if (parts.some(c => !c.productId || !Number.isInteger(c.qty))) problem("contents", "contents: формат «ID:количество|ID:количество»"); else record.contents = parts;
      } else record[column] = column === "image" ? value : text(value).replace(/^'(?=[=+@-])/, ""); // undo the export-time formula guard
    }
    if (bad) return;
    const merged = { ...(previous || {}), ...record, id };
    const parsed = productSchema.safeParse(merged);
    if (!parsed.success) { for (const issue of parsed.error.issues.slice(0, 3)) errors.push({ row, field: String(issue.path[0] ?? ""), message: `${issue.path.join(".") || "строка"}: ${issue.message}` }); return; }
    candidates.push({ product: parsed.data, isNew: !previous, row });
  });
  // Resolve bundle references against the final catalogue. References may be an internal ID, an external ID
  // included in this file, or an exact product name when the source system uses names instead of catalogue IDs.
  const after = new Map(byId); for (const c of candidates) after.set(c.product.id, c.product);
  const nameToId = new Map<string, string | null>();
  for (const product of after.values()) {
    if (product.section === "sets") continue;
    const name = product.name.trim().toLocaleLowerCase();
    nameToId.set(name, nameToId.has(name) ? null : product.id);
  }
  for (const c of candidates) {
    if (c.product.section === "sets" && c.product.contents.length) {
      c.product = {
        ...c.product,
        contents: c.product.contents.map(item => {
          if (after.has(item.productId)) return item;
          const match = nameToId.get(item.productId.trim().toLocaleLowerCase());
          return match ? { ...item, productId: match } : item;
        }),
      };
    }
  }
  const all = [...after.values()];
  for (const c of candidates) { const message = productRuleError(c.product, all); if (message) errors.push({ row: c.row, message }); }
  return { created: candidates.filter(c => c.isNew).length, updated: candidates.filter(c => !c.isNew).length, errors, ignoredColumns, products: errors.length ? [] : candidates.map(c => c.product) };
}
