import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { productSchema, normalizeSettings, SECTIONS, type Product, type Settings } from "../../shared/shop";

let cache: { at: number; products: Product[]; settings: Settings } | undefined;
export function invalidatePageCache() { cache = undefined; }

/** Published products and public settings, cached for 30 s and dropped on every admin save. */
export async function pageCatalog() {
  if (!cache || Date.now() - cache.at > 30000) {
    const [settings] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
    if (!settings) throw new Error("Catalog not initialized");
    const products = (await db.select().from(s.products))
      .map(row => productSchema.parse(JSON.parse(row.data)))
      .filter(p => p.active)
      .sort((a, b) => a.sort - b.sort);
    cache = { at: Date.now(), products, settings: normalizeSettings(JSON.parse(settings.data)) };
  }
  return cache;
}

export const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const INFO_PAGES: Record<string, string> = { delivery: "Доставка", payment: "Оплата", returns: "Возврат", privacy: "Политика конфиденциальности", offer: "Публичная оферта" };
const isSection = (slug: string): slug is keyof typeof SECTIONS => Object.prototype.hasOwnProperty.call(SECTIONS, slug);

/** Indexable public paths: home, non-empty categories, published products without noindex, info pages. */
export async function sitemapPaths() {
  const { products } = await pageCatalog();
  const sections = [...new Set(products.map(p => p.section))].filter(isSection);
  return [
    "/",
    ...sections.map(slug => `/collections/${slug}`),
    ...products.filter(p => !p.seoNoindex).map(p => `/products/${encodeURIComponent(p.id)}`),
    ...Object.keys(INFO_PAGES).map(slug => `/info/${slug}`),
  ];
}

export async function renderPageHtml(html: string, rawPath: string, origin: string) {
  const { products, settings } = await pageCatalog();
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const collection = /^\/collections\/([^/]+)$/.exec(pathname)?.[1];
  const productId = /^\/products\/([^/]+)$/.exec(pathname)?.[1];
  const infoSlug = /^\/info\/([^/]+)$/.exec(pathname)?.[1];
  const section = collection && isSection(collection) ? SECTIONS[collection] : undefined;
  const product = productId ? products.find(p => p.id === productId) : undefined;
  const info = infoSlug && Object.prototype.hasOwnProperty.call(INFO_PAGES, infoSlug) ? INFO_PAGES[infoSlug] : undefined;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const valid = pathname === "/" || isAdmin || !!section || !!product || !!info;
  const h = escapeHtml;

  const pageName = product?.name || section?.title || info || (isAdmin ? "Управление" : "");
  const title = product?.seoTitle || (pageName ? `${pageName} — ${settings.name}` : !valid ? `Страница не найдена — ${settings.name}` : `${settings.name} — ${settings.tagline || "каталог"}`);
  const description = (product?.seoDescription || product?.description || product?.sub || section?.desc || (infoSlug ? String(settings[infoSlug as keyof Settings] || "") : "") || settings.heroText || settings.tagline || settings.name).replace(/\s+/g, " ").trim().slice(0, 300);
  const canonical = origin + (pathname === "/" ? "/" : pathname);
  const noindex = !valid || isAdmin || !!product?.seoNoindex;

  const crumbs: { name: string; path: string }[] = pathname === "/" || isAdmin || !valid ? [] : [{ name: "Главная", path: "/" }];
  if (product) { if (isSection(product.section)) crumbs.push({ name: SECTIONS[product.section].title, path: `/collections/${product.section}` }); crumbs.push({ name: product.name, path: pathname }); }
  else if (section) crumbs.push({ name: section.title, path: pathname });
  else if (info) crumbs.push({ name: info, path: pathname });
  const crumbHtml = crumbs.length ? `<nav aria-label="Хлебные крошки"><ol>${crumbs.map((c, i) => `<li>${i === crumbs.length - 1 ? `<span aria-current="page">${h(c.name)}</span>` : `<a href="${h(c.path)}">${h(c.name)}</a>`}</li>`).join("")}</ol></nav>` : "";

  const sectionProducts = collection ? products.filter(p => p.section === collection) : products;
  let body = `<main>${crumbHtml}<h1>${h(pageName || settings.name)}</h1>`;
  if (!valid) body = `<main><h1>Страница не найдена</h1><p><a href="/">На главную</a></p>`;
  else if (isAdmin) body += "";
  else if (product) body += `<p>${h(description)}</p><p>${h(product.weight)} · ${h(String(product.price))} ₽</p>` + [["Материалы и состав", product.ingredients], ["Характеристики", product.allergens], ["Условия хранения", product.storage], ["Коллекция / производитель", product.shelfLife]].filter(v => v[1]).map(([label, text]) => `<h2>${label}</h2><p>${h(text)}</p>`).join("");
  else if (info) body += `<p>${h(String(settings[infoSlug as keyof Settings] || ""))}</p>`;
  else body += `<p>${h(description)}</p><ul>${sectionProducts.map(p => `<li><a href="/products/${encodeURIComponent(p.id)}">${h(p.name)}</a> — ${h(String(p.price))} ₽</li>`).join("")}</ul>`;
  body += "</main>";

  const image = product?.image.startsWith("https://") ? product.image : `${origin}/brand/solvar-s-square.png`;
  const structured: unknown[] = [];
  if (valid && !isAdmin) {
    if (product) structured.push({ "@context": "https://schema.org", "@type": "Product", name: product.name, description, sku: product.id, image,
      offers: { "@type": "Offer", priceCurrency: "RUB", price: product.price, url: canonical,
        ...(product.availability === "in_stock" ? { availability: "https://schema.org/InStock" } : product.availability === "out_of_stock" ? { availability: "https://schema.org/OutOfStock" } : {}) } });
    else if (pathname === "/") structured.push({ "@context": "https://schema.org", "@type": "WebSite", name: settings.name, url: origin + "/", description });
    if (crumbs.length) structured.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: origin + (c.path === "/" ? "/" : c.path) })) });
  }
  const jsonld = structured.length ? `\n<script id="seo-jsonld" type="application/ld+json">${JSON.stringify(structured).replace(/</g, "\\u003c")}</script>` : "";
  const head = `<title>${h(title)}</title>\n<meta name="description" content="${h(description)}" />\n<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}" />\n<link rel="canonical" href="${h(canonical)}" />\n<meta property="og:title" content="${h(title)}" />\n<meta property="og:description" content="${h(description)}" />\n<meta property="og:url" content="${h(canonical)}" />\n<meta property="og:type" content="${product ? "product" : "website"}" />\n<meta property="og:site_name" content="${h(settings.name || "SOLVAR")}" />\n<meta property="og:image" content="${h(image)}" />\n<meta property="og:image:alt" content="${h(settings.name || "SOLVAR")} — фирменный знак" />\n<meta name="twitter:title" content="${h(title)}" />\n<meta name="twitter:description" content="${h(description)}" />\n<meta name="twitter:image" content="${h(image)}" />${jsonld}`;
  const patched = html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta (?:name="(?:description|robots|twitter:title|twitter:description|twitter:image)"|property="og:[^"]+")[^>]*>/g, "").replace(/<link rel="canonical"[^>]*>/g, "")
    .replace("</head>", head + "\n</head>").replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return { html: patched, status: valid ? 200 : 404, noindex };
}
