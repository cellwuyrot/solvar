// TEMPLATE-MANAGED (__ prefix) — do not edit. Define tables in ./schema.ts
// and query via: import { db } from "./database";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL?.startsWith("file:")) {
  const { existsSync } = await import("node:fs");
  if (!existsSync(process.env.DATABASE_URL.slice(5))) throw new Error("Production database does not exist; refusing to create an empty database");
}
const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

if (process.env.DATABASE_URL?.startsWith("file:")) await client.execute("PRAGMA journal_mode=WAL");

export const db = drizzle(client, { schema });
