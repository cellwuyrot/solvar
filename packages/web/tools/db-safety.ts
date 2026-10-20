import { createClient } from "@libsql/client";
import { mkdir, stat, chmod, readFile, writeFile, copyFile } from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

export function localDatabasePath(url: string) {
  if (!url.startsWith("file:") || /[?#]/.test(url)) throw new Error("Local file: database required; use provider snapshots for remote libSQL");
  return url.startsWith("file://") ? fileURLToPath(url) : resolve(decodeURIComponent(url.slice(5)));
}
async function existingFile(path: string) {
  const info = await stat(path);
  if (!info.isFile() || !info.size) throw new Error("Source database is missing or empty");
}
async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function verifySnapshot(path: string) {
  await existingFile(path);
  const client = createClient({ url: "file:" + path });
  try {
    await client.execute("PRAGMA query_only=ON");
    const check = await client.execute("PRAGMA quick_check");
    if (check.rows.length !== 1 || check.rows[0].quick_check !== "ok") throw new Error("SQLite verification failed");
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    return { sha256: await sha256(path), bytes: (await stat(path)).size, tables: tables.rows.map(row => String(row.name)) };
  } finally { client.close(); }
}
export async function snapshotDatabase(url: string, directory: string) {
  const source = localDatabasePath(url);
  await existingFile(source); // Never silently create/back up a wrong empty database.
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const output = resolve(dir, `solvar-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.db`);
  const client = createClient({ url });
  try { await client.execute(`VACUUM INTO '${output.replace(/'/g, "''")}'`); }
  finally { client.close(); }
  await chmod(output, 0o600);
  const verification = await verifySnapshot(output);
  await writeFile(output + ".manifest.json", JSON.stringify({ format: 1, createdAt: new Date().toISOString(), ...verification }, null, 2), { flag: "wx", mode: 0o600 });
  return output;
}
export async function restoreSnapshot(source: string, destination: string) {
  const from = resolve(source), to = resolve(destination);
  if (from === to) throw new Error("Source and destination must differ");
  const manifest = JSON.parse(await readFile(from + ".manifest.json", "utf8"));
  const verified = await verifySnapshot(from);
  if (manifest.format !== 1 || manifest.sha256 !== verified.sha256 || manifest.bytes !== verified.bytes) throw new Error("Snapshot checksum mismatch");
  await mkdir(dirname(to), { recursive: true, mode: 0o700 });
  await copyFile(from, to, constants.COPYFILE_EXCL); // Existing files can NEVER be overwritten.
  await chmod(to, 0o600);
  const restored = await verifySnapshot(to);
  if (restored.sha256 !== verified.sha256) throw new Error("Restored checksum mismatch; do not use restored file");
  return restored;
}
export async function beforeMigration(url: string) {
  if (url.startsWith("file:")) {
    const path = localDatabasePath(url);
    try { await stat(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Database does not exist; initialize a NEW database first");
      throw error;
    }
    const backup = await snapshotDatabase(url, process.env.BACKUP_DIR || "../../backups");
    console.log("Verified pre-migration snapshot:", backup);
  } else if (!process.env.REMOTE_BACKUP_REFERENCE?.trim()) {
    throw new Error("Remote migration blocked: obtain and verify provider snapshot, then supply REMOTE_BACKUP_REFERENCE");
  }
}
