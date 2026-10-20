const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env");
const template = fs.readFileSync(path.join(root, ".env.template"), "utf8");
const content = template
  .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${crypto.randomBytes(32).toString("hex")}`)
  .replace(/^NOTIFICATION_WORKER_ENABLED=.*$/m, "NOTIFICATION_WORKER_ENABLED=false");
try {
  fs.writeFileSync(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log("Created .env with a random local secret. External notification worker is OFF.");
  console.log("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in .env before initializing a NEW local database.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .env was NOT changed. Keep your current secrets and database settings.");
}
