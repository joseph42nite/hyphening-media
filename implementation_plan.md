# Implementation Plan: OpenClaw SEO Command Center

### v3 — full agent fleet, token budget control, staleness-aware triggering, install/dependency plan, and the OpenClaw setup prompt

This is the consolidated, buildable version: 25 claude-seo skills as independently triggerable agents, an admin approval gate before any run spends tokens, a staleness/cadence system so nobody re-runs agents that don't need it, full token usage tracking per client/agent/staff member, the human outreach layer, and the exact plugin/dependency install steps plus the OpenClaw prompt needed to stand this up.

---

## 0. Install & Dependency Plan (do this before anything else)

This has to happen on the machine/server running OpenClaw, before any of the backend code below will have anything to call.

### 0.1 Install claude-seo itself

```bash
# Inside OpenClaw / Claude Code's plugin system
/plugin marketplace add AgricIDaniel/claude-seo
/plugin install claude-seo@AgricIDaniel
```

This pulls all 25 skill folders into `~/.claude/skills/seo*`. Verify with:

```bash
ls ~/.claude/skills/ | grep seo
```

You should see all 25: `seo`, `seo-audit`, `seo-page`, `seo-technical`, `seo-content`, `seo-content-brief`, `seo-schema`, `seo-sitemap`, `seo-images`, `seo-geo`, `seo-local`, `seo-maps`, `seo-hreflang`, `seo-google`, `seo-backlinks`, `seo-cluster`, `seo-sxo`, `seo-drift`, `seo-ecommerce`, `seo-flow`, `seo-competitor-pages`, `seo-plan`, `seo-programmatic`, `seo-dataforseo`, `seo-image-gen`.

### 0.2 Python environment (several skills shell out to Python tooling)

```bash
python3 -m venv ~/.claude/skills/.venv
source ~/.claude/skills/.venv/bin/activate
pip install -r ~/.claude/skills/seo/requirements.txt   # confirm exact file name after install
```

