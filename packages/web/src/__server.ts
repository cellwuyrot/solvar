import { validateEnvironment } from "./server-utils/environment";
validateEnvironment();
const { default: app } = await import("./api");
import { staticFilePath } from "./server-utils/static-path";
import { resolve } from "node:path";
const { resolveClientIp } = await import("./api/services/order-security");
const { pageCatalog, renderPageHtml, escapeHtml } = await import("./api/services/page-seo");
const port = Number(process.env.PORT ?? 4200), dist = resolve(import.meta.dirname, "../dist");

const headers = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };
Bun.serve({ port, hostname: process.env.HOST || "127.0.0.1", maxRequestBodySize: 3200000, idleTimeout: 20, async fetch(request, server) {
  const url = new URL(request.url);
  const origin = (process.env.WEBSITE_URL || url.origin).replace(/\/$/, "");
  try {
    if (url.pathname.startsWith("/api")) return app.fetch(request, { clientIp: resolveClientIp(request.headers, server.requestIP(request)?.address) });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers });
    const common = { ...headers, "Content-Security-Policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", ...(process.env.NODE_ENV === "production" && origin.startsWith("https://") ? { "Strict-Transport-Security": "max-age=31536000" } : {}) };
    if (url.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { ...common, "Content-Type": "text/plain; charset=utf-8" } });
    if (url.pathname === "/sitemap.xml") {
      await pageCatalog();
      const paths = ["/", "/info/privacy"];
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join("")}</urlset>`, { headers: { ...common, "Content-Type": "application/xml; charset=utf-8" } });
    }
    let pathname: string; try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("Bad path", { status: 400, headers: common }); }
    if (pathname === "/index.html") return Response.redirect(origin + "/", 308);
    const filePath = staticFilePath(dist, pathname);
    if (filePath === null) return new Response("Forbidden", { status: 403, headers: common });
    if (pathname.split("/").some(part => part.startsWith("."))) return new Response("Not found", { status: 404, headers: common });
    if (/\.[A-Za-z0-9]+$/.test(pathname)) {
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(request.method === "HEAD" ? null : file, { headers: { ...common, "Content-Type": file.type, "Cache-Control": pathname.startsWith("/assets/") ? "public,max-age=31536000,immutable" : "public,max-age=3600" } });
      return new Response("Not found", { status: 404, headers: common });
    }
    const index = Bun.file(resolve(dist, "index.html"));
    if (!await index.exists()) return new Response("Build not found", { status: 503, headers: common });
    const page = await renderPageHtml(await index.text(), pathname, origin);
    return new Response(request.method === "HEAD" ? null : page.html, { status: page.status, headers: { ...common, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...(page.noindex ? { "X-Robots-Tag": "noindex,nofollow" } : {}) } });
  } catch { return new Response("Service temporarily unavailable", { status: 503, headers: { ...headers, "Retry-After": "30" } }); }
}});
console.log(`Web server listening on port ${port}`);
