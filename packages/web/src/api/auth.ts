import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { db } from "./database";
import { eq } from "drizzle-orm";
import { adminMembers } from "./database/schema";
import { sendEmail } from "./services/mail";
export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL?.replace(/\/$/, ""),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const [member] = await db.select().from(adminMembers).where(eq(adminMembers.userId, user.id));
      if (!member?.active) return;
      try {
        await sendEmail(user.email, "SOLVAR: доступ к административной панели", `Для установки нового пароля перейдите по ссылке: ${url}\nСсылка действует один час. Если вы не запрашивали доступ, проигнорируйте письмо.`);
        await db.update(adminMembers).set({ inviteState: "accepted" }).where(eq(adminMembers.userId, user.id));
      } catch {
        await db.update(adminMembers).set({ inviteState: "unconfirmed" }).where(eq(adminMembers.userId, user.id));
        // Do not expose reset URLs, account details or SMTP errors through auth logs.
      }
    },
  },
  trustedOrigins: [
    (process.env.WEBSITE_URL || "http://localhost:4200").replace(/\/$/, ""),
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:4200"]),
    ...(process.env.AUTH_TRUSTED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, "")),
  ].filter(Boolean),
  plugins: [bearer()],
  logger: { log: (level) => { if (level === "error") console.error("Authentication operation failed; sensitive details withheld"); } },
  rateLimit: { enabled: true, window: 60, max: 30, customRules: {
    "/request-password-reset": { window: 900, max: 3 },
    "/sign-in/email": { window: 60, max: 5 },
    "/reset-password": { window: 900, max: 5 },
  } },
  advanced: { defaultCookieAttributes: { sameSite: "lax", secure: process.env.NODE_ENV === "production" || process.env.WEBSITE_URL?.startsWith("https://") === true } },
});
