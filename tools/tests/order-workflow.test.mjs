import { test } from "node:test";
import assert from "node:assert/strict";
import { integrationSchema, orderInputSchema } from "../../packages/web/src/shared/orders.ts";
import { getOrderChatIds } from "../../packages/web/src/shared/order-helpers.ts";

const validOrder = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  name: "Анна Смирнова",
  phone: "+7 (999) 123-45-67",
  email: "anna@example.com",
  preferredTime: "Будни после 18:00",
  telegram: "@anna_shop",
  comment: "Позвонить перед отправкой",
  consent: true,
  expectedTotalKopecks: 49900,
  items: [{ productId: "cigar-box", qty: 1 }],
};

test("checkout accepts the requested contact fields", () => {
  const result = orderInputSchema.safeParse(validOrder);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  assert.equal(result.data.preferredTime, validOrder.preferredTime);
  assert.equal(result.data.telegram, validOrder.telegram);
});

test("checkout rejects missing contact time and malformed Telegram usernames", () => {
  assert.equal(orderInputSchema.safeParse({ ...validOrder, preferredTime: " " }).success, false);
  assert.equal(orderInputSchema.safeParse({ ...validOrder, telegram: "https://t.me/anna_shop" }).success, false);
  assert.equal(orderInputSchema.safeParse({ ...validOrder, telegram: "@ab" }).success, false);
});

test("admin notification IDs accept multiple numeric targets and reject invalid values", () => {
  assert.equal(integrationSchema.safeParse({ adminChatIds: "123456\n-1001234567890, 987654" }).success, true);
  assert.equal(integrationSchema.safeParse({ adminChatIds: "123456\nnot-a-chat" }).success, false);
  assert.equal(integrationSchema.safeParse({ adminChatIds: Array.from({ length: 31 }, (_, i) => String(i + 1)).join("\n") }).success, false);
});

test("notification targets merge old configuration and deduplicate IDs", () => {
  assert.deepEqual(getOrderChatIds({ chatId: "123456", adminChatIds: "123456\n987654, -1001234567890 987654" }), ["123456", "987654", "-1001234567890"]);
  assert.deepEqual(getOrderChatIds({ chatId: "", adminChatIds: "not-a-chat" }), []);
});
