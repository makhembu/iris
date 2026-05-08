const SCHEMA = `
CREATE TABLE IF NOT EXISTS feeds (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT,
  error TEXT,
  iocs_fetched INTEGER DEFAULT 0,
  iocs_new INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS iocs (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ip','domain','url','hash','email','asn')),
  source TEXT NOT NULL,
  category TEXT DEFAULT 'unknown',
  description TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  cross_source_hits INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  reference TEXT,
  tags TEXT DEFAULT '[]',
  enriched INTEGER NOT NULL DEFAULT 0,
  enrichment_data TEXT,
  UNIQUE(value, type)
);

CREATE INDEX IF NOT EXISTS idx_iocs_type ON iocs(type);
CREATE INDEX IF NOT EXISTS idx_iocs_severity ON iocs(severity);
CREATE INDEX IF NOT EXISTS idx_iocs_confidence ON iocs(confidence);
CREATE INDEX IF NOT EXISTS idx_iocs_source ON iocs(source);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON iocs(value);
CREATE INDEX IF NOT EXISTS idx_iocs_last_seen ON iocs(last_seen);

CREATE TABLE IF NOT EXISTS feed_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  run_at TEXT NOT NULL,
  iocs_fetched INTEGER,
  iocs_new INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ioc_id TEXT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ioc_id) REFERENCES iocs(id)
);
`;

export function getSchema(): string {
  return SCHEMA;
}