`seo-drift` specifically needs SQLite access from Python for its baseline/compare/history functions — confirm `sqlite3` is available in this venv (it's stdlib, so this is usually automatic, but verify on your specific server image).

### 0.3 Browser automation dependency (for visual/technical checks)

Several agents (`seo-technical`, `seo-images`, `seo-page`) render pages to check Core Web Vitals and layout — this needs Playwright:

```bash
pip install playwright
playwright install --with-deps chromium
```

### 0.4 Optional data-enrichment MCP servers — decide budget before enabling

- **`seo-dataforseo`**: requires a DataForSEO account + API credentials. This is what upgrades `seo-backlinks`, `seo-maps`, `seo-google`-adjacent keyword data from free-tier estimates to real numbers. **This is a recurring paid cost per lookup** — do not enable it globally until you've decided a per-client budget (see Section 6, token/cost tracking, which should log DataForSEO spend alongside LLM token spend).
- **`seo-google`**: needs a Google Cloud project with Search Console API, PageSpeed Insights API, and GA4 API enabled, plus OAuth credentials or a service account with access granted per client's Search Console property. This is a manual per-client setup step, not a one-time global install — budget onboarding time for each new client.
- **`seo-image-gen`**: needs a Banana/Gemini image API key. Optional — only wire this in if you actually want AI-generated OG/hero images as part of the pipeline.

### 0.5 Register the MCP servers with OpenClaw

Add to OpenClaw's MCP config (exact file depends on your OpenClaw install, typically `~/.openclaw/mcp.json` or via `/mcp add`):

```json
{
  "mcpServers": {
    "dataforseo": {
      "url": "<dataforseo-mcp-endpoint>",
      "apiKey": "<env:DATAFORSEO_API_KEY>"
    },
    "google-search-console": {
      "url": "<google-mcp-endpoint>",
      "credentials": "<path-to-service-account.json>"
    }
  }
}
```

Keep API keys in environment variables / secrets manager, never committed to the repo.

### 0.6 Configure the concurrency lane

In OpenClaw's agent config, add a dedicated lane so SEO agents don't compete with (or get starved by) any other automation you're running:

```json
{
  "lanes": {
    "seo-agents": { "maxConcurrent": 3 }
  }
}
```

Start at 3. Raise it later once you've watched real runs for rate-limit or site-crawl issues (see the concurrency discussion in Section 5).

### 0.7 Verify end-to-end before building backend integration

Run one skill manually first, e.g.:

```
/seo technical https://dentalchemy.in
```

Confirm it returns a structured result before wiring up the webhook pipeline — this isolates "is claude-seo installed correctly" from "is my backend integration correct."

---

## 1. System Architecture

```
  +--------------------------------------------------------------------------------+
  |                                   Admin Portal                                 |
  |  - Select Client | Manage URLs | Trigger Agents (staleness-aware)              |
  |  - Approval Center: approve/reject pending agent runs before they spend tokens |
  |  - Token Usage Dashboard: spend by client / agent / staff member / time window |
  |  - Outreach Hub: targets, pitches, PR requests                                 |
  +-----------------------^--------------------------------+-----------------------+
                          |                                |
                 API Requests & SSE                Trigger Agent HTTP POST
                          |                                |
  +-----------------------+--------------------------------v-----------------------+
  |                            Hyphening Express Backend                           |
  |  - Staleness check: is this agent's last run still "fresh"? warn before re-run |
  |  - Pending-action queue: nothing runs until an admin (or auto-approved admin   |
  |    self-trigger) approves it                                                  |
  |  - OpenClaw lane queue (seo-agents, maxConcurrent: 3) executes approved runs   |
  |  - Token usage logger: records every agent run's token/cost against client,    |
  |    agent type, and the staff member who triggered it                          |
  +-----------------------^--------------------------------+-----------------------+
                          |                                |
                   Webhook API POST               Run via OpenClaw lane
                          |                                |
  +-----------------------+--------------------------------v-----------------------+
  |                       OpenClaw SEO Agent Fleet (25 agents)                     |
  |  - Each claude-seo skill invoked as its own agent, tagged with model used      |
  |    (Claude for judgment-heavy agents, optionally DeepSeek V4 Flash for cheap   |
  |    structured-check agents — see Section 8)                                   |
  |  - Reports token usage + findings back per run                                |
  +--------------------------------------------------------------------------------+
```

---

## 2. Full Skill → Agent Mapping (all 25 claude-seo skills)

| #   | Skill                  | Agent role                                | `audit_type` key   | Suggested re-run cadence            |
| --- | ---------------------- | ----------------------------------------- | ------------------ | ----------------------------------- |
| 1   | `seo`                  | Orchestrator — full audit                 | `full`             | On-demand / monthly                 |
| 2   | `seo-audit`            | Full-site audit backend                   | `full`             | On-demand / monthly                 |
| 3   | `seo-page`             | Single-page deep audit                    | `page`             | On-demand, tied to page work        |
| 4   | `seo-technical`        | Crawlability, CWV, indexability           | `technical`        | Monthly                             |
| 5   | `seo-content`          | E-E-A-T content audit                     | `content`          | Monthly                             |
| 6   | `seo-content-brief`    | Writer briefs                             | `content_brief`    | On-demand, tied to content calendar |
| 7   | `seo-schema`           | Schema markup detection/gen               | `schema`           | Once, then after site changes       |
| 8   | `seo-sitemap`          | Sitemap validation                        | `sitemap`          | Once, then after site changes       |
| 9   | `seo-images`           | Image/alt/CLS audit                       | `images`           | Monthly                             |
| 10  | `seo-geo`              | AI Overview / GEO citability              | `geo`              | Monthly                             |
| 11  | `seo-local`            | GBP / NAP / local citations               | `local`            | Weekly                              |
| 12  | `seo-maps`             | Geo-grid rank tracking (needs DataForSEO) | `maps`             | Weekly                              |
| 13  | `seo-hreflang`         | International SEO                         | `hreflang`         | Once, then after site changes       |
| 14  | `seo-google`           | Search Console / PageSpeed / GA4          | `google`           | Weekly                              |
| 15  | `seo-backlinks`        | Backlink analysis, feeds Outreach Hub     | `backlinks`        | Weekly                              |
| 16  | `seo-cluster`          | Semantic clustering                       | `cluster`          | Monthly                             |
| 17  | `seo-sxo`              | Search experience optimization            | `sxo`              | Monthly                             |
| 18  | `seo-drift`            | Regression detection vs. baseline         | `drift`            | Automatic, weekly schedule          |
| 19  | `seo-ecommerce`        | Product schema / Shopping (conditional)   | `ecommerce`        | Monthly, only if applicable         |
| 20  | `seo-flow`             | Strategic FLOW planning                   | `flow`             | Quarterly                           |
| 21  | `seo-competitor-pages` | Comparison/alternatives pages             | `competitor_pages` | On-demand                           |
| 22  | `seo-plan`             | Full strategic plan                       | `plan`             | Once per client onboarding          |
| 23  | `seo-programmatic`     | Programmatic SEO (conditional)            | `programmatic`     | On-demand, only if applicable       |
| 24  | `seo-dataforseo`       | Live data enrichment (paid)               | `dataforseo`       | As needed, budget-gated             |
| 25  | `seo-image-gen`        | AI image generation (optional)            | `image_gen`        | On-demand                           |

Conditional agents (`local`, `maps`, `ecommerce`, `hreflang`, `programmatic`) are filtered per client type in the Admin Portal but remain manually triggerable regardless.

---

## 3. Database Layer

#### [NEW] `043_add_seo_audit_tables.sql`

```sql
ALTER TABLE crm_clients ADD COLUMN website_url TEXT;
ALTER TABLE crm_clients ADD COLUMN instagram_url TEXT;
ALTER TABLE crm_clients ADD COLUMN youtube_url TEXT;

CREATE TABLE IF NOT EXISTS seo_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  audit_type TEXT NOT NULL CHECK(audit_type IN (
    'full','page','technical','content','content_brief','schema','sitemap','images',
    'geo','local','maps','hreflang','google','backlinks','cluster','sxo','drift',
    'ecommerce','flow','competitor_pages','plan','programmatic','dataforseo','image_gen'
  )),
  url TEXT NOT NULL,
  health_score INTEGER,
  technical_score INTEGER,
  content_score INTEGER,
  on_page_score INTEGER,
  schema_score INTEGER,
  performance_score INTEGER,
  geo_score INTEGER,
  backlinks_score INTEGER,
  local_score INTEGER,
  sxo_score INTEGER,
  summary TEXT,
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seo_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
  metric TEXT NOT NULL,
  issue TEXT NOT NULL,
  action_required TEXT NOT NULL,
  observation TEXT,
  dependency TEXT,
  failure_check TEXT,
  leading_indicator TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'ignored')),
  kanban_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (kanban_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_audits_client ON seo_audits(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_audits_type ON seo_audits(client_id, audit_type);
CREATE INDEX IF NOT EXISTS idx_seo_recs_audit ON seo_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client ON seo_recommendations(client_id);
```

#### [NEW] `044_add_outreach_and_control_tables.sql`

```sql
-- Outreach targets, pitches, PR requests (unchanged from prior plan)
CREATE TABLE IF NOT EXISTS outreach_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  site_name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('seo_backlinks_gap','manual','competitor_intersect','pr_platform')),
  category TEXT,
  domain_authority INTEGER,
  vetting_status TEXT NOT NULL DEFAULT 'unvetted' CHECK(vetting_status IN ('unvetted','approved','rejected_spam','rejected_irrelevant')),
  contact_name TEXT,
  contact_email TEXT,
  contact_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outreach_pitches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  assigned_to TEXT,
  pitch_subject TEXT,
  pitch_body TEXT,
  date_sent TEXT,
  follow_up_date TEXT,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK(status IN ('drafted','sent','followed_up','replied','accepted','declined','live','stale')),
  link_type TEXT CHECK(link_type IN ('dofollow','nofollow','sponsored', NULL)),
  live_url TEXT,
  is_paid_placement INTEGER NOT NULL DEFAULT 0,
  placement_cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (target_id) REFERENCES outreach_targets(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pr_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  request_summary TEXT NOT NULL,
  deadline TEXT,
  relevance_score INTEGER,
  draft_quote TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','used','missed','not_relevant')),
  outlet_name TEXT,
  live_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Approval gate: nothing runs (and spends tokens) without this
CREATE TABLE IF NOT EXISTS openclaw_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  action_type TEXT NOT NULL,           -- e.g. 'run_seo_agent', 'post_social', etc.
  action_payload TEXT NOT NULL,        -- JSON: { agentType, url, model, ... }
  requested_by TEXT NOT NULL,          -- staff user id
  requested_role TEXT NOT NULL,        -- 'admin' | 'staff'
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','auto_approved')),
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Per-agent cadence/staleness config
CREATE TABLE IF NOT EXISTS agent_run_config (
  audit_type TEXT PRIMARY KEY,
  stale_after_days INTEGER NOT NULL,   -- e.g. 30 for monthly, 7 for weekly, 9999 for "once"
  default_model TEXT NOT NULL DEFAULT 'claude', -- 'claude' | 'deepseek-v4-flash'
  notes TEXT
);

-- Token & cost usage log — one row per agent run
CREATE TABLE IF NOT EXISTS token_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  audit_id INTEGER,                    -- link back to seo_audits row, if applicable
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,                 -- 'claude-sonnet-4-6', 'deepseek-v4-flash', etc.
  triggered_by TEXT NOT NULL,          -- staff user id
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  external_api_cost_usd REAL NOT NULL DEFAULT 0, -- DataForSEO etc., logged separately from LLM cost
  duration_seconds INTEGER,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE SET NULL
);

-- Optional: monthly/weekly budget caps per client, to hard-stop overspend
CREATE TABLE IF NOT EXISTS token_budgets (
  client_id INTEGER PRIMARY KEY,
  monthly_budget_usd REAL NOT NULL DEFAULT 50,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80, -- warn at 80% of budget
  hard_stop INTEGER NOT NULL DEFAULT 0,             -- 1 = block new runs once budget hit
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outreach_targets_client ON outreach_targets(client_id);
CREATE INDEX IF NOT EXISTS idx_outreach_pitches_target ON outreach_pitches(target_id);
CREATE INDEX IF NOT EXISTS idx_outreach_pitches_client_status ON outreach_pitches(client_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_requests_client ON pr_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON openclaw_pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_token_usage_client ON token_usage_log(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage_log(agent_type, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_staff ON token_usage_log(triggered_by, created_at);
```

#### [SEED] `045_seed_agent_run_config.sql`

Pre-populate the cadence table from Section 2's suggested cadence:

```sql
INSERT INTO agent_run_config (audit_type, stale_after_days, default_model, notes) VALUES
('full', 30, 'claude', 'On-demand/monthly'),
('technical', 30, 'deepseek-v4-flash', 'Structured checks — cheap model candidate'),
('content', 30, 'claude', 'Judgment-heavy — keep on Claude'),
('content_brief', 9999, 'claude', 'On-demand, tied to content calendar'),
('schema', 9999, 'deepseek-v4-flash', 'Structured extraction — cheap model candidate'),
('sitemap', 9999, 'deepseek-v4-flash', 'Structured — cheap model candidate'),
('images', 30, 'deepseek-v4-flash', 'Structured checks — cheap model candidate'),
('geo', 30, 'claude', 'Nuanced citability judgment'),
('local', 7, 'claude', 'Weekly'),
('maps', 7, 'claude', 'Weekly, needs DataForSEO'),
('hreflang', 9999, 'deepseek-v4-flash', 'Structured validation'),
('google', 7, 'claude', 'Weekly'),
('backlinks', 7, 'claude', 'Weekly, feeds outreach — needs judgment on link quality'),
('cluster', 30, 'claude', 'Monthly'),
('sxo', 30, 'claude', 'Monthly, judgment-heavy'),
('drift', 7, 'claude', 'Automatic weekly, not manually triggered'),
('ecommerce', 30, 'claude', 'Conditional'),
('flow', 90, 'claude', 'Quarterly strategy'),
('competitor_pages', 9999, 'claude', 'On-demand'),
('plan', 9999, 'claude', 'Once per onboarding'),
('programmatic', 9999, 'claude', 'On-demand, conditional'),
('dataforseo', 9999, 'claude', 'Budget-gated, on-demand'),
('image_gen', 9999, 'claude', 'On-demand creative');
```

Adjust `default_model` per your own risk tolerance — this seed reflects the "structured checks on cheap model, judgment on Claude" split discussed in Section 8.

---

## 4. Backend Layer

#### [MODIFY] `openclaw.js`

- `handleCreateSeoAudit(payload)`:
  - Insert into `seo_audits` keyed by `audit_type`.
  - Batch-insert recommendations into `seo_recommendations`.
  - If `audit_type === 'backlinks'`, upsert candidate rows into `outreach_targets`.
  - **New:** insert a row into `token_usage_log` from the payload's token/cost metadata (every agent run must report this back).
  - Sync scores with `marketing_monthly_report`.

#### [NEW] `seo.js`

- `GET /api/clients/:id/seo/audits?type=:agentType`
- `GET /api/clients/:id/seo/audits/:auditId`
- `GET /api/clients/:id/seo/agents/status` — for each of the 25 `audit_type`s, returns last run timestamp, freshness (`fresh`/`stale`/`never_run`) computed against `agent_run_config.stale_after_days`, and last score. This backs the color-coded agent grid.
- `POST /api/clients/:id/seo/trigger/:agentType`:
  1. Look up `stale_after_days` for this agent; if last run is still fresh, respond with a confirmation prompt payload (`{ requiresConfirmation: true, lastRunAgeDays, staleAfterDays }`) instead of queuing immediately — the frontend shows "This was checked 4 days ago and doesn't need to be re-run yet — run anyway?" and only proceeds on explicit confirm.
  2. Check `token_budgets` for the client — if `hard_stop = 1` and spend this month ≥ `monthly_budget_usd`, reject with a budget-exceeded error.
  3. Insert into `openclaw_pending_actions`. If `requested_role === 'admin'`, auto-set `status = 'auto_approved'` and immediately submit to the OpenClaw `seo-agents` lane. Otherwise leave `status = 'pending'` for the Approval Center.
- `POST /api/clients/:id/seo/trigger-all` — same staleness + budget checks, applied per agent, batched into the pending queue.
- `POST /api/clients/:id/seo/recommendations/:recId/convert-task`
- `PATCH /api/clients/:id/seo/recommendations/:recId`

#### [NEW] `outreach.js` — unchanged from prior plan (targets, pitches, PR requests CRUD)

#### [NEW] `approval.js`

- `GET /api/approval/pending` — lists pending `openclaw_pending_actions` rows
- `POST /api/approval/:actionId/approve` — sets `accepted`, submits to the OpenClaw lane
- `POST /api/approval/:actionId/reject` — sets `rejected`, no execution, no token spend

#### [NEW] `usage.js`

- `GET /api/usage/summary?client_id=&agent_type=&staff_id=&from=&to=` — aggregate spend (tokens + estimated cost + external API cost) grouped by any combination of client/agent/staff/date range
- `GET /api/usage/budget/:clientId` — current month spend vs. `token_budgets` cap
- `PATCH /api/usage/budget/:clientId` — update a client's monthly budget / hard-stop flag

#### [MODIFY] `server.js`

```javascript
import seoRoutes from "./src/routes/seo.js";
import outreachRoutes from "./src/routes/outreach.js";
import approvalRoutes from "./src/routes/approval.js";
import usageRoutes from "./src/routes/usage.js";

app.use("/api/clients", seoRoutes);
app.use("/api/clients", outreachRoutes);
app.use("/api/approval", approvalRoutes);
app.use("/api/usage", usageRoutes);
```

SSE events broadcast: `seo_agent_status`, `seo_agent_log`, `pending_action_created`, `budget_threshold_reached` (new — fires when a client crosses `alert_threshold_pct`).

#### [MODIFY] `openclaw_seo_runner.js`

- Accepts `--skill`, `--model` (defaulting to `agent_run_config.default_model`), submits to the `seo-agents` lane (`maxConcurrent: 3`).
- On completion, captures token usage from the model provider's response metadata (Claude API returns `usage.input_tokens`/`usage.output_tokens`; DeepSeek's API returns an equivalent `usage` object in the same shape since it speaks the Anthropic format) and includes it in the webhook payload back to `/api/openclaw/webhook`.

