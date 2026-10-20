-- Additive migration; existing products, settings and auth tables are unchanged.
CREATE TABLE IF NOT EXISTS shop_order_integration (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  notification TEXT NOT NULL DEFAULT 'pending',
  notification_updated_at TEXT NOT NULL,
  notification_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS shop_orders_created_at_idx ON shop_orders (created_at DESC, id DESC);
