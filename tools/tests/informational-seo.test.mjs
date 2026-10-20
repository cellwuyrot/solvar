import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../../packages/web/src/__server.ts', import.meta.url), 'utf8');
const seo = readFileSync(new URL('../../packages/web/src/api/services/page-seo.ts', import.meta.url), 'utf8');
test('robots excludes private paths and lists sitemap', () => {
  for (const token of ['Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /cart', 'Sitemap: ${origin}/sitemap.xml']) assert.ok(server.includes(token), token);
});
test('sitemap includes only information routes', () => {
  assert.match(server, /const paths = \["\/", "\/catalog", "\/info\/privacy"\]/);
});
test('information pages have server-rendered breadcrumb navigation', () => {
  assert.ok(seo.includes('aria-label="Хлебные крошки"'));
  assert.ok(seo.includes('aria-current="page"'));
});
test('information pages expose SEO structured data without injecting raw tags', () => {
  assert.ok(seo.includes('"@type": "BreadcrumbList"'));
  assert.ok(seo.includes('seo-ssr-jsonld'));
  assert.ok(seo.includes('JSON.stringify(structured).replace(/</g, "\\\\u003c")'));
});
