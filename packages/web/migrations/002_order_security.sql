CREATE TABLE IF NOT EXISTS shop_order_guards (key TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL, blocked_until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_order_rate_limits (key TEXT PRIMARY KEY NOT NULL, window_start INTEGER NOT NULL, hits INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_order_history (id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shop_order_history_order_idx ON shop_order_history (order_id, at);
-- Guards for legacy orders are created on first matching submission inside the same transaction.
