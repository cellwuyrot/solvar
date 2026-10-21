import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
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
const { sendEmail, smtpOptions } = await import("../src/api/services/mail");
const { snapshotDatabase, restoreSnapshot } = await import("./db-safety");
const { issueDevice, deviceId } = await import("../src/api/services/order-security");
import type { AppRouterClient } from "../src/api";
const rpc = (token = "", origin = "http://localhost:4200"): AppRouterClient => createORPCClient(new RPCLink({
  url: "http://localhost:4200/api/rpc", headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  fetch: request => app.fetch(request, { clientIp: "192.0.2.55" }) as Promise<Response>,
}));
const rejectCode = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => (e as { code?: string }).code === code);
const pass = (name: string) => console.log("PASS " + name);
const anon = rpc();
const login = await auth.api.signInEmail({ body: { email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD! } });
const owner = rpc(login.token);
await rejectCode(() => anon.management.adminMembers(), "UNAUTHORIZED");
await rejectCode(() => rpc(login.token, "https://attacker.invalid").management.adminMembers(), "FORBIDDEN");
assert.equal((await owner.management.me()).role, "owner");
pass("anonymous access and foreign origin rejected; bootstrap owner retained");
const orderId = crypto.randomUUID();
const data = { name: "Isolated fixture", phone: "+79990000001", email: "visitor@example.invalid", comment: "PUBLIC_MESSAGE", items: [], subtotalKopecks: 0, deliveryKopecks: 0, totalKopecks: 0, consent: { acceptedAt: new Date().toISOString(), policyHash: "fixture", text: "fixture" } };
await db.insert(s.orders).values({ id: orderId, requestHash: "fixture", createdAt: new Date().toISOString(), data: JSON.stringify(data), notificationUpdatedAt: new Date().toISOString(), adminNote: "PRIVATE_STAFF_NOTE", notification: "pending" });
await rejectCode(() => anon.shop.createOrder({ requestId: orderId, name: "Fixture", phone: "+79990000001", expectedTotalKopecks: 0, consent: true, items: [{ productId: "not-a-product", qty: 1 }] }), "PRECONDITION_FAILED"); // no signed device cookie
assert.equal((await owner.management.saveIntegration({ enabled: true, documentsReady: false })).ok, true);
assert.equal((await owner.management.integration()).enabled, true);
const catalog = await anon.shop.catalog();
assert.equal(catalog.ordersEnabled, true); assert.deepEqual(catalog.products, []);
assert(!JSON.stringify(catalog).includes("PRIVATE_STAFF_NOTE"));
await rejectCode(() => anon.management.orders({ offset: 0 }), "UNAUTHORIZED");
await rejectCode(() => anon.management.orderHistory({ id: orderId }), "UNAUTHORIZED");
const sessionRequest = (origin: string) => app.fetch(new Request("http://localhost:4200/api/order-session", { method: "POST", headers: { origin } }), { clientIp: "192.0.2.55" });
const session = await sessionRequest("http://localhost:4200");
assert.equal(session.status, 200); assert.equal((await session.json()).ready, true);
const cookie = session.headers.get("set-cookie") || ""; assert(cookie.includes("solvar-order-device=") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"));
assert.equal((await sessionRequest("https://attacker.invalid")).status, 403);
pass("reservation intake enabled; signed HttpOnly device cookie issued; foreign origin rejected; private history/notes protected");
const cookies = new Headers({ cookie: "solvar-order-device=" + issueDevice() });
assert(deviceId(cookies)); cookies.set("cookie", cookies.get("cookie")! + ".extra"); assert.equal(deviceId(cookies), "");
pass("signed cookie rejects extra segments");
const settings = await owner.management.catalog();
const knownText = settings.settings.privacy;
await owner.management.saveBrand({ logoMark: "/brand/solvar-s.png", logoHero: "/brand/solvar-s.png", favicon: "/brand/favicon-32.png" });
await owner.management.saveSettings({ ...settings.settings, phone: "+79990000000" });
const afterBrand = await owner.management.catalog();
assert.equal(afterBrand.settings.logoMark, "/brand/solvar-s.png");
assert.equal(afterBrand.settings.privacy, knownText);
const publicInfo = await anon.shop.information();
assert.equal(publicInfo.privacy, knownText);
assert(!("deliveryFee" in publicInfo)); assert(!("notifyEmail" in publicInfo));
await rejectCode(() => owner.management.saveBrand({ logoMark: "javascript:alert(1)", logoHero: "", favicon: "" }), "BAD_REQUEST");
await rejectCode(() => owner.management.uploadLogo({ data: "data:image/png;base64,bm90LXBuZw==", kind: "favicon" }), "BAD_REQUEST");
pass("brand-only save preserves texts; stale settings cannot revert logos; public projection excludes internal/commercial fields; unsafe images rejected");
await owner.management.setAdminNote({ id: orderId, version: 0, note: "INTERNAL_EDIT" });
await rejectCode(() => owner.management.setAdminNote({ id: orderId, version: 0, note: "STALE" }), "CONFLICT");
assert.equal((await db.select().from(s.orders).where(eq(s.orders.id, orderId)))[0].adminNote, "INTERNAL_EDIT");
pass("existing notes and optimistic concurrency retained");
let smtpReject = false, accepted = 0;
const smtp = createServer(socket => {
  socket.write("220 localhost isolated SMTP\r\n"); let buffer = "", inData = false;
  socket.on("data", chunk => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      if (inData) { const end = buffer.indexOf("\r\n.\r\n"); if (end < 0) break; accepted++; buffer = buffer.slice(end + 5); inData = false; socket.write("250 queued in local mock\r\n"); continue; }
      const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (line.startsWith("AUTH")) socket.write("235 OK\r\n");
      else if (line.startsWith("RCPT") && smtpReject) socket.write("550 recipient rejected\r\n");
      else if (line.startsWith("DATA")) { inData = true; socket.write("354 send message\r\n"); }
      else if (line.startsWith("QUIT")) socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
await new Promise<void>(resolve => smtp.listen(0, "127.0.0.1", resolve));
process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = String((smtp.address() as { port: number }).port);
process.env.SMTP_SECURE = "false"; process.env.SMTP_ALLOW_INSECURE_LOCAL = "true";
process.env.SMTP_USER = "test-user"; process.env.SMTP_PASSWORD = "not-a-real-secret"; process.env.SMTP_FROM = "sender@example.invalid";
assert.equal(smtpOptions().requireTLS, false);
assert.equal((await sendEmail("admin@example.invalid", "Service test", "Local protocol test only")).acceptedByProvider, true);
smtpReject = true; await assert.rejects(() => sendEmail("admin@example.invalid", "Service test", "Test"), /Доставка не подтверждена/); smtpReject = false;
await assert.rejects(() => sendEmail("a@example.invalid,b@example.invalid", "Test", "Test"));
process.env.NODE_ENV = "production"; assert.equal(smtpOptions().requireTLS, true); process.env.NODE_ENV = "test";
pass("local SMTP acceptance/rejection, single recipient validation, production STARTTLS required; NOT real Trioz delivery");
const created = await owner.management.createAdmin({ name: "Test staff", email: "staff@example.invalid", ownerPassword: process.env.ADMIN_PASSWORD! });
assert.equal(created.created, true); assert.equal(created.notification, "accepted");
const [member] = await db.select().from(s.user).where(eq(s.user.email, "staff@example.invalid"));
const resets = await db.select().from(s.verification);
const reset = resets.find(row => row.value === member.id && row.identifier.startsWith("reset-password:")); assert(reset);
const token = reset!.identifier.slice("reset-password:".length);
const staffPassword = "IsolatedStaffPassword-123!";
await auth.api.resetPassword({ body: { token, newPassword: staffPassword } });
await assert.rejects(() => auth.api.resetPassword({ body: { token, newPassword: staffPassword } }));
const staffLogin = await auth.api.signInEmail({ body: { email: "staff@example.invalid", password: staffPassword } });
const staff = rpc(staffLogin.token);
assert.equal((await staff.management.me()).role, "admin");
await staff.management.catalog();
await rejectCode(() => staff.management.adminMembers(), "FORBIDDEN");
await rejectCode(() => staff.management.createAdmin({ email: "escalate@example.invalid", name: "Attack", ownerPassword: staffPassword }), "FORBIDDEN");
await rejectCode(() => staff.management.testEmail(), "FORBIDDEN");
await owner.management.setAdminActive({ id: member.id, active: false, ownerPassword: process.env.ADMIN_PASSWORD! });
await assert.rejects(() => staff.management.me());
assert.equal((await db.select().from(s.session).where(eq(s.session.userId, member.id))).length, 0);
pass("owner creates admin; one-use password setup; staff cannot escalate or access SMTP settings; disabling revokes sessions");
await rejectCode(() => owner.management.setAdminActive({ id: login.user.id, active: false, ownerPassword: process.env.ADMIN_PASSWORD! }), "FORBIDDEN");
await rejectCode(() => owner.management.createAdmin({ email: "denied@example.invalid", name: "Denied", ownerPassword: "wrong-password" }), "FORBIDDEN");
smtpReject = true;
const failed = await owner.management.createAdmin({ email: "smtp-failure@example.invalid", name: "SMTP failure fixture", ownerPassword: process.env.ADMIN_PASSWORD! });
assert.equal(failed.created, true); assert.equal(failed.notification, "unconfirmed");
assert.equal((await db.select().from(s.user).where(eq(s.user.email, "smtp-failure@example.invalid"))).length, 1);
smtpReject = false;
await rejectCode(() => owner.management.setAdminActive({ id: member.id, active: true, ownerPassword: process.env.ADMIN_PASSWORD! }), "TOO_MANY_REQUESTS");
pass("owner cannot disable itself; reauthentication/rate limit; SMTP failure retains account with honest unconfirmed status");
assert(accepted >= 2);
await new Promise<void>(resolve => smtp.close(() => resolve()));
const snapshot = await snapshotDatabase(process.env.DATABASE_URL!, join(directory, "backups"));
const dest = join(directory, "restored.db");
const restored = await restoreSnapshot(snapshot, dest);
assert(restored.tables.includes("shop_admin_members"));
await assert.rejects(() => restoreSnapshot(snapshot, dest));
await assert.rejects(() => snapshotDatabase("file:" + join(directory, "missing.db"), join(directory, "backups")));
const manifestPath = snapshot + ".manifest.json", manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await writeFile(manifestPath, JSON.stringify({ ...manifest, sha256: "bad" }));
await assert.rejects(() => restoreSnapshot(snapshot, join(directory, "tampered.db")), /checksum/);
pass("consistent SQLite snapshot, SHA-256 restore to new file, overwrite/missing-source/tamper rejection");
// Independent verification against the restored database, not merely checksum comparison.
const { createClient } = await import("@libsql/client"); const restoredClient = createClient({ url: "file:" + dest });
assert.equal((await restoredClient.execute("SELECT admin_note FROM shop_orders WHERE id='" + orderId + "'")).rows[0].admin_note, "INTERNAL_EDIT");
assert.equal((await restoredClient.execute("SELECT COUNT(*) AS n FROM shop_products")).rows[0].n, settings.products.length); restoredClient.close();
pass("restored notes, catalog rows and administrative schema readable");
const beforeMigrations = JSON.stringify(await db.select().from(s.orders));
for (let iteration = 0; iteration < 2; iteration++) for (const script of ["tools/setup-orders.ts", "tools/setup-admins.ts"]) {
  const child = Bun.spawn([process.execPath, script], { cwd: process.cwd(), env: process.env, stdout: "pipe", stderr: "pipe" });
  const exit = await child.exited;
  if (exit !== 0) throw new Error("Migration test failed: " + script); // Never echo environment or SQL.
}
assert.equal(JSON.stringify(await db.select().from(s.orders)), beforeMigrations);
assert.equal((await db.select().from(s.adminMembers).where(eq(s.adminMembers.role, "owner")))[0].userId, login.user.id);
pass("additive migrations repeated twice; existing owner, notes and order JSON unchanged; automatic verified backups created");
const ready = await app.fetch(new Request("http://localhost:4200/api/ready")); assert.equal(ready.status, 200);
assert.equal(ready.headers.get("cache-control"), "no-store");
await db.delete(s.settings);
assert.equal((await app.fetch(new Request("http://localhost:4200/api/ready"))).status, 503);
assert.equal((await app.fetch(new Request("http://localhost:4200/api/health"))).status, 200);
pass("readiness checks initialization; health remains liveness; API responses no-store");
const legacyPath = join(directory, "legacy-orders.db");
const legacy = createClient({ url: "file:" + legacyPath });
await legacy.executeMultiple(await Bun.file(new URL("../migrations/001_orders.sql", import.meta.url)).text());
await legacy.execute({ sql: "INSERT INTO shop_orders(id,request_hash,created_at,data,notification_updated_at) VALUES (?,?,?,?,?)", args: ["legacy-fixture", "hash", "2026-01-01", JSON.stringify(data), "2026-01-01"] });
legacy.close();
for (let iteration = 0; iteration < 2; iteration++) {
  const child = Bun.spawn([process.execPath, "tools/setup-orders.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "file:" + legacyPath }, stdout: "pipe", stderr: "pipe" });
  assert.equal(await child.exited, 0);
}
const upgraded = createClient({ url: "file:" + legacyPath });
const [old] = (await upgraded.execute("SELECT data,admin_note,version,email_notification FROM shop_orders WHERE id='legacy-fixture'")).rows;
assert.equal(old.data, JSON.stringify(data)); assert.equal(old.admin_note, ""); assert.equal(old.version, 0); assert.equal(old.email_notification, "disabled"); upgraded.close();
pass("actual legacy order schema upgraded twice; JSON preserved and missing columns added");
const { existsSync } = await import("node:fs");
const forbiddenPath = join(directory, "must-not-be-created.db");
for (const WEBSITE_URL of ["http://localhost:4200", "https://example.invalid"]) {
  const child = Bun.spawn([process.execPath, "src/__server.ts"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", SMTP_ALLOW_INSECURE_LOCAL: "false", WEBSITE_URL, DATABASE_URL: "file:" + forbiddenPath }, stdout: "pipe", stderr: "pipe" });
  assert.notEqual(await child.exited, 0);
  assert.equal(existsSync(forbiddenPath), false);
}
pass("invalid production environment and missing production database fail before creating any database");
console.log("ALL ISOLATED HARDENING TESTS PASSED (local mocks only)");
process.exit(0);
