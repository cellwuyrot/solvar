import { strict as assert } from "node:assert";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const directory = process.env.SOLVAR_TEST_DIRECTORY || "";
if (!directory || !resolve(directory).startsWith(resolve(tmpdir())) || process.env.DATABASE_URL !== "file:" + join(directory, "isolated.db") || process.env.NODE_ENV !== "test") throw new Error("Isolated runner required BEFORE application imports");
const { default: app } = await import("../src/api");
const { auth } = await import("../src/api/auth");
const { db } = await import("../src/api/database");
const s = await import("../src/api/database/schema");
const { eq } = await import("drizzle-orm");
const { createORPCClient } = await import("@orpc/client");
const { RPCLink } = await import("@orpc/client/fetch");
const { renderPageHtml, sitemapPaths } = await import("../src/api/services/page-seo");
const { issueDevice } = await import("../src/api/services/order-security");
const { tickNotificationQueue, deliverOrder } = await import("../src/api/services/order-notifications");
import type { AppRouterClient } from "../src/api";

const ORIGIN = "http://localhost:4200";
const rpc = (token = "", cookie = "", ip = "192.0.2.70"): AppRouterClient => createORPCClient(new RPCLink({
  url: ORIGIN + "/api/rpc", headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) },
  fetch: request => app.fetch(request, { clientIp: ip }) as Promise<Response>,
}));
const rejectCode = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => (e as { code?: string }).code === code, "expected " + code);
const pass = (name: string) => console.log("PASS " + name);
const device = () => "solvar-order-device=" + issueDevice();
const page = "<html><head><title>x</title></head><body><div id=\"root\"></div></body></html>";

const login = await auth.api.signInEmail({ body: { email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD! } });
const owner = rpc(login.token), anon = rpc();

// ---- 1. Admin catalogue CRUD persisted in the database
const base = { id: "t-robusto", name: "Тестовая Робусто", section: "cigars" as const, price: 1500, availability: "in_stock" as const, active: true,
  description: "Описание для проверки каталога", brand: "Test", country: "Куба", cost: 777, demand: 3, priority: "A", seoTitle: "Робусто — SEO заголовок", seoDescription: "SEO описание карточки" };
await owner.management.saveProduct(base);
await owner.management.saveProduct({ ...base, name: "Тестовая Робусто 2", price: 1600 });
const [stored] = await db.select().from(s.products).where(eq(s.products.id, "t-robusto"));
assert.equal(JSON.parse(stored.data).name, "Тестовая Робусто 2"); assert.equal(JSON.parse(stored.data).price, 1600);
assert.equal((await owner.management.catalog()).products.find(p => p.id === "t-robusto")?.price, 1600);
await rejectCode(() => anon.management.saveProduct(base), "UNAUTHORIZED");
await rejectCode(() => owner.management.saveProduct({ ...base, id: "bad id!" }), "BAD_REQUEST");
await rejectCode(() => owner.management.saveProduct({ ...base, price: 0 }), "BAD_REQUEST");
pass("admin creates and edits a product; saved in database; anonymous and invalid input rejected");

// ---- 2. Public catalogue: published only, no internal fields
await owner.management.saveProduct({ ...base, id: "t-hidden", name: "Скрытая", active: false });
const publicCatalog = await anon.shop.catalog();
assert(publicCatalog.products.some(p => p.id === "t-robusto")); assert(!publicCatalog.products.some(p => p.id === "t-hidden"));
const exposed = publicCatalog.products.find(p => p.id === "t-robusto")!;
assert.equal(exposed.cost, 0); assert.equal(exposed.demand, 0); assert.equal(exposed.priority, ""); assert(!JSON.stringify(publicCatalog).includes("777"));
assert.equal(publicCatalog.ordersEnabled, true);
pass("public catalogue shows only published items and never leaks cost/demand/priority");