#### [NEW] `outreach_pitch_drafter.js` — unchanged (drafts pitch, status `drafted`, human takes over from there)

---

## 5. The OpenClaw Setup Prompt

This is what you actually paste into OpenClaw (as a role/system prompt, or the first message when setting up the SEO agent role) once Section 0's install steps are done. It tells OpenClaw how to route requests to the right skill and how to behave around approvals, staleness, and budget — it does not replace the code above, it's what makes OpenClaw operate correctly _within_ the system that code builds.

```
ROLE: SEO & Outreach Operations Agent for Hyphening Marketing Ops Center

You have access to the claude-seo plugin (25 skills, installed at ~/.claude/skills/seo*).
You operate within the Hyphening backend's agent pipeline. Follow these rules exactly:

1. AGENT ROUTING
   When asked to run an SEO check, map the request to exactly one of these trigger keys
   and invoke the matching claude-seo skill — never guess a skill name, use this table:
   full→/seo audit, technical→/seo technical, content→/seo content,
   content_brief→/seo content-brief, schema→/seo schema, sitemap→/seo sitemap,
   images→/seo images, geo→/seo geo, local→/seo local, maps→/seo maps,
   hreflang→/seo hreflang, google→/seo google, backlinks→/seo backlinks,
   cluster→/seo cluster, sxo→/seo sxo, drift→/seo drift, ecommerce→/seo ecommerce,
   flow→/seo flow, competitor_pages→/seo competitor-pages, plan→/seo plan,
   programmatic→/seo programmatic, dataforseo→/seo dataforseo, image_gen→/seo image-gen.

2. NEVER RUN AN AGENT WITHOUT AN APPROVED ACTION
   Every agent run must correspond to a row in `openclaw_pending_actions` with
   status = 'accepted' or 'auto_approved'. If you receive a trigger request that
   hasn't gone through that gate, do not execute — respond that the action needs
   approval first.

3. RESPECT STALENESS
   Before running any agent, check `agent_run_config.stale_after_days` against the
   client's last audit of that type. If the last run is still fresh, flag this back
   to the requester instead of silently re-running — do not spend tokens re-confirming
   something that hasn't had time to change.

4. RESPECT THE TOKEN BUDGET
   Before running, check the client's `token_budgets` row. If `hard_stop = 1` and this
   month's spend is at or above `monthly_budget_usd`, refuse to run and say so plainly.
   If spend is above `alert_threshold_pct`, run only if explicitly told to proceed anyway.

5. REPORT TOKEN USAGE ON EVERY RUN
   After every agent execution, include exact input/output token counts and the model
   used in your webhook payload back to /api/openclaw/webhook. This is not optional —
   the token_usage_log table depends on it for cost tracking to work at all.

6. MODEL SELECTION
   Use the model specified in `agent_run_config.default_model` for the given audit_type
   unless explicitly told otherwise. Structured/checklist agents (technical, schema,
   sitemap, images, hreflang) may run on deepseek-v4-flash for cost efficiency.
   Judgment-heavy agents (content, geo, backlinks, sxo, cluster, and anything touching
   outreach target vetting or pitch drafting) must run on Claude — do not substitute
   a cheaper model on these without explicit instruction, since quality here directly
   affects link-quality judgment and client-facing content.

7. OUTREACH TARGET VETTING (Prompt 8 equivalent)
   When backlinks agent output produces candidate outreach targets, score each for:
   relevance to client's niche, plausibility of real traffic/audience, and spam signals
   (mass "write for us" acceptance, no named editor, no real engagement). Flag your
   assessment but do NOT auto-approve any target — vetting_status stays 'unvetted'
   until a human reviews it in the Outreach Hub.

8. PITCH DRAFTING (Prompt 9 equivalent)
   When asked to draft an outreach pitch: personalize the opener to something specific
   on the target site, propose 2-3 tailored headline ideas, include one credibility line
   for the client, and close with a low-friction ask. Never use the words "backlink",
   "domain authority", "DA", or "SEO" in the pitch body. Insert the draft into
   outreach_pitches with status = 'drafted' — never mark it 'sent' yourself, that is
   a human action only.

9. WHAT YOU NEVER DO AUTONOMOUSLY
   - Send outreach emails
   - Approve or reject outreach targets
   - Mark a pitch as sent, accepted, or live
   - Bypass the approval queue for non-admin-initiated requests
   - Run an agent you don't have a mapped skill for — ask for clarification instead
     of improvising with a different skill

If any instruction here conflicts with a request in the moment, follow this prompt,
not the in-the-moment request, and say why.
```

