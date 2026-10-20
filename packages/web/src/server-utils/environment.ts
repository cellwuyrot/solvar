import { isAbsolute } from "node:path";
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must contain 32+ random characters");
  if (!env.ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL)) throw new Error("Valid ADMIN_EMAIL is required");
  if (env.NODE_ENV !== "production") return;
  const origin = new URL(env.WEBSITE_URL || "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Production WEBSITE_URL must be an HTTPS origin");
  if (env.SMTP_ALLOW_INSECURE_LOCAL === "true") throw new Error("Insecure SMTP is forbidden in production");
  if (env.DATABASE_URL.startsWith("file:") && !isAbsolute(env.DATABASE_URL.slice(5))) throw new Error("Production SQLite requires an absolute persistent path");
  if (env.ORDER_GUARD_SECRET && env.ORDER_GUARD_SECRET.length < 32) throw new Error("ORDER_GUARD_SECRET must contain 32+ characters");
}
