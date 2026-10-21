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

// ---- 6b. Bulk CSV import/export of products; export of orders and customers
const { parseCsv, toCsv, safeCell } = await import("../src/shared/csv");
assert.deepEqual(parseCsv('\uFEFFa,b\n"x;1","he said ""hi""\nline2"\n'), [["a", "b"], ["x;1", 'he said "hi"\nline2']]);
assert.deepEqual(parseCsv("a;b\r\n1;2\r\n\r\n3;\r\n"), [["a", "b"], ["1", "2"], ["3", ""]]);
assert.deepEqual(parseCsv(toCsv([["n", "t"], ["Имя; с точкой", 'кавычка " тут']])), [["n", "t"], ["Имя; с точкой", 'кавычка " тут']]);
assert.throws(() => parseCsv('a;b\n"open'));
assert.equal(safeCell("=1+1"), "'=1+1"); assert.equal(safeCell("+79990001122"), "+79990001122"); assert.equal(safeCell("-5"), "-5"); assert.equal(safeCell("@cmd"), "'@cmd"); assert.equal(safeCell("+cmd|x"), "'+cmd|x");
await owner.management.saveProduct({ ...base, id: "b-formula", name: "=HYPERLINK(\"http://x\")", price: 500, active: true });
await rejectCode(() => anon.management.exportProducts({ template: false }), "UNAUTHORIZED");
await rejectCode(() => anon.management.importProducts({ csv: "id;name\nA;B", dryRun: true }), "UNAUTHORIZED");
const exported = await owner.management.exportProducts({ template: false });
assert(exported.csv.startsWith("\uFEFFid;name;section;price")); assert(exported.csv.includes("'=HYPERLINK")); assert(exported.filename.endsWith(".csv"));
assert((await owner.management.exportProducts({ template: true })).csv.includes("CIGAR_001"));
const stripImages = (list: { image: string }[]) => JSON.stringify(list);
const before = stripImages((await owner.management.catalog()).products);
const roundTrip = await owner.management.importProducts({ csv: exported.csv, dryRun: false });
assert.equal(roundTrip.errorCount, 0, JSON.stringify(roundTrip.errors)); assert.equal(roundTrip.created, 0); assert.equal(roundTrip.applied, true);
assert.equal(stripImages((await owner.management.catalog()).products), before); // export → import changes nothing (formula guard undone)
// External IDs with spaces/punctuation are normalized consistently and their bundle references are remapped too.
const externalIdsCsv = "id;name;section;price;active;contents\n\"SKU # bundle\";Импортированный набор;sets;1000;0;\"SKU / component:2\"\n\"SKU / component\";Импортированный компонент;cigars;100;0;\n";
const externalIdsPreview = await owner.management.importProducts({ csv: externalIdsCsv, dryRun: true });
assert.equal(externalIdsPreview.errorCount, 0, JSON.stringify(externalIdsPreview.errors)); assert.equal(externalIdsPreview.created, 2); assert.equal(externalIdsPreview.applied, false);
const externalIdsApplied = await owner.management.importProducts({ csv: externalIdsCsv, dryRun: false });
assert.equal(externalIdsApplied.errorCount, 0, JSON.stringify(externalIdsApplied.errors)); assert.equal(externalIdsApplied.applied, true);
const externalProducts = (await owner.management.catalog()).products;
const externalSet = externalProducts.find(p => p.name === "Импортированный набор")!;
const externalComponent = externalProducts.find(p => p.name === "Импортированный компонент")!;
assert.match(externalSet.id, /^IMP_[A-Z0-9]+$/); assert.match(externalComponent.id, /^IMP_[A-Z0-9]+$/);
assert.deepEqual(externalSet.contents, [{ productId: externalComponent.id, qty: 2 }]);
const externalRepeat = await owner.management.importProducts({ csv: externalIdsCsv, dryRun: false });
assert.equal(externalRepeat.created, 0); assert.equal(externalRepeat.updated, 2); assert.equal(externalRepeat.applied, true);
await owner.management.deleteProduct({ id: externalSet.id }); await owner.management.deleteProduct({ id: externalComponent.id });
// Bundle contents can also reference a unique component by its exact name instead of a foreign-system ID.
const nameRefCsv = "id;name;section;price;active;contents\nSET-NAME;Набор по названию;sets;1000;0;Компонент по названию:2\nCOMP-NAME;Компонент по названию;cigars;100;0;\n";
const nameRefResult = await owner.management.importProducts({ csv: nameRefCsv, dryRun: false });
assert.equal(nameRefResult.errorCount, 0, JSON.stringify(nameRefResult.errors)); assert.equal(nameRefResult.applied, true);
assert.deepEqual((await owner.management.catalog()).products.find(p => p.id === "SET-NAME")!.contents, [{ productId: "COMP-NAME", qty: 2 }]);
await owner.management.deleteProduct({ id: "SET-NAME" }); await owner.management.deleteProduct({ id: "COMP-NAME" });
const ru = "Артикул;Название;Раздел;Цена;Наличие;Опубликован;Описание\r\nIMP-1;Сигара Импорт;Сигары;1 250,50;в наличии;да;Из CSV\r\nb-formula;Обновлённая;;777;;нет;\r\nIMP-SET;Набор из файла;Коллекции;3000;;да;Набор\r\n";
const countProducts = async () => (await db.select().from(s.products)).length; const n0 = await countProducts();
const preview = await owner.management.importProducts({ csv: ru, dryRun: true });
assert.equal(preview.errorCount, 0, JSON.stringify(preview.errors)); assert.equal(preview.created, 2); assert.equal(preview.updated, 1); assert.equal(preview.applied, false); assert.equal(await countProducts(), n0);
const applied = await owner.management.importProducts({ csv: ru, dryRun: false });
assert.equal(applied.applied, true); assert.equal(await countProducts(), n0 + 2);
const imported = (await owner.management.catalog()).products;
const imp = imported.find(p => p.id === "IMP-1")!; assert.equal(imp.price, 1250.5); assert.equal(imp.section, "cigars"); assert.equal(imp.availability, "in_stock"); assert.equal(imp.active, true);
const upd = imported.find(p => p.id === "b-formula")!; assert.equal(upd.name, "Обновлённая"); assert.equal(upd.price, 777); assert.equal(upd.active, false); assert.equal(upd.section, "cigars"); // empty section kept; description cleared
assert((await anon.shop.catalog()).products.some(p => p.id === "IMP-1")); assert(!(await anon.shop.catalog()).products.some(p => p.id === "b-formula"));
// all-or-nothing: one bad row blocks the whole file
const n1 = await countProducts(); const priceBefore = (await owner.management.catalog()).products.find(p => p.id === "IMP-1")!.price;
const bad = await owner.management.importProducts({ csv: "id;name;section;price;contents\nOK-1;Хорошая;cigars;100;\nIMP-1;Цена не число;cigars;abc;\nBAD-2;Раздел;wine;10;\nOK-1;Дубль;cigars;5;\nSET-X;Набор;sets;50;MISSING:1\nBAD ID;Пробел;cigars;1;", dryRun: false });
assert.equal(bad.applied, false); assert(bad.errorCount >= 4, "errors: " + JSON.stringify(bad.errors)); assert(bad.errors.every(e => e.row >= 2));
assert.equal(await countProducts(), n1); assert.equal((await owner.management.catalog()).products.find(p => p.id === "IMP-1")!.price, priceBefore);
assert((await owner.management.importProducts({ csv: "foo;bar\n1;2", dryRun: true })).errorCount > 0);
assert((await owner.management.importProducts({ csv: "id;name\n", dryRun: true })).errorCount > 0);
const javascriptImage = await owner.management.importProducts({ csv: "id;name;section;price;image\nIMG-1;Фото;cigars;10;javascript:alert(1)", dryRun: true });
assert(javascriptImage.errorCount > 0);
const [set1] = [await owner.management.importProducts({ csv: "id;name;section;price;contents\nSET-OK;Набор;sets;900;IMP-1:2|OK-NEW:1\nOK-NEW;Новый;cigars;100;", dryRun: false })];
assert.equal(set1.applied, true, JSON.stringify(set1.errors)); // a set may reference a product from the same file
assert.deepEqual((await owner.management.catalog()).products.find(p => p.id === "SET-OK")!.contents, [{ productId: "IMP-1", qty: 2 }, { productId: "OK-NEW", qty: 1 }]);
for (const id of ["SET-OK", "OK-NEW", "IMP-1", "IMP-SET", "b-formula"]) await owner.management.deleteProduct({ id });
// orders / customers export: owner only, spreadsheet-safe, aggregated by phone
const customers = await owner.management.exportOrders({ kind: "customers" });
assert(customers.csv.startsWith("\uFEFFИмя;Телефон;Email;Заявок")); assert.equal(customers.count, 2); assert(customers.csv.includes("+79990001122")); assert(customers.csv.includes("Пётр Уведомляемый"));
const ordersExport = await owner.management.exportOrders({ kind: "orders" });
assert.equal(ordersExport.count, 2); assert(ordersExport.csv.includes("Тестовая Робусто 2 × 2")); assert(ordersExport.csv.includes("3200,00")); assert(ordersExport.csv.includes("Завершена")); assert(!ordersExport.csv.includes("PRIVATE_STAFF_NOTE"));
await rejectCode(() => anon.management.exportOrders({ kind: "customers" }), "UNAUTHORIZED");
const { createServer } = await import("node:net");
const smtp = createServer(socket => { let buffer = "", inData = false; socket.write("220 mock\r\n"); socket.on("data", chunk => { buffer += chunk.toString();
  while (buffer.includes("\r\n")) {
    if (inData) { const end = buffer.indexOf("\r\n.\r\n"); if (end < 0) break; buffer = buffer.slice(end + 5); inData = false; socket.write("250 queued in local mock\r\n"); continue; }
    const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n"); else if (line.startsWith("AUTH")) socket.write("235 OK\r\n");
    else if (line.startsWith("DATA")) { inData = true; socket.write("354 send message\r\n"); } else if (line.startsWith("QUIT")) socket.end("221 bye\r\n"); else socket.write("250 OK\r\n");
  } }); });
