/** Backward-compatible order notification recipients: merge the legacy single ID and the admin list. */
export function getOrderChatIds(config: { chatId?: string; adminChatIds?: string }) {
  const listed = (config.adminChatIds || "").split(/[\s,;]+/).filter(Boolean);
  return [...new Set([...(config.chatId ? [config.chatId.trim()] : []), ...listed].filter(id => /^-?\d+$/.test(id)))].slice(0, 30);
}
