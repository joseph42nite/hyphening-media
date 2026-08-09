-- Migration: 063_create_tab_seen.sql
-- Per-user "I have looked at this tab" marks, so a badge can be dismissed by
-- opening the tab and then start counting again from the next new thing.
--
-- Without this the dismissal lived in React state: it never survived a reload,
-- and once a tab had been opened its badge stayed hidden for the rest of the
-- session no matter what arrived afterwards.

CREATE TABLE IF NOT EXISTS tab_seen (
  user_id INTEGER NOT NULL,
  tab TEXT NOT NULL,
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tab),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