// ---- 3. SEO: titles, canonical, breadcrumbs, noindex, sitemap, statuses
const productPage = await renderPageHtml(page, "/products/t-robusto", "https://shop.example");
assert.equal(productPage.status, 200); assert.equal(productPage.noindex, false);
assert(productPage.html.includes("<title>Робусто — SEO заголовок</title>"));
assert(productPage.html.includes('content="SEO описание карточки"'));
assert(productPage.html.includes('<link rel="canonical" href="https://shop.example/products/t-robusto" />'));
assert(productPage.html.includes('property="og:title"') && productPage.html.includes('property="og:image"'));
assert(productPage.html.includes('"@type":"BreadcrumbList"') && productPage.html.includes('"@type":"Product"') && productPage.html.includes('aria-label="Хлебные крошки"'));
assert.equal((await renderPageHtml(page, "/products/t-robusto/", "https://shop.example")).html.includes('href="https://shop.example/products/t-robusto" />'), true);
assert.equal((await renderPageHtml(page, "/products/t-hidden", "https://shop.example")).status, 404);
assert.equal((await renderPageHtml(page, "/products/nope", "https://shop.example")).status, 404);
assert.equal((await renderPageHtml(page, "/collections/cigars", "https://shop.example")).status, 200);
assert.equal((await renderPageHtml(page, "/collections/unknown", "https://shop.example")).status, 404);
const admin = await renderPageHtml(page, "/admin", "https://shop.example"); assert.equal(admin.noindex, true); assert(admin.html.includes("noindex,nofollow"));
let paths = await sitemapPaths();
assert(paths.includes("/") && paths.includes("/collections/cigars") && paths.includes("/products/t-robusto") && !paths.includes("/products/t-hidden"));
assert(!paths.some(p => p.startsWith("/admin") || p.startsWith("/api")));
await owner.management.saveProduct({ ...base, name: "Тестовая Робусто 2", price: 1600, seoNoindex: true });
paths = await sitemapPaths(); assert(!paths.includes("/products/t-robusto"));
assert.equal((await renderPageHtml(page, "/products/t-robusto", "https://shop.example")).noindex, true);
await owner.management.saveProduct({ ...base, name: "Тестовая Робусто 2", price: 1600, seoNoindex: false });
pass("SEO: unique title/description, canonical, OG, BreadcrumbList, noindex for admin/seoNoindex, 404 for missing, dynamic sitemap");

// ---- 4. Reservation: validation, security, persistence, idempotency
const sessionResponse = await app.fetch(new Request(ORIGIN + "/api/order-session", { method: "POST", headers: { origin: ORIGIN } }), { clientIp: "192.0.2.70" });
const issuedCookie = (sessionResponse.headers.get("set-cookie") || "").split(";")[0]; assert(issuedCookie.startsWith("solvar-order-device="));
const settings = (await owner.management.catalog()).settings;
const price = 1600 * 100, delivery = price * 2 < settings.freeShipping * 100 ? Math.round(settings.deliveryFee * 100) : 0;
const order = (over: Record<string, unknown> = {}) => ({ requestId: crypto.randomUUID(), name: "Иван Тестов", phone: "+7 999 000-11-22", email: "", comment: "Позвонить после 18:00", consent: true as const, website: "", captchaToken: "",
  expectedTotalKopecks: price * 2 + delivery, items: [{ productId: "t-robusto", qty: 2 }], ...over });
await rejectCode(() => anon.shop.createOrder(order()), "PRECONDITION_FAILED"); // no device cookie
const buyer = rpc("", issuedCookie, "192.0.2.71");
await rejectCode(() => buyer.shop.createOrder(order({ consent: false })), "BAD_REQUEST");
await rejectCode(() => buyer.shop.createOrder(order({ phone: "abc" })), "BAD_REQUEST");
await rejectCode(() => buyer.shop.createOrder(order({ name: "" })), "BAD_REQUEST");
await rejectCode(() => buyer.shop.createOrder(order({ items: [] })), "BAD_REQUEST");
await rejectCode(() => buyer.shop.createOrder(order({ items: [{ productId: "t-robusto", qty: 100 }] })), "BAD_REQUEST");
await rejectCode(() => buyer.shop.createOrder(order({ website: "spam.example" })), "BAD_REQUEST"); // honeypot
await rejectCode(() => rpc("", device(), "192.0.2.72").shop.createOrder(order({ expectedTotalKopecks: 1, phone: "+7 999 100-00-01" })), "CONFLICT"); // stale/forged total
await rejectCode(() => rpc("", device(), "192.0.2.73").shop.createOrder(order({ items: [{ productId: "t-hidden", qty: 1 }], phone: "+7 999 100-00-02" })), "CONFLICT"); // unpublished item
await rejectCode(() => rpc("", device(), "192.0.2.74").shop.createOrder(order({ items: [{ productId: "missing", qty: 1 }], phone: "+7 999 100-00-03" })), "CONFLICT");
assert.equal((await db.select().from(s.orders)).length, 0);
const valid = order();
assert.deepEqual(await buyer.shop.createOrder(valid), { id: valid.requestId, accepted: true });
assert.deepEqual(await buyer.shop.createOrder(valid), { id: valid.requestId, accepted: true }); // retry after lost response
assert.equal((await db.select().from(s.orders)).length, 1);
await rejectCode(() => buyer.shop.createOrder({ ...valid, comment: "другое" }), "CONFLICT");
await rejectCode(() => rpc("", device(), "192.0.2.75").shop.createOrder(order()), "CONFLICT"); // same phone, request still in progress
const [saved] = await db.select().from(s.orders); const snapshot = JSON.parse(saved.data);
assert.equal(snapshot.items[0].qty, 2); assert.equal(snapshot.items[0].name, "Тестовая Робусто 2"); assert.equal(snapshot.totalKopecks, price * 2 + delivery); assert.equal(snapshot.phone, "+79990001122");
assert.equal(snapshot.consent.text.length > 0, true);
pass("reservation validated on server (consent, phone, honeypot, totals, availability); stored once; retry idempotent; duplicate phone blocked");

