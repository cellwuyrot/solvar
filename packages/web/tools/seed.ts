import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/api/database";
import * as s from "../src/api/database/schema";
import seed from "../src/shared/catalog-seed.json";
import { initialSettings, productSchema } from "../src/shared/shop";
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) required");
for (const item of seed) {
  const p = productSchema.parse(item);
  await db
    .insert(s.products)
    .values({ id: p.id, data: JSON.stringify(p) })
    .onConflictDoNothing();
}
await db
  .insert(s.settings)
  .values({ id: "main", data: JSON.stringify(initialSettings) })
  .onConflictDoNothing();
const found = await db.select().from(s.user).where(eq(s.user.email, email));
if (!found.length) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(s.user).values({ id, email, name: "SOLVAR Admin", emailVerified: true });
    await tx
      .insert(s.account)
      .values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(password),
      });
  });
  console.log("Admin created");
} else console.log("Existing admin retained");
// Reservation intake is on by default (owner can switch it off in admin). Notification channels stay optional. documentsReady remains only for legacy config compatibility.
await db.insert(s.orderIntegration).values({ id: "main", data: JSON.stringify({ enabled: true, chatId: "", telegramEnabled: true, emailEnabled: false, notifyEmail: "", documentsReady: true }) }).onConflictDoNothing();
console.log(`SOLVAR starter catalogue seeded: ${seed.length} hidden templates; settings ready`);

const [owner] = await db.select().from(s.user).where(eq(s.user.email, email));
const existingOwners = await db.select().from(s.adminMembers).where(eq(s.adminMembers.role, "owner"));
if (!existingOwners.length) await db.insert(s.adminMembers).values({ userId: owner.id, role: "owner", active: true, createdAt: new Date().toISOString(), createdBy: "bootstrap" }).onConflictDoNothing();
