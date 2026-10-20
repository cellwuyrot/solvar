#!/usr/bin/env bash
# Self-hosted /var/www/solvar only. Run from a reviewed, fetched commit; see UPDATE-VISITS-RU.md.
set -eo pipefail
cd /var/www/solvar
source ~/.nvm/nvm.sh
nvm use 24
set -u
umask 077
git diff --exit-code
git diff --cached --exit-code
TARGET=${1:?Передайте SHA коммита из GitHub}
[[ "$TARGET" =~ ^[a-f0-9]{40}$ ]]
git cat-file -e "$TARGET^{commit}"
git merge-base --is-ancestor HEAD "$TARGET"
if git cat-file -e "$TARGET:.env" 2>/dev/null || git cat-file -e "$TARGET:solvar.config.cjs" 2>/dev/null; then
  echo "ОШИБКА: .env или локальный конфиг PM2 попал в Git. Обновление запрещено." >&2
  exit 1
fi
test -f .env
test -f solvar.config.cjs
BACKUP="/var/backups/solvar/release-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "$BACKUP"
cp -p .env "$BACKUP/env-before"
cp -p solvar.config.cjs "$BACKUP/solvar.config.cjs"
git rev-parse HEAD > "$BACKUP/old-commit.txt"
printf 'Резервная копия: %s\n' "$BACKUP"
trap 'echo "Обновление прервано. SOLVAR может оставаться остановлен. Не удаляйте базу и backup." >&2' ERR
pm2 stop solvar

# Snapshot через SQLite VACUUM INTO, manifest, SHA-256 и восстановление в НОВЫЙ файл.
RELEASE_BACKUP="$BACKUP" ./node_modules/.bin/bun --env-file=.env -e '
  import { snapshotDatabase, restoreSnapshot } from "./packages/web/tools/db-safety.ts";
  const directory = process.env.RELEASE_BACKUP;
  const file = await snapshotDatabase(process.env.DATABASE_URL, directory);
  await restoreSnapshot(file, directory + "/restore-check.db");
  console.log("Snapshot проверен и восстановлен в отдельный restore-check.db");
'

# Старый код и собранная web-версия; зависимости при откате восстанавливаются через npm ci.
tar --exclude=.git --exclude=node_modules --exclude=.env --exclude=.turbo \
    --exclude='*.db' --exclude='*.db-*' --exclude='*.log' \
    -czf "$BACKUP/code-before.tgz" .

git merge --ff-only "$TARGET"
test -f deploy/update-visits-body.sh
bash deploy/update-visits-body.sh
