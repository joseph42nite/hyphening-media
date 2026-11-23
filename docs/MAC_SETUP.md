# Setting up the Hyphening Mac

Everything the Mac does for the Ops Center (SEO, ads, blog, fixes, deploys,
plugin updates, Reel Lab) and what a new Mac needs to do it. The portal itself
runs on the EC2 box (`aws_deployment_guide.md`). This Mac runs the **workers**:
they pull queued work from the portal over signed webhooks and do it locally
with Claude Code. How the night runs fit together, and what breaks them, is in
[NIGHT_PIPELINE.md](NIGHT_PIPELINE.md).

Two backups are already in place, so a new Mac copies from them instead of
rebuilding by hand:

| Backup | Holds | Where |
|---|---|---|
| `agent-setup` (private GitHub repo `joseph42nite/agent-setup`, cloned at `~/agent-setup`) | OpenMausBot bots, souls, memories, rooms, **routines**; Claude Code settings, plans, project memories | Pushed nightly at 04:30 by launchd. Its README has the restore steps. |
| `vault` (private GitHub repo `joseph42nite/vault`, lives on the `Mac Valhalla` drive) | Plans, SOPs, decisions, client notes, the blog audio queue | The external drive itself |

Neither holds keys or tokens. Those are re-entered by hand (list below).

Last checked against the running Mac: 23 Nov 2026 (Intel x86_64, macOS 15.8, 8 GB RAM).

---

## 1. Apps

| App | Why | Notes |
|---|---|---|
| **Claude Code** CLI (`~/.local/bin/claude`) and the Claude desktop app | Every worker shells out to `claude` | Sign in with the Max account. Was 2.1.310. |
| **OpenMausBot** | The bots (Q, Tanner, Boothroyd, Leiter, Vesper, Moneypenny, M, MausBot): night reports, reviews, briefs, health checks | Restore from `agent-setup`. The night work itself no longer needs it (server queues, launchd connector). |
| **Docker Desktop** | Kokoro TTS container for blog narration; the F16s local stack | Kokoro starts Docker itself when audio renders. |
| **Google Chrome** | Browser the bots and Claude in Chrome drive | |
| **Antigravity** | Draws blog covers overnight (`COVERS_VIA_ANTIGRAVITY`) | |
| **Obsidian** | Opens the vault | |

## 2. Command-line tools

| Tool | Version here | Why |
|---|---|---|
| Node via **nvm** | 24.21 installed; the repo pins **20** (`.nvmrc`) | Workers, portal dev server, tests. Install 20 too: `nvm install 20`. better-sqlite3 crashes the vitest workers under Node 24. |
| **Python 3.12** at `~/.local/bin/python3.12` | 3.12.15 | claude-seo's runtime needs 3.11+; the system python3 is 3.9. |
| **uv** at `~/.local/bin/uv` | | Python installs |
| **ffmpeg** at `~/.local/bin/ffmpeg` | | Reel Lab, audio |
| rsync, ssh, git | macOS built-ins | Deploys (`scripts/deploy_worker.mjs`) |

There is no Homebrew on this Mac; tools live in `~/.local/bin`.

## 3. Folders

