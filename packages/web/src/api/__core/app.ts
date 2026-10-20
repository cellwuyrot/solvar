import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ingressAllowed } from "../services/order-security";
import { cors } from "hono/cors";
import { os, type Router } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

/**
 * TEMPLATE-MANAGED (__ prefix) — do not edit. Feature procedures belong in
 * src/api/routes/, composed in src/api/index.ts.
 *
 * oRPC is the API layer: define procedures on the `router` in src/api/index.ts;
 * they are served at /api/rpc/* and called through the typed clients
 * (web: src/web/lib/api.ts, mobile: lib/api.ts).
 *
 * Hono is only the HTTP mount. Rare plain routes (webhooks, streaming
 * responses, the Better Auth handler) register directly on the app returned
 * by createApp, with full /api/... paths.
 */

/** Per-request context available in every procedure via `context`. */
export interface RpcContext {
  /** Raw request headers — read cookies/authorization for auth. */
  headers: Headers;
  clientIp: string;
}

/** Base procedure builder — chain .input()/.use()/.handler() off this. */
export const base = os.$context<RpcContext>();

/** Assembles the HTTP mount: CORS → /api/health → oRPC procedures at /api/rpc/*. */
export function createApp(router: Router<Record<never, never>, RpcContext>) {
  const app = new Hono<{ Bindings: { clientIp?: string } }>();
  app.onError((_error, c) => {
    console.error("API request failed; credentials and personal data withheld");
    return c.json({ message: "Внутренняя ошибка сервиса" }, 500);
  });
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (process.env.NODE_ENV === "production" && process.env.WEBSITE_URL?.startsWith("https://")) c.header("Strict-Transport-Security", "max-age=31536000");
    const ip = c.env?.clientIp || "unknown";
    const order = c.req.path.includes("createOrder") || c.req.path === "/api/rpc/visits/create" || c.req.path === "/api/order-session";
    if (!ingressAllowed(ip, order ? "order" : "api", order ? 60 : 300)) return c.json({ message: "Rate limit exceeded" }, 429, { "Retry-After": "60" });
    c.header("X-Content-Type-Options", "nosniff"); c.header("X-Frame-Options", "DENY"); c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
  });
  app.use("/api/auth/*", bodyLimit({ maxSize: 16384, onError: c => c.json({ message: "Authentication payload too large" }, 413) }));
  app.use("/api/rpc/visits/create", bodyLimit({ maxSize: 8192, onError: c => c.json({ message: "Visit payload too large" }, 413) }));
  app.use("/api/rpc/shop/createOrder", bodyLimit({ maxSize: 20000, onError: c => c.json({ message: "Order payload too large" }, 413) }));
  app.use("*", bodyLimit({ maxSize: 3200000, onError: c => c.json({ message: "Payload too large" }, 413) }));
  app.use(
    cors({
      origin: (origin) => {
        const allowed = [process.env.WEBSITE_URL, ...(process.env.AUTH_TRUSTED_ORIGINS || "").split(",")]
          .filter(Boolean).map(value => value!.trim().replace(/\/$/, ""));
        return allowed.includes(origin) ? origin : undefined;
      },
      credentials: true,
      // Required so the browser can read the bearer token header set by Better Auth.
      exposeHeaders: ["set-auth-token"],
    }),
  );

  app.get("/api/health", (c) => c.json({ status: "ok" }, 200));

  const handler = new RPCHandler(router);
  app.use("/api/rpc/*", async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/api/rpc",
      context: { headers: c.req.raw.headers, clientIp: c.env?.clientIp || "unknown" },
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });

  return app;
}
