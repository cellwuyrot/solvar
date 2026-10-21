import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_COLUMNS, PRODUCT_COLUMN_LABELS, productCsvColumnFromHeader } from "../../packages/web/src/shared/product-import.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
test("CSV import recognises canonical headers case-insensitively and common external aliases", () => {
  assert.equal(productCsvColumnFromHeader("ID"), "id");
  assert.equal(productCsvColumnFromHeader("Sku"), "id");
  assert.equal(productCsvColumnFromHeader("Наименование"), "name");
  assert.equal(productCsvColumnFromHeader("ЦЕНА"), "price");
  assert.equal(productCsvColumnFromHeader("Опубликовать в каталоге"), "active");
  assert.equal(productCsvColumnFromHeader("Поле из чужой системы"), null);
});

test("each catalogue field has one selectable label and there are no duplicate target fields", () => {
  assert.equal(new Set(PRODUCT_COLUMNS).size, PRODUCT_COLUMNS.length);
  for (const field of PRODUCT_COLUMNS) assert.ok(PRODUCT_COLUMN_LABELS[field].length > 0, `missing label: ${field}`);
});

test("admin publication checkbox is editable and bulk import has explicit column selectors", () => {
  const editor = fs.readFileSync(path.join(root, "packages/web/src/web/pages/admin.tsx"), "utf8");
  const bulk = fs.readFileSync(path.join(root, "packages/web/src/web/components/admin-bulk.tsx"), "utf8");
  assert.match(editor, /checked=\{draft\[key\]\}/);
  assert.doesNotMatch(editor, /disabled=\{key === "active"\}/);
  assert.match(bulk, /Сопоставление колонок/);
  assert.match(bulk, /<select className="field" aria-label=\{`Сопоставление колонки/);
  assert.match(bulk, /importer\.mutate\(\{ csv: normalizedCsv, dryRun: true \}\)/);
});