| Path | What |
|---|---|
| `~/Projects/hyphening-media` | This repo. Clone from `github.com/joseph42nite/hyphening-media`, `npm install` in the root and in `frontend/`. |
| `~/Projects/dr-divya1` | Dr. Divya's site repo (SEO fixes, blog publishing, rsync deploy) |
| `~/Projects/dentalchemy`, `dentalchmey-landing`, `dentalchemy-reels`, `f16sefreight`, `skinshop247` | Other client repos |
| `/Volumes/Mac Valhalla/Vault` | The vault. Health check BLOCKS without it. |
| `~/agent-setup` | Backup repo (must be on the internal disk: launchd can't run scripts from an external drive) |
| `~/.hyphening-tts/` | Kokoro renderer (`kokoro-render`), voices, pronunciations, Fish Audio key file |
| `~/.hyphening/` | Health-check state, cover queue |

Each client's `repo_path` in the CRM must point at its folder on this Mac; the
health check flags a missing one.

## 4. Secrets to re-enter (never in git)

**`~/Projects/hyphening-media/.env`** (the Mac's copy, not the server's):

- `HYPHENING_API_URL=https://hypheningmedia.com`
- `HYPHENING_HMAC_SECRET`: must match the server; signs every worker webhook
- `MAC_CONNECTOR_SECRET`: must match the server; the connector's WebSocket token
- `Q_READONLY_EMAIL`, `Q_READONLY_PASSWORD`: the read-only portal login the health check uses
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: only for running the portal locally
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`

The server's full list is in `.env.example`.

**Elsewhere:**

- `~/.ssh/`: `id_ed25519` (GitHub and the `hyphening` EC2 host) and `drdivya_deploy` (Dr. Divya's host), plus `~/.ssh/config` with the `hyphening` and `drdivya` host entries. Copy them from the old Mac or make new keys and add them to GitHub and both servers.
- `~/.hyphening-tts/fish_audio.key`
- `gh auth login` for GitHub
- OpenMausBot: model provider keys, webhook key, hook tokens (agent-setup leaves these out on purpose)
- Claude Code MCP logins: DataForSEO, Google Drive, Canva, HeyGen and the rest reconnect on first use

## 5. Claude Code plugins and the claude-seo runtime

1. Copy `~/agent-setup/claude/settings.json` to `~/.claude/settings.json` and start `claude` once; claude-seo, claude-blog and claude-ads install from their marketplaces.
2. Check `~/.claude/settings.json` has `env.CLAUDE_SEO_DATA_DIR` set to `~/.claude/plugins/data/claude-seo-agricidaniel-claude-seo`. Without it, skills pick up a stale runtime with no Chromium.
3. Build claude-seo's Python runtime for the version Claude Code runs (see `installPath` in `~/.claude/plugins/installed_plugins.json`):

   ```bash
   PIP_ONLY_BINARY=cryptography CLAUDE_PLUGIN_ROOT=<installPath> CLAUDE_PLUGIN_DATA=~/.claude/plugins/data/claude-seo-agricidaniel-claude-seo CLAUDE_SEO_PYTHON=~/.local/bin/python3.12 <installPath>/scripts/claude-seo setup
   ```

   `PIP_ONLY_BINARY=cryptography` is for Intel Macs, where building cryptography from source fails. If SEO cards finish in about a minute, or drift says "runtime is not ready", this step is missing or was built for another version. After that, **Update & test** in the SEO Monitor rebuilds it on each plugin update (`scripts/plugin_update_worker.mjs`).

## 6. Background jobs

| Job | Started by | Schedule |
|---|---|---|
| Mac connector (`scripts/mac_connector.mjs`) | launchd `com.hyphening.mac-connector` | Always connected; starts workers 11:00–18:00 and 00:55–05:30 IST |
| Night SEO audits, fixes, blog drafts (queued) | the server's scheduler | 01:15, 03:30, 01:00 IST |
| Night reports, reviews, briefs, health checks | OpenMausBot routines | See NIGHT_PIPELINE.md |
| agent-setup backup | launchd `com.hyphening.agent-setup-backup` | 04:30 daily |
| Night deploy signal | the server's scheduler | 00:30 IST |

Install the connector job with `bash scripts/launchd/install-mac-connector.sh` (rerun it after switching Node versions; `uninstall` removes it). Log: `~/Library/Logs/hyphening-mac-connector.log`. To restore the launchd backup job, follow step 7 of `~/agent-setup/README.md`.

## 7. Check it works

```bash
cd ~/Projects/hyphening-media && bash scripts/health-check.sh
```

Everything should read OK apart from per-client onboarding warnings. Then:

- install the connector job (above), then check the SEO Monitor has no "Mac connector offline" banner and, inside a window, the plugins line shows a fresh "last reported" time;
- run one cheap SEO card (sitemap) for Hyphening Media and confirm it takes more than a minute and has crawl data;
- check OpenMausBot's Routines page lists every routine in `~/agent-setup/openmausbot/routines/` as enabled.

## RAM on an 8 GB Mac

Measured 23 Nov 2026:

| What | RAM |
|---|---|
| Docker's F16s stack (ClamAV ~1 GB, MySQL ~0.5 GB, 7 others) | ~2.1 GB, inside a 3.8 GB Docker VM |
| OpenMausBot (35 helper processes) | ~1.2 GB |
| The Chrome the bots drive | ~0.4 GB |

Stopping the F16s stack when you aren't working on F16s (`docker compose stop`
in `~/Projects/f16sefreight`) frees more RAM than quitting OpenMausBot. Don't
quit Docker Desktop entirely: Kokoro needs it for blog audio. Kokoro starts
Docker itself if it isn't running.
