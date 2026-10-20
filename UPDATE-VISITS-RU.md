# Обновление работающего SOLVAR с GitHub

Эта инструкция рассчитана на уже работающий сервер из переписки: Ubuntu, Node 24 через nvm, `/var/www/solvar`, локальная база в `/var/lib/solvar`, процесс PM2 **solvar**, Nginx для `solvar.su`, порт **3011** только на `127.0.0.1`. Другие сайты/процессы не перезапускаются, Nginx и сертификаты не меняются.

## 1. Загрузить исходники в GitHub

Распакуйте архив на своём компьютере, перенесите содержимое папки `solvar-store` в корень исходного Git-репозитория и закоммитьте. В корне должны лежать `package.json`, `VISITS-README-RU.md`, `deploy`, `packages` — не вложенная дополнительная папка.

Не загружайте `.env`, пароли, токены, базы, резервные копии, `node_modules`, локальный `solvar.config.cjs`. В архиве рабочих секретов и базы нет. Сохраните свою историю `.git`; папка `.git` в архив не включена. Пушьте в ту ветку, за которой следит сервер; не используйте force push.

## 2. Проверить сервер, пока сайт работает

```bash
cd /var/www/solvar
source ~/.nvm/nvm.sh
nvm use 24
node -v
pm2 ls
git branch --show-current
git status --short
git diff --exit-code
git diff --cached --exit-code
git fetch
git log --oneline HEAD..@{u}
```

Проверьте, что upstream — нужная ветка и в новых коммитах есть `deploy/update-visits-body.sh`, `packages/web/migrations/004_visits.sql`. Если upstream не настроен или есть локальные правки отслеживаемых файлов, остановитесь и разберите их; **не запускайте `git reset --hard`, `git clean` или автоматический stash**. Не публикуйте вывод remote URL, если туда встроен токен.

Локальный `solvar.config.cjs` может быть неотслеживаемым — это нормально, он будет сохранён отдельно. Если новый Git-коммит пытается перезаписать `.env` или этот конфиг, сначала исправьте состав коммита. Не заменяйте эти файлы шаблонами.

## 3. Backup, проверка восстановления и обновление

Будет короткое окно недоступности SOLVAR (загрузка зависимостей, сборка, тесты и миграции). Сначала выполните раздел 2. Затем вставьте **весь блок**. При любой ошибке блок останавливается: не запускайте следующие команды отдельно, сохраните сообщение об ошибке. После остановки сайт при неудаче может остаться остановленным — это безопаснее запуска несовместимого релиза.

```bash
(
  set -eo pipefail
  cd /var/www/solvar
  source ~/.nvm/nvm.sh
  nvm use 24
  set -u
  umask 077
  git diff --exit-code
  git diff --cached --exit-code
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

  git pull --ff-only
  test -f deploy/update-visits-body.sh
  bash deploy/update-visits-body.sh
)
```

Резервная копия находится вне web root и содержит секреты/персональные данные. Храните её защищённо, не загружайте в GitHub и не присылайте в чат. SQLite quick_check/SHA-256 не заменяют проверку восстановленного приложения на отдельном стенде. До важных рабочих обновлений выполните и такой restore-smoke-test с отдельными секретами/отключёнными внешними отправками.

### Что делает `update-visits-body.sh`

- Устанавливает зависимости из lock-файла: `npm ci`.
- Проверяет технические тесты, прежние защитные тесты и новые тесты визитов на отдельных временных базах.
- Проверяет типы, собирает `@template/web`, проверяет аудит web runtime без автоматической правки зависимостей.
- Выполняет только аддитивные `db:orders`, `db:admins`, `db:visits`. Каждая создаёт собственный проверенный snapshot до изменений локальной базы. Миграции не удаляют существующие товары, настройки, пароли, владельца или старые заказы; повторный запуск допустим.
- Перезапускает **только solvar**, проверяет локальный и HTTPS `/api/ready`, сохраняет список PM2. Если аудит/проверки не проходят — остановка, а не `npm audit fix --force`.

**Не запускать при обновлении:** `db:push`, `db:seed`, `db:migrate:solvar`, общий `npm start`, `pm2 update`, `pm2 restart all`. Секреты не генерируются заново.

## 4. Проверка после обновления

