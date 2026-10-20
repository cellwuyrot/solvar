import { createClient } from "@libsql/client";
import { beforeMigration } from "./db-safety";
const url = process.env.DATABASE_URL || "";
if (!url) throw new Error("DATABASE_URL required");
await beforeMigration(url);
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
  await client.executeMultiple(await Bun.file(new URL("../migrations/003_admin_members.sql", import.meta.url)).text());
  const existing = await client.execute("SELECT user_id FROM shop_admin_members WHERE role='owner' LIMIT 1");
  if (!existing.rows.length) {
    const owner = await client.execute({ sql: 'SELECT id FROM user WHERE lower(email) = ? LIMIT 1', args: [(process.env.ADMIN_EMAIL || "").trim().toLowerCase()] });
    if (!owner.rows.length) throw new Error("Bootstrap owner not found; use db:seed for a NEW database or configure the existing owner's ADMIN_EMAIL");
    await client.execute({ sql: "INSERT INTO shop_admin_members(user_id,role,active,created_at,created_by) VALUES (?,'owner',1,?,'migration') ON CONFLICT(user_id) DO NOTHING", args: [String(owner.rows[0].id), new Date().toISOString()] });
  }
  console.log("Admin access migration complete; existing users, passwords and owner retained.");
} finally { client.close(); }
