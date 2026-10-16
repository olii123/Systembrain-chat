-- SystemBrain chat schema. Every row carries client_id and every query filters on it.
-- Written for Cloudflare D1 (SQLite).
-- The local JSON store (server/data/db.json) uses the same tables and columns.

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,          -- sessionId from the widget
  client_id   TEXT NOT NULL,
  started_at  TEXT NOT NULL,             -- ISO 8601
  updated_at  TEXT NOT NULL,
  ended_at    TEXT,
  page_url    TEXT,
  user_agent  TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(client_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);

CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       TEXT NOT NULL,
  conversation_id TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('quote','booking')),
  name            TEXT,
  mobile          TEXT,
  email           TEXT,
  booking_day     TEXT,
  booking_time    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id, conversation_id);

CREATE TABLE IF NOT EXISTS summaries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  client_id       TEXT NOT NULL,
  summary         TEXT NOT NULL,
  email_to        TEXT,
  email_status    TEXT NOT NULL DEFAULT 'not_sent',  -- later: 'sent' once email is wired up
  created_at      TEXT NOT NULL
);
