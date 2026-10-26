import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("admin has a mailbox section and uses typed protected mailbox procedures", () => {
  const admin = read("packages/web/src/web/pages/admin.tsx");
  const ui = read("packages/web/src/web/components/admin-mailbox.tsx");
  const routes = read("packages/web/src/api/routes/mailbox.ts");
  const router = read("packages/web/src/api/index.ts");
  assert.match(admin, /\["mail", "Почта", Mail\]/);
  assert.match(admin, /<AdminMailbox \/>/);
  for (const label of ["Входящие", "Новое письмо", "Отправить", "Ответить"]) assert.ok(ui.includes(label), `missing mailbox control: ${label}`);
  for (const proc of ["mailboxStatus", "mailboxMessages", "mailboxMessage", "sendMailboxEmail"]) assert.ok(routes.includes(proc), `missing procedure: ${proc}`);
  assert.match(routes, /admin\.handler/);
  assert.match(router, /\.\.\.mailboxManagement/);
  assert.doesNotMatch(routes, /SMTP_PASSWORD|IMAP_PASSWORD/);
});

test("orders use compact expandable cards and offer guarded deletion in every status", () => {
  const ui = read("packages/web/src/web/components/admin-orders.tsx");
  const route = read("packages/web/src/api/routes/orders.ts");
  const styles = read("packages/web/src/web/styles.css");
  assert.match(ui, /admin-order-summary/);
  assert.match(ui, /aria-expanded=\{expanded\}/);
  assert.match(ui, /Удалить заказ/);
  assert.match(ui, /orpc\.management\.deleteOrder/);
  assert.match(route, /deleteOrder: deleteOrderProcedure/);
  assert.match(route, /delete\(s\.orderHistory\).*orderId, input\.id/);
  assert.match(route, /delete\(s\.orderGuards\).*orderId, input\.id/);
  assert.match(route, /row\.notification === "sending" \|\| row\.emailNotification === "sending"/);
  assert.doesNotMatch(route.slice(route.indexOf("const deleteOrderProcedure"), route.indexOf("export const orderPublic")), /completed.*cancelled|cancelled.*completed/);
  assert.match(styles, /\.admin-order-summary/);
});

test("share metadata no longer references the old CHERNOGOR OG image", () => {
  for (const path of ["packages/web/src/api/services/page-seo.ts", "packages/web/src/web/components/seo.tsx", "packages/web/index.html"]) {
    const source = read(path);
    assert.doesNotMatch(source, /og-image\.png/);
  }
  assert.match(read("packages/web/src/api/services/page-seo.ts"), /brand\/solvar-s-square\.png/);
  assert.match(read("packages/web/index.html"), /og:image:alt.*SOLVAR/);
});
