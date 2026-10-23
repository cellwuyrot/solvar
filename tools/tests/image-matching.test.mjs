import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const src = readFileSync(new URL('../../packages/web/src/api/services/image-matching.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src.replaceAll('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const api = new Function(`${js}; return { imageMatchKey, matchImageName };`)();
const products = [
  { id: 'a1', name: 'Крем для лица', image: '' },
  { id: 'b2', name: 'Шампунь', image: 'https://example.com/existing.jpg' },
  { id: 'c3', name: 'Сыворотка', image: '' },
];
test('matches Cyrillic product titles regardless of case, separators and supported extension', () => {
  assert.equal(api.matchImageName('КРЕМ_ДЛЯ-ЛИЦА.JPG', products).product.id, 'a1');
  assert.equal(api.matchImageName('c3.webp', products).product.id, 'c3');
});
test('never overwrites existing images and never assigns unknown filenames', () => {
  assert.equal(api.matchImageName('шампунь.png', products).kind, 'skipped');
  assert.equal(api.matchImageName('unknown.jpg', products).kind, 'unmatched');
});
test('rejects ambiguous matches even when one image is already filled', () => {
  assert.equal(api.matchImageName('крем для лица.png', [...products, { id: 'd4', name: 'Крем для лица', image: 'existing' }]).kind, 'ambiguous');
});
test('product names with periods are preserved', () => {
  assert.equal(api.matchImageName('Крем SPF 50.jpg', [{ id: 'x', name: 'Крем SPF 50', image: '' }]).kind, 'matched');
});
test('bulk UI checks matching before uploading and supports multiple files', () => {
  const ui = readFileSync(new URL('../../packages/web/src/web/components/admin-image-bulk.tsx', import.meta.url), 'utf8');
  assert.match(ui, /type="file" multiple/);
  assert.ok(ui.indexOf('checkImageByName.call') < ui.indexOf('upload.call'));
  assert.match(ui, /assignImageByName/);
});
test('server performs a conditional update only for empty images', () => {
  const route = readFileSync(new URL('../../packages/web/src/api/routes/shop.ts', import.meta.url), 'utf8');
  assert.match(route, /COALESCE\(json_extract\(data, '\$\.image'\), ''\) = ''/);
});
