import test from "node:test";
import assert from "node:assert/strict";
import { parseRawMessage } from "../../packages/web/src/api/services/mailbox-imap.ts";

test("parses ordinary RFC 5322 headers and base64 UTF-8 text body", () => {
  const body = Buffer.from("Здравствуйте! Письмо по заказу получено.", "utf8").toString("base64");
  const raw = Buffer.from([
    "From: =?UTF-8?B?0J/RgNC40LLQtdGC?= <client@example.com>",
    "To: zakaz@solvar.su",
    `Subject: =?UTF-8?B?${Buffer.from("Вопрос по заказу", "utf8").toString("base64")}?=`,
    "Date: Mon, 26 Oct 2026 12:00:00 +0300",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n"), "latin1");
  const parsed = parseRawMessage(raw, "42", false);
  assert.equal(parsed.uid, "42");
  assert.equal(parsed.fromEmail, "client@example.com");
  assert.equal(parsed.subject, "Вопрос по заказу");
  assert.equal(parsed.to, "zakaz@solvar.su");
  assert.equal(parsed.date, "Mon, 26 Oct 2026 12:00:00 +0300");
  assert.equal(parsed.text, "Здравствуйте! Письмо по заказу получено.");
  assert.equal(parsed.seen, false);
});