```bash
pm2 logs solvar --lines 30 --nostream
ss -ltnp | grep ':3011'
curl --fail --silent --show-error https://solvar.su/api/health; echo
curl --fail --silent --show-error https://solvar.su/api/ready; echo
```

Проверьте отсутствие цикла перезапусков в `pm2 ls`. Процесс должен слушать **127.0.0.1:3011**, не `0.0.0.0`. Ready должен отвечать `ready`, режим остаётся `information`.

Войдите существующим владельцем в `/admin`. Заполните адрес/политику, создайте менеджера, сохраните Chat ID и нажмите «Тест Telegram». Токен, ранее сохранённый в `.env`, сохраняется. Не используйте токен, опубликованный в переписке: его нужно было отозвать у BotFather.

Новый параметр можно дописать вручную через `nano .env`:

```dotenv
VISIT_CAPTCHA_REQUIRED=true
```

Настройте `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` для `solvar.su`, затем `pm2 restart solvar --update-env`. Форма по умолчанию выключена, токен и CAPTCHA автоматически не настраиваются. Без CAPTCHA можно проверить менеджеров и Telegram, не открывая приём записей. Подробно — `VISITS-README-RU.md`.

Nginx уже проксирует `/api/*` и `/` на 3011; для этой версии его менять не нужно. Обновлённый сервер ограничивает размер публичной формы до 8 KiB, исходные лимиты Nginx продолжают действовать. Конфигурация автозапуска PM2 уже включена; старый Node/PM2 не удаляйте без отдельной проверки остальных сайтов.

## 5. Если обновление не удалось

Не удаляйте базу и не выполняйте seed. Сначала сохраните ошибку, путь backup и старый commit. Проверьте `pm2 logs solvar --lines 50 --nostream` — без публикации токенов/паролей.

Если новый код неработоспособен, можно вернуть **предыдущий безопасный информационный релиз**. Не откатывайтесь на старые релизы с доступной торговлей. Аддитивные таблицы визитов можно оставить в текущей базе — старая версия их не использует. Не откатывайте файл базы без отдельного решения: это теряет новые записи.

После проверки, что в рабочей папке нет несохранённых изменений, подставьте сохранённый путь backup:

```bash
(
  set -eo pipefail
  cd /var/www/solvar
  source ~/.nvm/nvm.sh
  nvm use 24
  set -u
  BACKUP=/var/backups/solvar/ФАКТИЧЕСКАЯ-ПАПКА-РЕЛИЗА
  OLD_COMMIT=$(cat "$BACKUP/old-commit.txt")
  pm2 stop solvar
  git switch --detach "$OLD_COMMIT"
  npm ci
  npm run build --workspace=@template/web
  # .env, конфиг PM2 и текущая база не перезаписываются.
  pm2 restart solvar --update-env
  sleep 5
  curl --fail --silent --show-error https://solvar.su/api/ready
  pm2 save
)
```

После исправления релиза вернитесь на нужную ветку осознанно: detached HEAD не настроен для следующего `git pull`. При повреждении/необходимости возврата базы используйте восстановление snapshot **в новый файл** и отдельно проверяйте его до переключения `DATABASE_URL`. `restore-check.db`, созданный выше, не переключается в production автоматически.

## Короткая команда с теми же предосторожностями

В архив также включён полный `deploy/update-from-github.sh`: проверки отслеживаемых правок, backup `.env`/конфига/кода, snapshot и проверка восстановления базы, обновление на конкретный полученный commit и запуск `update-visits-body.sh`. Он не генерирует новые секреты. Сначала загрузите и просмотрите свой commit на GitHub; затем на сервере:

```bash
cd /var/www/solvar
source ~/.nvm/nvm.sh
nvm use 24
git fetch
REF=$(git rev-parse '@{u}')
git show "$REF:deploy/update-from-github.sh" > /root/solvar-update-from-github.sh && \
  bash /root/solvar-update-from-github.sh "$REF"
```

Не запускайте это дополнительно после уже выполненного раздела 3 — это альтернативный способ того же обновления. Если команды `git fetch`, `git rev-parse` или `git show` не находят нужную ветку/файл, остановитесь. После ошибки установщика не продолжайте команды отдельно.

В отличие от `git pull`, полный скрипт не делает повторный fetch во время обновления: он применяет fast-forward именно на переданный SHA, из которого извлечён скрипт. Перед остановкой проверяется, что этот commit не содержит отслеживаемых `.env`/локального PM2-конфига.
