import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isWithinDirectory, staticFilePath } from "../../packages/web/src/server-utils/static-path.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const [label, flavor, base, valid, invalid] of [
  ["POSIX", path.posix, "/app/dist", ["/app/dist/assets/main.js", "/app/dist/brand/logo.png", "/app/dist"], ["/app/dist-other/main.js", "/app/.env", "/app"]],
  ["Windows", path.win32, "C:\\SOLVAR\\dist", ["C:\\SOLVAR\\dist\\assets\\main.js", "C:\\SOLVAR\\dist\\brand\\logo.png", "C:\\SOLVAR\\dist"], ["C:\\SOLVAR\\dist-other\\a.js", "C:\\SOLVAR\\.env", "D:\\other\\a.js"]],
]) {
  for (const candidate of valid) test(`${label}: allows ${candidate}`, () => assert.equal(isWithinDirectory(base, candidate, flavor), true));
  for (const candidate of invalid) test(`${label}: rejects ${candidate}`, () => assert.equal(isWithinDirectory(base, candidate, flavor), false));
}
const base = path.resolve(os.tmpdir(), "solvar-static-test/dist");
for (const url of ["/../.env", "/../../secrets", "/assets/../../../.env", "/..\\secret", "/assets\\file.js", "/a\0b", "assets/file.js"]) {
  test(`rejects unsafe URL ${JSON.stringify(url)}`, () => assert.equal(staticFilePath(base, url), null));
}
for (const url of ["/assets/main.js", "/brand/logo.png", "/favicon.ico", "/"]) {
  test(`resolves ordinary static URL ${url}`, () => assert.ok(staticFilePath(base, url)?.startsWith(base)));
}
test("env initializer creates a random secret and never overwrites existing settings", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "solvar-env-test-"));
  try {
    fs.mkdirSync(path.join(temporary, "tools"));
    fs.copyFileSync(path.join(root, "tools/setup-local-env.cjs"), path.join(temporary, "tools/setup-local-env.cjs"));
    fs.copyFileSync(path.join(root, ".env.template"), path.join(temporary, ".env.template"));
    const run = () => spawnSync(process.execPath, [path.join(temporary, "tools/setup-local-env.cjs")], { encoding: "utf8" });
    assert.equal(run().status, 0);
    const original = fs.readFileSync(path.join(temporary, ".env"), "utf8");
    assert.match(original, /^BETTER_AUTH_SECRET=[a-f0-9]{64}$/m);
    assert.match(original, /^NOTIFICATION_WORKER_ENABLED=true$/m);
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(path.join(temporary, ".env"), "utf8"), original);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