await new Promise<void>(resolve => smtp.listen(0, "127.0.0.1", resolve));
Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String((smtp.address() as { port: number }).port), SMTP_SECURE: "false", SMTP_ALLOW_INSECURE_LOCAL: "true", SMTP_USER: "test-user", SMTP_PASSWORD: "not-a-real-secret", SMTP_FROM: "sender@example.invalid" });
const staffCreated = await owner.management.createAdmin({ name: "Export staff", email: "export-staff@example.invalid", ownerPassword: process.env.ADMIN_PASSWORD! });
assert.equal(staffCreated.created, true);
const [staffUser] = await db.select().from(s.user).where(eq(s.user.email, "export-staff@example.invalid"));
const resetRow = (await db.select().from(s.verification)).find(row => row.value === staffUser.id && row.identifier.startsWith("reset-password:"))!;
await auth.api.resetPassword({ body: { token: resetRow.identifier.slice("reset-password:".length), newPassword: "ExportStaffPassword-123!" } });
const staffToken = (await auth.api.signInEmail({ body: { email: "export-staff@example.invalid", password: "ExportStaffPassword-123!" } })).token;
const staffClient = rpc(staffToken);
await staffClient.management.exportProducts({ template: false }); // administrators may export the catalogue
await rejectCode(() => staffClient.management.exportOrders({ kind: "customers" }), "FORBIDDEN"); // but not customers' personal data
await rejectCode(() => staffClient.management.exportOrders({ kind: "orders" }), "FORBIDDEN");
pass("bulk CSV: export/import round trip is lossless; Russian headers; preview changes nothing; all-or-nothing; formulas neutralised; customers export is owner-only");

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
