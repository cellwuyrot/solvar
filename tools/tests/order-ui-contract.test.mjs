import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("cart checkout uses the form and no longer falls back to a Telegram hyperlink", () => {
  const cart = read("packages/web/src/web/components/cart-drawer.tsx");
  assert.match(cart, /<OrderCheckout available=\{!!q\.data\?\.ordersEnabled\}/);
  assert.doesNotMatch(cart, /href=\{q\.data\.settings\.telegram\}/);
});

test("checkout presents every requested customer contact field", () => {
  const checkout = read("packages/web/src/web/components/order-checkout.tsx");
  for (const label of ["Имя", "Удобное время для связи", "Телефон", "Email для связи", "Ник в Telegram", "Комментарий"]) assert.ok(checkout.includes(label), `missing form field ${label}`);
  assert.match(checkout, /preferredTime, telegram, comment/);
});

test("admin cards expose customer contacts and the responsible administrator", () => {
  const admin = read("packages/web/src/web/components/admin-orders.tsx");
  for (const field of ["Удобное время связи", "Телефон:", "Email:", "Telegram:", "Комментарий клиента", "Взял в работу:"]) assert.ok(admin.includes(field), `missing admin field ${field}`);
  assert.match(admin, /Взять заявку в работу/);
});

test("claim endpoint atomically assigns the order and prepares a team notification", () => {
  const route = read("packages/web/src/api/routes/orders.ts");
  assert.match(route, /claimOrder: admin\.input/);
  assert.match(route, /assignedTo: actor, status: "contacted"/);
  assert.match(route, /action: "claimed_order"/);
  assert.match(route, /заявку № \$\{publicOrderNumber\} взял администратор/);
});

test("Telegram queue sends to configured recipients and stores per-recipient progress", () => {
  const queue = read("packages/web/src/api/services/order-notifications.ts");
  assert.match(queue, /for \(const chatId of chatIds\)/);
  assert.match(queue, /telegramDeliveredChats: JSON\.stringify\(delivered\)/);
  const migration = read("packages/web/migrations/005_order_claims.sql");
  assert.match(migration, /assigned_to/);
  assert.match(migration, /telegram_delivered_chats/);
});


test("legal-document acknowledgement no longer blocks order intake", () => {
  const route = read("packages/web/src/api/routes/orders.ts");
  const orders = read("packages/web/src/api/services/orders.ts");
  const admin = read("packages/web/src/web/components/admin-orders.tsx");
  const security = read("packages/web/src/api/services/order-security.ts");
  assert.match(security, /ORDER_CAPTCHA_REQUIRED === "true"/);
  assert.doesNotMatch(route, /requireCommerce|!input\.documentsReady/);
  assert.match(route, /input\.enabled && captchaRequired\(\) && !captchaConfigured\(\)/);
  assert.doesNotMatch(orders, /COMMERCE_ENABLED/);
  assert.doesNotMatch(admin, /form\.documentsReady/);
  assert.match(admin, /Включить приём заявок/);
  const information = read("packages/web/src/web/pages/information.tsx");
  assert.doesNotMatch(information, /Дистанционное оформление заказов и бронирование на сайте недоступны/);
});


test("visit activation does not depend on address, policy length, or CAPTCHA setup", () => {
  const route = read("packages/web/src/api/routes/visits.ts");
  const visits = read("packages/web/src/api/services/visits.ts");
  const admin = read("packages/web/src/web/components/admin-visits.tsx");
  const env = read(".env.template");
  assert.doesNotMatch(route, /input\.enabled && !current\.ready/);
  assert.match(visits, /enabled: config\.enabled/);
  assert.match(visits, /VISIT_CAPTCHA_REQUIRED === "true"/);
  assert.match(admin, /не блокируют включение записи/);
  assert.match(env, /^VISIT_CAPTCHA_REQUIRED=false$/m);
});