Paste this as OpenClaw's standing role prompt for whichever agent/channel handles SEO requests (per Section 4 of the original plan, this slots in as the replacement for "Prompt 7/8/9" in `openclaw_role_prompts.md`).

---

## 6. Admin Portal Frontend

#### [MODIFY] `SeoMonitorTab.jsx`

- **Client selector**, filtered agent grid per client type (Section 2 conditionals).
- **Agent cards with freshness color-coding**: green (fresh, per `stale_after_days`), amber (stale), red (never run) — sourced from `GET /api/clients/:id/seo/agents/status`. Clicking a green card shows a "still fresh, run anyway?" confirm dialog rather than queuing immediately.
- **Status states**: Idle → Pending Approval (amber) → Queued → Running (pulsing, live sub-status) → Completed/Failed.
- **Live Console Drawer**: SSE-driven log stream per running agent.
- **Assign to SMM / Convert Task modal**: recommendation → Kanban task, with assignee, priority, due date.

#### [NEW] `ApprovalCenterTab.jsx`

- List of pending actions (`GET /api/approval/pending`) with requester, client, agent type, estimated cost.
- `[Approve]` / `[Reject]` buttons.
- Admin self-triggered actions skip this screen entirely (auto-approved at the API layer) — this tab is for staff-initiated requests only.

