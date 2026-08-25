-- Audit ledger. One row per code object, one row per (object, rule) verdict.
--
-- Identity rules:
--   symbol.key       line-independent: <file>::<Class.name>#<ordinal>
--   symbol.content_hash  sha256 of the exact source slice
--   rule.rule_hash       sha256 over the rule's question + trigger + evidence contract
--
-- A verdict is valid only for the (content_hash, rule_hash) pair it was produced under.
-- Either changing re-opens the work item. That is the whole invalidation model -- there is
-- no "stale" flag to forget to set.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS symbol (
  key           TEXT PRIMARY KEY,
  file          TEXT NOT NULL,
  module        TEXT,
  grp           TEXT,
  layer         TEXT,
  lang          TEXT NOT NULL,          -- ts | svelte | jsonc | rs
  name          TEXT NOT NULL,
  class_name    TEXT,
  kind          TEXT NOT NULL,          -- function | method | component | store | accessor | markup | data-row
  exported      INTEGER NOT NULL DEFAULT 0,
  start_line    INTEGER NOT NULL,
  end_line      INTEGER NOT NULL,
  start_byte    INTEGER NOT NULL,
  end_byte      INTEGER NOT NULL,
  loc           INTEGER NOT NULL,
  chars         INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  flags         TEXT NOT NULL DEFAULT '[]',   -- JSON array of computed facts
  signature     TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  alive         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS symbol_file  ON symbol(file);
CREATE INDEX IF NOT EXISTS symbol_alive ON symbol(alive);

CREATE TABLE IF NOT EXISTS rule (
  id            TEXT PRIMARY KEY,
  family        TEXT NOT NULL,
  tier          TEXT NOT NULL,           -- T0 | T1 | T2
  title         TEXT NOT NULL,
  authority     TEXT,                    -- doc path + anchor the rule is derived from
  question      TEXT NOT NULL,
  fail_requires TEXT NOT NULL DEFAULT '[]',
  not_a_finding TEXT NOT NULL DEFAULT '[]',
  trigger_json  TEXT NOT NULL,
  demotable     INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | draft | demoted
  demoted_to    TEXT,                    -- where the T0 replacement lives, once demoted
  rule_hash     TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Materialised pending set. Rebuilt by `audit plan`; rows carry the hash triple they
-- were planned against so a claim can never be honoured against stale source.
CREATE TABLE IF NOT EXISTS work (
  symbol_key   TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  rule_hash    TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | done
  attempts     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol_key, rule_id)
);
CREATE INDEX IF NOT EXISTS work_state ON work(state);

CREATE TABLE IF NOT EXISTS claim (
  symbol_key TEXT NOT NULL,
  rule_id    TEXT NOT NULL,
  worker     TEXT NOT NULL,
  run_id     TEXT,
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (symbol_key, rule_id)
);
CREATE INDEX IF NOT EXISTS claim_expiry ON claim(expires_at);

CREATE TABLE IF NOT EXISTS verdict (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_key    TEXT NOT NULL,
  rule_id       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  rule_hash     TEXT NOT NULL,
  status        TEXT NOT NULL,           -- pass | fail | n/a | undecidable
  evidence      TEXT NOT NULL DEFAULT '[]',
  na_clause     TEXT,                    -- which trigger clause did not hold (status = n/a)
  missing       TEXT,                    -- what was unavailable (status = undecidable)
  summary       TEXT,
  tier          TEXT NOT NULL DEFAULT 'T2',
  model         TEXT,
  worker        TEXT,
  run_id        TEXT,
  tokens        INTEGER,
  ms            INTEGER,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS verdict_unique
  ON verdict(symbol_key, rule_id, content_hash, rule_hash);
CREATE INDEX IF NOT EXISTS verdict_status ON verdict(status);
CREATE INDEX IF NOT EXISTS verdict_rule   ON verdict(rule_id);

-- A `fail` promoted to trackable work. Closing state is set by the repro, not by prose.
CREATE TABLE IF NOT EXISTS finding (
  id         TEXT PRIMARY KEY,
  verdict_id INTEGER NOT NULL,
  symbol_key TEXT NOT NULL,
  rule_id    TEXT NOT NULL,
  summary    TEXT NOT NULL,
  evidence   TEXT NOT NULL DEFAULT '[]',
  repro      TEXT,                       -- path to the vitest/headless case that reproduces it
  state      TEXT NOT NULL DEFAULT 'open', -- open | repro-written | false-positive | fixed
  created_at TEXT NOT NULL,
  closed_at  TEXT,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS finding_state ON finding(state);

CREATE TABLE IF NOT EXISTS run (
  id         TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  worker     TEXT,
  model      TEXT,
  batches    INTEGER NOT NULL DEFAULT 0,
  verdicts   INTEGER NOT NULL DEFAULT 0,
  note       TEXT
);
