-- 120_reel_lab.sql
-- Reel Lab (Script Tracker, "From viral reel" and "Improve hooks").
--
-- Staff paste the viral reels they found and what happens in them; the Mac's
-- ig_worker (scripts/ig_worker.mjs) writes five hooks, a script, on-screen
-- text and a caption with the instagram-agent skills, and scores them with
-- the skills' own Python tools. Nothing is posted: saving a result makes a
-- Draft script, which the client never sees until staff move it on.
--
-- Statuses:
--   queued -> running -> ready -> saved
--                     -> failed
--
-- mode 'new' makes a new script; 'improve' rewrites the hooks of an existing
-- one (script_id), and saving it updates that script.

CREATE TABLE IF NOT EXISTS reel_lab_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'new' CHECK (mode IN ('new', 'improve')),
  script_id INTEGER REFERENCES marketing_scripts(id) ON DELETE SET NULL,
  month TEXT,                              -- YYYY-MM the saved script goes into
  topic TEXT,
  references_json TEXT NOT NULL DEFAULT '[]', -- [{ url, notes }] the viral reels and what happens in them
  notes TEXT,                              -- anything else for the writer
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed', 'saved')),
  requested_by TEXT,
  worker TEXT,
  model TEXT,
  result_json TEXT,
  error TEXT,
  log TEXT,
  saved_script_id INTEGER REFERENCES marketing_scripts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reel_lab_runs_client ON reel_lab_runs(client_id, id);
CREATE INDEX IF NOT EXISTS idx_reel_lab_runs_status ON reel_lab_runs(status);

-- Which hook a script went out with, so the content tracker's numbers can
-- later be traced back to the hook formula that earned them.
ALTER TABLE marketing_scripts ADD COLUMN hook_formula TEXT;
ALTER TABLE marketing_scripts ADD COLUMN hook_text TEXT;
ALTER TABLE marketing_scripts ADD COLUMN hook_score REAL;
ALTER TABLE marketing_scripts ADD COLUMN reel_lab_run_id INTEGER REFERENCES reel_lab_runs(id) ON DELETE SET NULL;

-- Instagram-only voice, read with the rest of onboarding: how the client
-- talks on camera, and phrases they actually say.
ALTER TABLE crm_clients ADD COLUMN ig_on_camera_style TEXT;
ALTER TABLE crm_clients ADD COLUMN ig_signature_phrases TEXT;
