import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
test('SEO metadata has persisted optional schema fields', () => {
 const s = read('packages/web/src/shared/shop.ts');
 for (const key of ['seoTitle', 'seoDescription', 'seoNoindex']) assert.match(s, new RegExp(`${key}: z\\.`));
});
test('admin supports item-level meta editing', () => {
 const s = read('packages/web/src/web/pages/admin.tsx');
 for (const field of ['Метатеги:', 'seoTitle', 'seoDescription', 'seoNoindex']) assert.ok(s.includes(field));
});
test('informational catalog has crawlable route and breadcrumbs', () => {
 assert.match(read('packages/web/src/__server.ts'), /"\/catalog", "\/info\/privacy"/);
 assert.match(read('packages/web/src/api/services/page-seo.ts'), /"\/catalog"/);
 assert.match(read('packages/web/src/web/pages/information.tsx'), /Хлебные крошки/);
});
test('robots excludes administration and API paths', () => {
 const s = read('packages/web/src/__server.ts');
 assert.match(s, /Disallow: \/admin/);
 assert.match(s, /Disallow: \/api\//);
});
