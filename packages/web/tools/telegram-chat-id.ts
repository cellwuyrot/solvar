// Run locally on the server. Reads the token from .env, never prints it.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in root .env");
async function api(method: string) {
  let response: Response;
  try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", signal: AbortSignal.timeout(8000) }); }
  catch { throw new Error("Telegram network/timeout error (token hidden)"); }
  const body = await response.json() as { ok: boolean; result: unknown; error_code?: number };
  if (!response.ok || !body.ok) throw new Error(`Telegram error ${body.error_code || response.status} (token hidden)`);
  return body.result;
}
const webhook = await api("getWebhookInfo") as { url?: string };
if (webhook.url) throw new Error("An existing webhook is configured. This helper will not remove it. Obtain chat ID from its logs instead.");
const updates = await api("getUpdates") as { message?: { chat: { id: number; type: string } }; my_chat_member?: { chat: { id: number; type: string } } }[];
const chats = new Map<number, string>();
for (const update of updates) {
  const chat = update.message?.chat || update.my_chat_member?.chat;
  if (chat) chats.set(chat.id, chat.type);
}
if (!chats.size) console.log("No chats found. Send /start to the bot or add it to a private group and send a message, then retry.");
else for (const [id, type] of chats) console.log(`Chat ID: ${id}; type: ${type}`);
