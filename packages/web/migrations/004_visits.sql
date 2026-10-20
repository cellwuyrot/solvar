CREATE TABLE IF NOT EXISTS visit_config (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
INSERT INTO visit_config (id, data) VALUES ('main', '{"enabled":false,"telegramEnabled":false,"chatId":""}') ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS visit_requests (
 id TEXT PRIMARY KEY NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 name TEXT NOT NULL, phone TEXT NOT NULL, preferred_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new', manager_id TEXT NOT NULL DEFAULT '', appointment_at TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 0, policy_hash TEXT NOT NULL, policy_text TEXT NOT NULL,
 notification TEXT NOT NULL DEFAULT 'disabled', attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visit_created_idx ON visit_requests(created_at, id);
CREATE TABLE IF NOT EXISTS visit_events (id TEXT PRIMARY KEY NOT NULL, visit_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL);
