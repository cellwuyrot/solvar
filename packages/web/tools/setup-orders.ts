import { beforeMigration } from "./db-safety";
import { createClient } from "@libsql/client";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
await beforeMigration(process.env.DATABASE_URL);
const { normalizePhone, privateHash } = await import("../src/api/services/order-security");
const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
  await client.executeMultiple(await Bun.file(new URL("../migrations/001_orders.sql", import.meta.url)).text());
  const columns = await client.execute("PRAGMA table_info(shop_orders)");
  const existing = new Set(columns.rows.map(row => String(row.name)));
  const additions: Record<string, string> = {
    admin_note: "TEXT NOT NULL DEFAULT ''", version: "INTEGER NOT NULL DEFAULT 0", payment_data: "TEXT NOT NULL DEFAULT '{}'",
    email_notification: "TEXT NOT NULL DEFAULT 'disabled'", email_updated_at: "TEXT NOT NULL DEFAULT ''", email_error: "TEXT NOT NULL DEFAULT ''",
    telegram_attempts: "INTEGER NOT NULL DEFAULT 0", email_attempts: "INTEGER NOT NULL DEFAULT 0",
    telegram_retry_at: "TEXT NOT NULL DEFAULT ''", email_retry_at: "TEXT NOT NULL DEFAULT ''",
  };
  for (const [column, definition] of Object.entries(additions)) if (!existing.has(column))
    await client.execute(`ALTER TABLE shop_orders ADD COLUMN ${column} ${definition}`);
  await client.executeMultiple(await Bun.file(new URL("../migrations/002_order_security.sql", import.meta.url)).text());
  const legacy = await client.execute("SELECT id,data FROM shop_orders WHERE status NOT IN ('completed','cancelled') ORDER BY created_at DESC");
  for (const row of legacy.rows) {
    const data = JSON.parse(String(row.data));
    await client.execute({ sql: "INSERT INTO shop_order_guards (key,order_id,blocked_until) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING", args: [privateHash("phone:" + normalizePhone(data.phone)), String(row.id), Date.now() + 600000] });
  }
  console.log("Order tables ready. Existing catalog and auth data unchanged.");
} finally { client.close(); }
