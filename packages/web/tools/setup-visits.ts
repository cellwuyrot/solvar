import { createClient } from "@libsql/client";
import { beforeMigration } from "./db-safety";
const url = process.env.DATABASE_URL || "";
if (!url) throw new Error("DATABASE_URL required");
await beforeMigration(url);
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
try {
  await client.executeMultiple(await Bun.file(new URL("../migrations/004_visits.sql", import.meta.url)).text());
  console.log("Visit tables ready; existing accounts, settings and archived orders retained. Visit form is disabled by default.");
} finally { client.close(); }
