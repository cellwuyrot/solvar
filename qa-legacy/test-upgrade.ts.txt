import { strict as assert } from "node:assert";
import { createClient } from "@libsql/client";
const url = "file:./orders-v2-migration-test.db";
const client = createClient({ url });
await client.executeMultiple(`DROP TABLE IF EXISTS shop_orders; DROP TABLE IF EXISTS shop_order_integration; DROP TABLE IF EXISTS shop_order_guards; DROP TABLE IF EXISTS shop_order_rate_limits; DROP TABLE IF EXISTS shop_order_history;
CREATE TABLE shop_orders (id TEXT PRIMARY KEY NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', notification TEXT NOT NULL DEFAULT 'pending', notification_updated_at TEXT NOT NULL, notification_error TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS shop_products (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);`);
const data = JSON.stringify({ name: "Legacy QA", phone: "8 (999) 000-00-99", comment: "keep", items: [], subtotalKopecks: 100, deliveryKopecks: 0, totalKopecks: 100, consent: { acceptedAt: "2026-01-01", policyHash: "qa", text: "qa" } });
await client.execute({ sql: "INSERT INTO shop_orders (id,request_hash,created_at,data,notification_updated_at) VALUES (?,?,?,?,?)", args: ["legacy-qa", "keep", "2026-01-01", data, "2026-01-01"] });
await client.execute("INSERT OR REPLACE INTO shop_products (id,data) VALUES ('keep','unchanged')");
for (let i = 0; i < 2; i++) {
  const child = Bun.spawn([process.execPath, "tools/setup-orders.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdout: "pipe", stderr: "pipe" });
  const status = await child.exited; if (status) console.error(await new Response(child.stderr).text()); assert.equal(status, 0);
}
const migrated = await client.execute("SELECT data,admin_note,version,email_notification FROM shop_orders WHERE id='legacy-qa'");
assert.equal(migrated.rows[0].data, data); assert.equal(migrated.rows[0].admin_note, ""); assert.equal(migrated.rows[0].version, 0);
assert.equal((await client.execute("SELECT data FROM shop_products WHERE id='keep'")).rows[0].data, "unchanged");
assert.equal((await client.execute("SELECT COUNT(*) AS n FROM shop_order_guards WHERE order_id='legacy-qa'")).rows[0].n, 1);
client.close(); console.log("PASS upgrade old orders table twice: existing JSON/catalog retained, new columns and legacy active-phone guard created"); process.exit(0);
