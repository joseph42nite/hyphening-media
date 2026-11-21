-- Migration 120: the open-source plugins our monitors run on, and the Update
-- button for them.
--
-- claude-seo, claude-blog and claude-ads are installed in Claude Code on the
-- Mac. Q's weekly routine reviewed every upstream release, but its report only
-- went to a room, nobody answered, and it then recorded the new SHA as
-- "reviewed", so the next week said "no change" while the Mac still ran the old
-- version: on 2026-11-21 claude-seo was four releases behind (2.4.2 vs 2.6.2).
--
-- plugin_status keeps installed and latest apart from what was reviewed, so a
-- gap stays on the SEO and Ads Monitors until it is closed. Installed comes
-- from Claude Code's own installed_plugins.json (the version that actually
-- runs), not the newest folder in the plugin cache, which can hold a version
-- that was downloaded and never switched to.

CREATE TABLE IF NOT EXISTS plugin_status (
  plugin TEXT PRIMARY KEY CHECK (plugin IN ('claude-seo', 'claude-blog', 'claude-ads')),
  repo TEXT NOT NULL,                   -- AgriciDaniel/claude-seo
  installed_version TEXT,
  installed_sha TEXT,
  latest_version TEXT,
  latest_sha TEXT,
  latest_published_at TEXT,
  status_reported_at TEXT,              -- last time the Mac reported installed/latest
  -- Q's weekly review of the latest release.
  reviewed_version TEXT,
  reviewed_sha TEXT,
  review_verdict TEXT CHECK (review_verdict IN ('safe', 'test_first', 'wait', 'breaks')),
  review_summary TEXT,
  review_impact TEXT,
  new_skills TEXT,                      -- JSON array of skill names new in the reviewed release
  reviewed_by TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO plugin_status (plugin, repo) VALUES
  ('claude-seo', 'AgriciDaniel/claude-seo'),
  ('claude-blog', 'AgriciDaniel/claude-blog'),
  ('claude-ads', 'AgriciDaniel/claude-ads');

-- Q's two reviews so far (posted to Hyphening SEO/Code Ops), so the button
-- works from the first deploy instead of waiting for Monday's routine.
UPDATE plugin_status SET
  reviewed_version = '2.6.2', reviewed_sha = '468ed5b0d9e3249394783710e54abb02837e326b', review_verdict = 'test_first',
  review_summary = 'Four releases (2.5.0 to 2.6.2). Mostly security hardening: a stricter guard on what the page renderer may reach, a sandboxed Chromium, redirect checks. Rewritten sitemap discovery, page checks and HTML parser; report fixes. New optional Shopify, PostHog and Bing skills.',
  review_impact = 'Needs a test. All 13 skills and 4 scripts our SEO worker uses are still there under the same names; credentials still load from ~/.config/claude-seo. Technical, sitemap and images results may look different. Rebuild the runtime and re-capture drift baselines.',
  new_skills = '["seo-bing","seo-shopify","seo-posthog"]', reviewed_by = 'Q', reviewed_at = '2026-11-16 03:31:00'
WHERE plugin = 'claude-seo';

UPDATE plugin_status SET
  reviewed_version = '2.3.2', reviewed_sha = '4f9c2cb8fd17f594e868d6c2ce0e8fb2c971f987', review_verdict = 'test_first',
  review_summary = 'Hardened quality gate. Paid hero images now opt-in (--allow-paid). The repair loop stops after 3 failed gate runs per draft. The draft folder must exist before preflight gate 1.',
  review_impact = 'Needs a test. blog-write, blog-brief and blog-analyze changed; front matter and the score field look unchanged. The 3-run cap could stop the blog worker if it reuses draft folders.',
  new_skills = '[]', reviewed_by = 'Q', reviewed_at = '2026-11-09 03:30:48'
WHERE plugin = 'claude-blog';

-- One row per Update press. The Mac's plugin_update_worker claims it, updates,
-- checks every skill our workers call is still there, rebuilds what the
-- release needs, runs one smoke check and reports; any failure rolls back to
-- from_version.
CREATE TABLE IF NOT EXISTS plugin_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin TEXT NOT NULL REFERENCES plugin_status(plugin),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'updated', 'failed', 'rolled_back', 'cancelled')),
  from_version TEXT,
  target_version TEXT,
  to_version TEXT,
  requested_by TEXT,
  log TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_plugin_updates_plugin ON plugin_updates(plugin, id);
-- At most one live update per plugin.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_updates_live ON plugin_updates(plugin) WHERE status IN ('queued', 'running');
