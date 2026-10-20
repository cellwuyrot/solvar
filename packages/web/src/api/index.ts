import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { shop, management } from "./routes/shop";
import { adminMemberManagement } from "./routes/admin-members";
import { orderPublic, orderManagement } from "./routes/orders";
import { db } from "./database";
import * as schema from "./database/schema";
import { eq } from "drizzle-orm";
import { startNotificationWorker } from "./services/order-notifications";
import { managerManagement } from "./routes/managers";
import { visitPublic, visitStaff, visitOwner } from "./routes/visits";
import { startVisitWorker } from "./services/visits";
import { auth } from "./auth";
import { checkOrigin, ordersAvailable } from "./services/orders";
import { issueDevice } from "./services/order-security";

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
// Keep each routes/ file under 500 lines (`bun run lint` enforces this);
// split into more feature files as they grow.
// Patterns and examples: skills/app/references/api.md
export const router = {
  ping,
  visits: visitPublic,
  staff: visitStaff,
  visitOwner,
  shop: { ...shop, ...orderPublic },
  management: { ...management, ...orderManagement, ...adminMemberManagement, ...managerManagement },
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.post("/api/order-session", async c => {
  try { checkOrigin(c.req.raw.headers); } catch { return c.json({ ready: false }, 403); }
  const secure = process.env.WEBSITE_URL?.startsWith("https://") ? "; Secure" : "";
  c.header("Set-Cookie", `solvar-order-device=${issueDevice()}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${secure}`);
  return c.json({ ready: await ordersAvailable() });
});
app.get("/api/ready", async c => {
  try {
    await db.select().from(schema.orders).limit(1);
    await db.select().from(schema.orderIntegration).limit(1);
    await db.select().from(schema.orderHistory).limit(1);
    await db.select().from(schema.orderGuards).limit(1);
    await db.select().from(schema.orderRateLimits).limit(1);
    await db.select().from(schema.adminMembers).limit(1);
    await db.select().from(schema.adminEvents).limit(1);
    await db.select().from(schema.visits).limit(1);
    await db.select().from(schema.visitConfig).limit(1);
    await db.select().from(schema.visitEvents).limit(1);
    const { getSettings } = await import("./services/orders");
    await getSettings();
    const owners = await db.select().from(schema.adminMembers).where(eq(schema.adminMembers.role, "owner"));
    if (!owners.some(row => row.active)) throw new Error("Owner unavailable");
    return c.json({ status: "ready", mode: "store" });
  } catch { return c.json({ status: "unavailable" }, 503); }
});
startNotificationWorker();
startVisitWorker();
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// Rare plain-HTTP endpoints (webhooks, streaming, the Better Auth handler)
// register here with full paths, e.g. app.post("/api/webhooks/example", ...)

export default app;
