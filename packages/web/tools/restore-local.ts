import { restoreSnapshot } from "./db-safety";
if (!process.env.RESTORE_SOURCE || !process.env.RESTORE_DESTINATION) throw new Error("RESTORE_SOURCE and RESTORE_DESTINATION required; destination must be a NEW file");
await restoreSnapshot(process.env.RESTORE_SOURCE, process.env.RESTORE_DESTINATION);
console.log("Verified restore into NEW file. No running database was replaced; perform application smoke tests before switching DATABASE_URL.");