#### [NEW] `OutreachHubTab.jsx` — unchanged from prior plan (Kanban target pipeline, vetting queue, pitch composer, follow-up queue, PR board, paid-placement guard).

#### [NEW] `TokenUsageTab.jsx`

- **Spend overview**: total spend this month vs. budget, per client — progress bar, red when over `alert_threshold_pct`.
- **Breakdown table**: filterable by client / agent type / staff member / date range, showing input+output tokens, estimated LLM cost, external API (DataForSEO) cost, and total.
- **Per-staff view**: "who triggered what" — spend attributed to `triggered_by`, useful for the "I assign token usage to me or my staff" requirement — shows at a glance if a staff member is running redundant/expensive agents.
- **Model split chart**: spend broken down by `model` (Claude vs. DeepSeek V4 Flash) so you can actually evaluate whether the cheap-model split from Section 8 is paying off in practice, not just in theory.
- **Budget editor**: per-client `monthly_budget_usd` and `hard_stop` toggle (admin only).

#### [MODIFY] `Dashboard.jsx`

Import and register `SeoMonitorTab`, `OutreachHubTab`, `ApprovalCenterTab`, `TokenUsageTab` as tabs (Admin-only for Approval Center and Token Usage; SMM+Admin for the other two).

---

## 7. The Human Execution Layer (Outreach Playbook) — unchanged, summarized

