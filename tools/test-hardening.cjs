const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'solvar-hardening-test-'));
const bunManifest = require.resolve('bun/package.json', { paths: [root] });
const bun = join(require('node:path').dirname(bunManifest), 'bin', 'bun.exe');
// Bun's installed bin is named bun.exe on both platforms in this npm package.
const env = { ...process.env, NODE_ENV: 'test', WEBSITE_URL: 'http://localhost:4200', DATABASE_URL: 'file:' + join(directory, 'isolated.db'),
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ADMIN_EMAIL: 'owner@example.invalid', ADMIN_PASSWORD: randomBytes(24).toString('base64url'),
  NOTIFICATION_WORKER_ENABLED: 'false', TELEGRAM_BOT_TOKEN: '', DATABASE_AUTH_TOKEN: '', ORDER_CAPTCHA_REQUIRED: 'false',
  SMTP_HOST: '', SMTP_FROM: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_ALLOW_INSECURE_LOCAL: 'false',
  SOLVAR_TEST_DIRECTORY: directory, BACKUP_DIR: join(directory, 'backups'), DEPLOYMENT_ENV: 'staging' };
const logs = join(root, 'qa-hardening'); mkdirSync(logs, { recursive: true });
function run(label, args, input) {
  const result = spawnSync(bun, args, { cwd: join(root, 'packages/web'), env, input, encoding: 'utf8', timeout: 120000 });
  writeFileSync(join(logs, label + '.log'), (result.stdout || '') + (result.stderr || ''), { mode: 0o600 });
  if (result.status !== 0) { console.error(label + ' FAIL; inspect qa-hardening/' + label + '.log'); process.exit(result.status || 1); }
  console.log(label + ' PASS');
}
run('schema', ['x', '--no-install', 'drizzle-kit', 'push', '--force']);
run('seed', ['tools/seed.ts']);
run('server-security', ['tools/test-hardening.ts']);
console.log('Disposable database and logs kept outside the archive; no configured production database was used.');
