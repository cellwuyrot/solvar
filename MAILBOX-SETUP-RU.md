# Почта SOLVAR в админке

В админке `/admin` добавлен раздел **«Почта»**: он показывает последние 20 сообщений папки «Входящие», открывает письма и позволяет отправлять новые сообщения или отвечать на письмо. Вложения пока не отображаются; отправка выполняется обычным текстом.

## Настройка на сервере

Откройте серверный `.env` в корне проекта `/var/www/solvar/.env`. Не добавляйте секреты в клиентский код и не используйте префикс `VITE_`.

```dotenv
# Входящая почта Beget (IMAP SSL/TLS)
IMAP_HOST=imap.beget.com
IMAP_PORT=993
IMAP_USER=zakaz@solvar.su
IMAP_PASSWORD=

# Исходящая почта Beget (SMTP SSL/TLS)
SMTP_HOST=smtp.beget.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=zakaz@solvar.su
SMTP_PASSWORD=ВПИШИТЕ_ПАРОЛЬ_ПОЧТОВОГО_ЯЩИКА
SMTP_FROM=zakaz@solvar.su
MAILBOX_ENABLED=true
```

`IMAP_PASSWORD` можно оставить пустым: код использует значение `SMTP_PASSWORD`. Если хотите, укажите пароль отдельно в обоих полях. Имя пользователя — полный адрес `zakaz@solvar.su`, не только часть до `@`.

После сохранения файла из каталога приложения выполните:

```bash
cd /var/www/solvar
# убедитесь, что в .env сохранён пароль; не вводите его в командную строку
export PATH="/root/.bun/bin:$PATH"
bun run build
pm2 restart solvar --update-env
pm2 save
pm2 status
```

Затем войдите в `/admin` → «Почта» и нажмите «Обновить». Если появляется сообщение об ошибке IMAP, проверьте имя пользователя, пароль, исходящие/входящие соединения с VPS и правильность настроек ящика в Beget. Не передавайте пароль в чат и не помещайте его в Git.

## Серверы Beget

Официальные настройки Beget: входящая почта `imap.beget.com`, IMAP с SSL/TLS — порт `993`; исходящая почта `smtp.beget.com`, SMTP с SSL/TLS — порт `465`.

Источник: https://beget.com/ru/kb/how-to/mail/obshhie-svedeniya
