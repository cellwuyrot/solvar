import { eq } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { settingsSchema, SECTIONS, type Product, type Settings } from "../../shared/shop";
let cache: { at: number; products: Product[]; settings: Settings } | undefined;
export function invalidatePageCache() { cache = undefined; }
export async function pageCatalog() {
  if (!cache || Date.now() - cache.at > 30000) {
    const [settings] = await db.select().from(s.settings).where(eq(s.settings.id, "main"));
    if (!settings) throw new Error("Catalog not initialized");
    const products: Product[] = []; // Do not expose legacy active rows in information mode.
    cache = { at: Date.now(), products, settings: settingsSchema.parse(JSON.parse(settings.data)) };
  }
  return cache;
}
export const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export async function renderPageHtml(html: string, pathname: string, origin: string) {
  return renderInformationHtml(html, pathname, origin);
}
export async function renderLegacyPageHtml(html: string, pathname: string, origin: string) {
  const catalog = await pageCatalog(), settings = catalog.settings;
  const info: Record<string, string> = { delivery: "Доставка", payment: "Оплата", returns: "Возврат", privacy: "Политика конфиденциальности", offer: "Публичная оферта" };
  const collection = /^\/collections\/([^/]+)\/?$/.exec(pathname)?.[1];
  const productId = /^\/products\/([^/]+)\/?$/.exec(pathname)?.[1];
  const product = productId ? catalog.products.find(p => p.id === productId) : undefined;
  const section = collection ? SECTIONS[collection as keyof typeof SECTIONS] : undefined;
  const slug = /^\/info\/([^/]+)\/?$/.exec(pathname)?.[1];
  const valid = pathname === "/" || pathname === "/admin" || !!section || !!product || !!(slug && info[slug]);
  const title = product?.name || section?.title || (slug && info[slug]) || (pathname === "/admin" ? "Управление магазином" : valid ? "Сигары, табак и аксессуары" : "Страница не найдена");
  const description = (product?.description || product?.sub || section?.desc || settings.heroText || settings.tagline).slice(0, 300);
  const canonical = origin + pathname.replace(/\/$/, "") + (pathname === "/" ? "/" : "");
  const noindex = !valid || pathname === "/admin";
  const h = escapeHtml;
  let body = `<h1>${h(title)}</h1><p>${h(description)}</p>`;
  const products = section ? catalog.products.filter(p => p.section === collection) : catalog.products;
  if (product) body += `<p>${h(product.weight)} · ${h(String(product.price))} ₽</p>` + [["Материалы и состав", product.ingredients], ["Характеристики", product.allergens], ["Условия хранения", product.storage], ["Коллекция / производитель", product.shelfLife]].filter(v => v[1]).map(([label, text]) => `<h2>${label}</h2><p>${h(text)}</p>`).join("");
  else if (slug && info[slug]) body = `<h1>${h(info[slug])}</h1><p>${h(String(settings[slug as keyof Settings] || ""))}</p>`;
  else if (valid && pathname !== "/admin") body += `<ul>${products.map(p => `<li><a href="/products/${encodeURIComponent(p.id)}">${h(p.name)}</a> — ${h(String(p.price))} ₽</li>`).join("")}</ul>`;
  const offer = product ? { "@type": "Offer", priceCurrency: "RUB", price: product.price, url: canonical,
    ...(product.availability === "in_stock" ? { availability: "https://schema.org/InStock" } : product.availability === "out_of_stock" ? { availability: "https://schema.org/OutOfStock" } : {}) } : undefined;
  const data = product ? { "@context": "https://schema.org", "@type": "Product", name: product.name, description, sku: product.id, offers: offer }
    : { "@context": "https://schema.org", "@type": "WebSite", name: settings.name, url: origin + "/", description };
  const head = `<title>${h(title)} — ${h(settings.name)}</title>\n<meta name="description" content="${h(description)}" />\n<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}" />\n<link rel="canonical" href="${h(canonical)}" />\n<meta property="og:title" content="${h(title + " — " + settings.name)}" />\n<meta property="og:description" content="${h(description)}" />\n<meta property="og:url" content="${h(canonical)}" />\n<meta property="og:type" content="${product ? "product" : "website"}" />\n<meta property="og:image" content="${h(origin)}/og-image.png" />\n<script id="seo-jsonld" type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
  const patched = html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta (?:name="(?:description|robots)"|property="og:[^"]+")[^>]*>/g, "")
    .replace("</head>", head + "\n</head>").replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return { html: patched, status: valid ? 200 : 404, noindex };
}

async function renderInformationHtml(html: string, pathname: string, origin: string) {
  const { settings } = await pageCatalog();
  const valid = ["/", "/info/privacy", "/admin", "/admin/reset-password"].includes(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const title = !valid ? "Страница не найдена" : pathname === "/info/privacy" ? "Политика конфиденциальности" : isAdmin ? "Управление" : settings.name;
  const h = escapeHtml, noindex = isAdmin || !valid;
  const body = `<main><h1>${h(title)}</h1>${pathname === "/info/privacy" ? `<p>${h(settings.privacy)}</p>` : pathname === "/" ? `<p>${h(settings.company)}</p><p>${h(settings.address)}</p><p>${h(settings.phone)}</p><p>${h(settings.email)}</p>` : ""}</main>`;
  const head = `<title>${h(title)}</title><meta name="description" content="${h(title)}" /><meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}" /><link rel="canonical" href="${h(origin + pathname)}" /><meta property="og:title" content="${h(title)}" /><meta property="og:type" content="website" />`;
  const patched = html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta (?:name="(?:description|robots)"|property="og:[^"]+")[^>]*>/g, "")
    .replace("</head>", head + "</head>").replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return { html: patched, status: valid ? 200 : 404, noindex };
}