// ---- 5. Admin sees the request, protected, status changes
await rejectCode(() => anon.management.orders({ offset: 0 }), "UNAUTHORIZED");
await rejectCode(() => buyer.management.orders({ offset: 0 }), "UNAUTHORIZED");
const listed = await owner.management.orders({ offset: 0 });
assert.equal(listed.orders.length, 1); assert.equal(listed.orders[0].id, valid.requestId); assert.equal(listed.orders[0].status, "new");
await owner.management.setOrderStatus({ id: valid.requestId, version: listed.orders[0].version, status: "contacted" });
await rejectCode(() => owner.management.setOrderStatus({ id: valid.requestId, version: listed.orders[0].version, status: "completed" }), "CONFLICT"); // stale version
const after = (await owner.management.orders({ offset: 0, status: "contacted" })).orders[0];
assert.equal(after.status, "contacted");
await owner.management.setOrderStatus({ id: valid.requestId, version: after.version, status: "completed" });
assert.equal((await owner.management.orders({ offset: 0 })).orders[0].status, "completed");
pass("request appears in admin panel; status changes persisted with optimistic locking; anonymous access denied");

// ---- 6. Manager notification: delivered, and failure never destroys the saved request
process.env.TELEGRAM_BOT_TOKEN = "TEST-TOKEN-NOT-REAL";
await owner.management.saveIntegration({ enabled: true, chatId: "12345", telegramEnabled: true, emailEnabled: false, notifyEmail: "", documentsReady: true });
const notified = order({ phone: "+7 999 000-33-44", name: "Пётр Уведомляемый" });
await rpc("", device(), "192.0.2.76").shop.createOrder(notified);
const originalFetch = globalThis.fetch; let calls: { url: string; body: string }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => { calls.push({ url: String(url), body: String(init?.body) }); throw new Error("network down"); }) as typeof fetch;
await tickNotificationQueue();
let [row] = await db.select().from(s.orders).where(eq(s.orders.id, notified.requestId));
assert.equal(row.notification, "failed"); assert(row.notificationError.length > 0); assert(!row.notificationError.includes("TEST-TOKEN")); assert(row.data.includes("Пётр"));
globalThis.fetch = (async (url: string, init?: RequestInit) => { calls.push({ url: String(url), body: String(init?.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as typeof fetch;
calls = []; await deliverOrder(notified.requestId, "telegram", true);
[row] = await db.select().from(s.orders).where(eq(s.orders.id, notified.requestId));
globalThis.fetch = originalFetch;
assert.equal(row.notification, "sent");
assert(calls.length === 1 && calls[0].url.startsWith("https://api.telegram.org/bot")); const message = JSON.parse(calls[0].body).text as string;
assert(message.includes("Тестовая Робусто 2") && message.includes("× 2") && !message.includes("TEST-TOKEN"));
delete process.env.TELEGRAM_BOT_TOKEN;
pass("manager notification: failure is recorded without losing the request; retry delivers items/quantities; token never in message");

// ---- 7. Intake switch and cascade rules
await owner.management.saveIntegration({ enabled: false, chatId: "", telegramEnabled: true, emailEnabled: false, notifyEmail: "", documentsReady: true });
assert.equal((await anon.shop.catalog()).ordersEnabled, false);
await rejectCode(() => rpc("", device(), "192.0.2.77").shop.createOrder(order({ phone: "+7 999 000-55-66" })), "PRECONDITION_FAILED");
await owner.management.saveIntegration({ enabled: true, chatId: "", telegramEnabled: true, emailEnabled: false, notifyEmail: "", documentsReady: true });
await owner.management.saveProduct({ ...base, id: "t-set", name: "Набор", section: "sets", price: 3000, contents: [{ productId: "t-robusto", qty: 1 }] } as never);
await rejectCode(() => owner.management.deleteProduct({ id: "t-robusto" }), "CONFLICT");
await owner.management.deleteProduct({ id: "t-set" }); await owner.management.deleteProduct({ id: "t-robusto" }); await owner.management.deleteProduct({ id: "t-hidden" });
assert.equal((await db.select().from(s.products).where(eq(s.products.id, "t-robusto"))).length, 0);
assert(!(await anon.shop.catalog()).products.some(p => p.id === "t-robusto"));
assert.equal((await renderPageHtml(page, "/products/t-robusto", "https://shop.example")).status, 404);
pass("owner can switch intake off; deleting a product used in a set is blocked; deleted product disappears from catalogue, SEO and sitemap");
console.log("All store integration checks passed. Telegram was mocked; no real provider delivery claimed.");
process.exit(0);
