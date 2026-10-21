import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrderChatIds } from "../../packages/web/src/shared/order-helpers.ts";

test("notification targets merge the old single ID with admin IDs and remove duplicates", () => {
  assert.deepEqual(getOrderChatIds({ chatId: "123456", adminChatIds: "123456\n987654, -1001234567890 987654" }), ["123456", "987654", "-1001234567890"]);
  assert.deepEqual(getOrderChatIds({ chatId: "", adminChatIds: "not-a-chat" }), []);
});

test("recipient parser limits output to 30 valid IDs", () => {
  const ids = Array.from({ length: 33 }, (_, i) => String(i + 1)).join("\n");
  assert.equal(getOrderChatIds({ adminChatIds: ids }).length, 30);
});
