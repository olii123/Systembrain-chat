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

-- Knowledge base: text chunks from the client's website, FAQs and (later) PDFs.
-- The embedding for each chunk lives in Vectorize (index systembrain-kb, namespace = client_id) under the same id.
CREATE TABLE IF NOT EXISTS kb_chunks (
  id          TEXT PRIMARY KEY,           -- sha256(client_id, url, text), also the Vectorize vector id
  client_id   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web','faq','pdf')),
  url         TEXT NOT NULL,              -- page URL, or faq:<client>:<n> for FAQ entries
  title       TEXT,
  text        TEXT NOT NULL,
  hash        TEXT NOT NULL,              -- sha256 of text
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_client ON kb_chunks(client_id, url);

CREATE TABLE IF NOT EXISTS kb_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  website     TEXT,
  pages       INTEGER,
  chunks      INTEGER,
  added       INTEGER,
  removed     INTEGER,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_kb_runs_client ON kb_runs(client_id, id);
