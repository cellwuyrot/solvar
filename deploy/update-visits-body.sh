#!/usr/bin/env bash
# Run only AFTER the outer backup/preparation commands in UPDATE-VISITS-RU.md.
# A failure leaves solvar stopped; it never resets/reseeds the database or restarts other sites.
set -euo pipefail
cd /var/www/solvar
trap 'echo "ОШИБКА: не продолжайте команды вручную. Сохраните вывод. При неудаче после остановки SOLVAR может оставаться остановлен." >&2' ERR
npm ci
npm run test:technical
npm run test:hardening
npm run test:visits
npm run typecheck
npm run build --workspace=@template/web
npm audit --omit=dev --workspace=@template/web
npm run db:orders
npm run db:admins
npm run db:visits
pm2 restart solvar --update-env
sleep 5
curl --fail --silent --show-error http://127.0.0.1:3011/api/ready
printf '\n'
curl --fail --silent --show-error https://solvar.su/api/ready
printf '\n'
pm2 save
echo "Обновление выполнено. Проверьте /admin, владельца, адрес, менеджеров и Тест Telegram. Форма не включается автоматически."
