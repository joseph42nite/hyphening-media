CREATE TABLE openclaw_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  client TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