- `seo-backlinks` auto-populates `outreach_targets`; a human vets (real traffic, relevant, not spam), finds the contact (5–10 min/site), personalizes the AI-drafted pitch, sends, follows up once after 5–7 days.
- Paid placements must be `nofollow`/`sponsored` — enforced at the DB layer (a pitch can't go `live` with `is_paid_placement = true` and no `link_type`).
- PR/journalist-request monitoring (`pr_requests` table) is the highest-ROI channel for a junior hire — daily monitoring, quotable 60–90 second answers.
- Realistic cadence: 30–50 pitches/week/client → 2–6 placements/month; ranking impact shows in 3–6 months.

---

## 8. Model Selection Strategy (Claude vs. DeepSeek V4 Flash)

Given the token-budget requirement, here's the practical split, reflected in the `agent_run_config` seed above:

| Use cheap model (DeepSeek V4 Flash)                                                                                 | Keep on Claude                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `technical`, `schema`, `sitemap`, `images`, `hreflang` — structured extraction/checklist work with little ambiguity | `content` (E-E-A-T quality judgment), `geo` (citability nuance), `backlinks` (feeds real outreach decisions), `sxo`, `cluster` |
| High-volume, low-stakes-per-error agents                                                                            | Anything touching outreach vetting or pitch drafting — errors here cost either a bad backlink or a burned relationship         |

This is a starting point, not a fixed rule — the `TokenUsageTab` model-split view is specifically there so you can compare actual cost savings against any quality drop you notice in agent output, and adjust `agent_run_config.default_model` per agent as you get real data instead of guessing upfront.

---

## 9. Verification Plan

### Automated & Integration Tests

- Migration check: all tables from Section 3 created, including `openclaw_pending_actions`, `agent_run_config`, `token_usage_log`, `token_budgets`.
- Per-agent trigger test: each of the 25 keys invokes the correct skill and writes a correctly-typed `seo_audits` row.
- Staleness test: triggering a fresh agent (last run < `stale_after_days` ago) returns `requiresConfirmation: true` instead of queuing immediately.
- Approval gate test: a staff-initiated (non-admin) trigger creates a `pending` row and does NOT submit to the OpenClaw lane until `/approve` is called; an admin-initiated trigger auto-submits.
- Budget test: a client with `hard_stop = 1` and spend ≥ budget gets triggers rejected; a client crossing `alert_threshold_pct` fires `budget_threshold_reached`.
- Token logging test: a completed agent run writes a `token_usage_log` row with non-zero tokens and correct `client_id`/`agent_type`/`triggered_by`.
- Backlinks → outreach hand-off test, paid-placement guard test, task conversion test — unchanged from prior plan.

### Manual Verification

1. Complete Section 0 install steps; confirm `/seo technical <url>` runs manually before touching the backend.
2. Trigger `technical` for a client as admin — confirm it auto-approves and runs without hitting the Approval Center.
3. Have a staff account trigger `backlinks` — confirm it appears in Approval Center as pending, and does not run until approved.
4. Re-trigger an agent that ran yesterday with `stale_after_days = 30` — confirm the "still fresh, run anyway?" prompt appears.
5. Check `TokenUsageTab` after a few runs — confirm spend, model split, and per-staff breakdown all populate correctly.
6. Set a low `monthly_budget_usd` with `hard_stop = 1` for a test client, exceed it, confirm further triggers are blocked with a clear message.

---

## 10. What This Replaces vs. What Still Needs a Person

**Fully automatable (this system does it):** technical/content/schema/sitemap/image audits, GEO scoring, backlink _analysis_, keyword clustering, drift monitoring, strategic plan generation, content briefs, first-pass pitch drafts, outreach target pre-vetting flags.

**Still needs a human, per Section 7:** finding the right contact, actually sending and following up on outreach, negotiating, judging final link quality, writing to another site's exact editorial voice, PR relationship-building, and every approval/reject decision in the Approval Center and Outreach Hub vetting queue.

This system turns SEO operations into something you or a coordinator-level staff member can run and supervise — not something that requires zero human involvement.
