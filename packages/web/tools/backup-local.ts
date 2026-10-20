import { snapshotDatabase } from "./db-safety";
const output = await snapshotDatabase(process.env.DATABASE_URL || "", process.env.BACKUP_DIR || "../../backups");
console.log("Verified snapshot:", output);
console.log("Snapshot and manifest contain sensitive data. Restrict access, encrypt off-site copies and enforce retention.");
