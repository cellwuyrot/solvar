-- Additive only. No existing products, settings, orders, users or passwords are changed.
CREATE TABLE IF NOT EXISTS shop_admin_members (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  invite_state TEXT NOT NULL DEFAULT 'not_requested'
);
CREATE TABLE IF NOT EXISTS shop_admin_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
