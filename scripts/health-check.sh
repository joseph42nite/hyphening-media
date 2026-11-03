#!/usr/bin/env bash
# Zero-token health check, run before any blog or SEO work and by Q's routines
# (00:45 and 10:55 IST). Builds on client-status.sh: same read-only login and
# GET /api/status/clients, plus
#   - what changed since the last run (new / deleted / deactivated clients,
#     flags switched, GSC/GA4 changed), kept in a state file between runs;
#   - per-client readiness for every client with a flag on (GSC, client note,
#     repo on this Mac, deploy manifest);
#   - the Mac itself (portal, vault drive, Claude CLI, plugins, disk, connector).
# Credentials are never printed.
#
#   scripts/health-check.sh            print the summary
#   scripts/health-check.sh --write    also write the three vault notes
#
# Exit code: 0 = OK or warnings only, 2 = BLOCKED (callers must stop), 1 = the
# script itself failed. Rules for readers: Vault SOPs/Health check.md.
#
# Env overrides (for testing): BASE_URL, VAULT_DIR, NOTES_DIR, CLIENTS_DIR,
# STATE_FILE.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://hypheningmedia.com}"
VAULT_DIR="${VAULT_DIR:-/Volumes/Mac Valhalla/Vault}"
NOTES_DIR="${NOTES_DIR:-$VAULT_DIR/Companies/Hyphening/Docs}"
CLIENTS_DIR="${CLIENTS_DIR:-$VAULT_DIR/Companies/Hyphening/Clients}"
STATE_FILE="${STATE_FILE:-$HOME/.hyphening/health-state.json}"

JAR="$(mktemp)"; OUT="$(mktemp)"; trap 'rm -f "$JAR" "$OUT"' EXIT

# Portal pull. A failure here is reported as BLOCKED, not a script error, so
# the health note still gets written and says why.
FETCH_ERROR=""
if [ ! -f "$REPO/.env" ]; then
  FETCH_ERROR="no .env in $REPO"
else
  set -a; . "$REPO/.env"; set +a
  if [ -z "${Q_READONLY_EMAIL:-}" ] || [ -z "${Q_READONLY_PASSWORD:-}" ]; then
    FETCH_ERROR="Q_READONLY_EMAIL / Q_READONLY_PASSWORD missing in .env"
  # Body goes in on stdin so the password never appears in the process list.
  elif ! python3 -c 'import json,os;print(json.dumps({"email":os.environ["Q_READONLY_EMAIL"],"password":os.environ["Q_READONLY_PASSWORD"]}))' \
      | curl -sf --max-time 20 -c "$JAR" -H 'Content-Type: application/json' -d @- \
      "$BASE_URL/api/auth/login" >/dev/null; then
    FETCH_ERROR="login failed at $BASE_URL"
  elif ! curl -sf --max-time 20 -b "$JAR" "$BASE_URL/api/status/clients" >"$OUT"; then
    FETCH_ERROR="GET /api/status/clients failed at $BASE_URL"
  fi
fi
unset Q_READONLY_EMAIL Q_READONLY_PASSWORD

CONNECTOR_UP=0; pgrep -f scripts/mac_connector.mjs >/dev/null 2>&1 && CONNECTOR_UP=1
CLAUDE_BIN="$(command -v claude || true)"
DOCKER_UP=0; docker info >/dev/null 2>&1 && DOCKER_UP=1

python3 -I - "$OUT" "$BASE_URL" "${1:-}" "$FETCH_ERROR" "$VAULT_DIR" "$NOTES_DIR" \
  "$CLIENTS_DIR" "$STATE_FILE" "$CONNECTOR_UP" "$CLAUDE_BIN" "$DOCKER_UP" <<'PY'
import json, os, re, shutil, sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

(out, base, mode, fetch_error, vault, notes_dir, clients_dir, state_file,
 connector_up, claude_bin, docker_up) = sys.argv[1:12]
write = mode == "--write"
now = datetime.now(timezone.utc)
now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
ist = now.astimezone(ZoneInfo("Asia/Kolkata"))
HOME = os.path.expanduser("~")

OK, WARN, BLOCKED = "OK", "WARN", "BLOCKED"
system = []  # (level, check, detail)

# ---- system ---------------------------------------------------------------
data = None
if fetch_error:
    system.append((BLOCKED, "Portal", fetch_error))
else:
    try:
        data = json.load(open(out))
        system.append((OK, "Portal", f"{base}/api/status/clients, {len(data['clients'])} clients"))
    except Exception as e:
        system.append((BLOCKED, "Portal", f"unreadable response: {e}"))

vault_ok = os.path.isdir(vault) and os.access(vault, os.W_OK)
system.append((OK if vault_ok else BLOCKED, "Vault drive", vault if vault_ok else f"{vault} not mounted or not writable"))

system.append((OK, "Claude CLI", claude_bin) if claude_bin else (BLOCKED, "Claude CLI", "`claude` not on PATH; night workers can't run"))

plugins = {
    "claude-blog plugin": f"{HOME}/.claude/plugins/marketplaces/agricidaniel-blog",
    "claude-seo plugin": f"{HOME}/.claude/plugins/cache/agricidaniel-claude-seo",
}
for name, path in plugins.items():
    system.append((OK, name, "installed") if os.path.isdir(path) else (WARN, name, f"missing at {path}"))

if os.path.isdir(vault):
    free_gb = shutil.disk_usage(vault).free / 1e9
    lvl = BLOCKED if free_gb < 2 else WARN if free_gb < 10 else OK
    system.append((lvl, "Disk (Mac Valhalla)", f"{free_gb:.0f} GB free"))

in_window = 11 <= ist.hour < 18
if connector_up == "1":
    system.append((OK, "Mac connector", "running"))
else:
    system.append((WARN if in_window else OK, "Mac connector",
                   "not running inside its 11:00-18:00 IST window" if in_window else "not running (outside its window)"))
system.append((OK, "Docker", "running" if docker_up == "1" else "not running (Kokoro starts it when audio renders)"))

# ---- client notes: client_id -> {repo, note} --------------------------------
notes = {}
if os.path.isdir(clients_dir):
    for f in sorted(os.listdir(clients_dir)):
        if not f.endswith(".md"):
            continue
        text = open(os.path.join(clients_dir, f), encoding="utf-8").read()
        fm = re.match(r"^---\n(.*?)\n---", text, re.S)
        meta = dict(re.findall(r"^(\w+):\s*\"?([^\"\n]*)\"?\s*$", fm.group(1), re.M)) if fm else {}
        if meta.get("client_id", "").isdigit():
            notes[int(meta["client_id"])] = {"note": f[:-3], "repo": meta.get("repo", "").strip()}

def manifest_check(repo):
    path = os.path.join(repo, "hyphening.deploy.json")
    if not os.path.exists(path):
        return WARN, "no deploy manifest: audits and drafts only"
    try:
        m = json.load(open(path))
    except Exception as e:
        return WARN, f"deploy manifest is not valid JSON ({e})"
    missing = [k for k in ("client_id", "branch", "deploy", "health_check") if k not in m]
    if missing:
        return WARN, f"deploy manifest missing {', '.join(missing)}"
    if m.get("deploy", {}).get("type") not in ("git_push", "ssh_pull_build", "cms_api", "handoff"):
        return WARN, "deploy manifest has an unknown deploy.type"
    return OK, f"deploy manifest OK ({m['deploy']['type']})"

# ---- clients and readiness --------------------------------------------------
clients = {c["id"]: c for c in data["clients"]} if data else {}
readiness = []  # (client, level, [details])
for cid, c in clients.items():
    flags = [k for k in ("blog", "seo", "ads") if c[f"{k}_enabled"]]
    if not flags:
        continue
    lines, level = [], OK
    def add(lvl, msg):
        global level
        lines.append(msg)
        if lvl == WARN:
            level = WARN
    if not c["is_active"]:
        add(WARN, "flags on but client is inactive: no work runs")
    if "seo" in flags or "ads" in flags:
        add(OK, f"GSC {c['gsc_property']}") if c["gsc_property"] else add(WARN, "no GSC property: SEO runs without Search Console data")
    info = notes.get(cid)
    if not info:
        add(WARN, "no client note in Clients/: onboarding not done")
    else:
        add(OK, f"client note [[Companies/Hyphening/Clients/{info['note']}]]")
        repo = info["repo"]
        if not repo:
            add(OK, "no repo on this Mac (handoff / CMS only)")
        elif not os.path.isdir(repo):
            add(WARN, f"repo {repo} not found on this Mac")
        else:
            lvl, msg = manifest_check(repo)
            add(lvl, f"repo {repo}; {msg}")
    readiness.append((c, level, lines, flags))

# ---- changes since last run -------------------------------------------------
FIELDS = ("name", "is_active", "blog_enabled", "seo_enabled", "ads_enabled", "gsc_property", "ga4_property_id")
prev, first_run = {}, False
try:
    prev = {int(k): v for k, v in json.load(open(state_file))["clients"].items()}
except FileNotFoundError:
    first_run = True
except Exception:
    first_run = True
changes = []
if data and not first_run:
    for cid in sorted(set(clients) - set(prev)):
        changes.append(f"NEW client {cid} {clients[cid]['name']}: onboarding not started")
    for cid in sorted(set(prev) - set(clients)):
        changes.append(f"DELETED client {cid} {prev[cid]['name']}: archive its room")
    for cid in sorted(set(clients) & set(prev)):
        a, b = prev[cid], clients[cid]
        for f in FIELDS:
            if a.get(f) != b.get(f):
                if f == "is_active":
                    changes.append(f"client {cid} {b['name']}: {'reactivated' if b[f] else 'DEACTIVATED: archive its room'}")
                elif f.endswith("_enabled"):
                    changes.append(f"client {cid} {b['name']}: {f.split('_')[0]} switched {'ON' if b[f] else 'off'}")
                else:
                    changes.append(f"client {cid} {b['name']}: {f} {a.get(f) or 'unknown'} -> {b.get(f) or 'unknown'}")

overall = BLOCKED if any(l == BLOCKED for l, *_ in system) else \
          WARN if any(l == WARN for l, *_ in system) or any(r[1] == WARN for r in readiness) else OK

# ---- print ------------------------------------------------------------------
print(f"health: {overall}  generated_at: {now_iso}  ({ist:%Y-%m-%d %H:%M} IST)")
for l, n, d in system:
    print(f"  [{l}] {n}: {d}")
for c, l, lines, flags in readiness:
    print(f"  [{l}] client {c['id']} {c['name']} ({'/'.join(flags)}): " + "; ".join(lines))
if first_run and data:
    print("  changes: first run, baseline saved")
for ch in changes:
    print(f"  change: {ch}")
if data and not changes and not first_run:
    print("  changes: none")

# ---- write notes and state --------------------------------------------------
if write and vault_ok and os.path.isdir(notes_dir):
    LINK = "[[Companies/Hyphening/SOPs/Health check]]"
    changes_md = ("- Unknown: the client list couldn't be read (see System)." if not data else
                  "- First run: baseline saved, no comparison yet." if first_run else
                  "\n".join(f"- {c}" for c in changes) if changes else "- None.")
    if data:
        onoff = lambda v: "ON" if v else "off"
        rows = [("id", "name", "active", "blog", "seo", "ads", "gsc_property", "ga4_property_id")]
        for c in data["clients"]:
            rows.append((str(c["id"]), c["name"], "yes" if c["is_active"] else "no",
                         onoff(c["blog_enabled"]), onoff(c["seo_enabled"]), onoff(c["ads_enabled"]),
                         c["gsc_property"] or "unknown", c["ga4_property_id"] or "unknown"))
        w = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
        line = lambda r: "| " + " | ".join(r[i].ljust(w[i]) for i in range(len(r))) + " |"
        table = "\n".join([line(rows[0]), "|" + "|".join("-" * (x + 2) for x in w) + "|"] + [line(r) for r in rows[1:]])
        open(os.path.join(notes_dir, "Hyphening - Client Status.md"), "w").write(f"""---
type: status-snapshot
company: "Hyphening"
generated_at: {data['generated_at']}
source: {base}/api/status/clients
---
# Hyphening: client status snapshot

**generated_at: {data['generated_at']}** (auto-generated by `scripts/health-check.sh --write`; do not hand-edit). Rules: [[Companies/Hyphening/Docs/Hyphening - Client Status Protocol]] · {LINK}.

## Changes since last check
{changes_md}

{table}
""")
        log = os.path.join(notes_dir, "Hyphening - Client Changes.md")
        if not os.path.exists(log):
            open(log, "w").write("---\ntype: change-log\ncompany: \"Hyphening\"\n---\n"
                                 "# Hyphening: client changes\n\nAppended by `scripts/health-check.sh --write`, newest at the bottom. "
                                 f"Do not hand-edit. Rules: {LINK}.\n\n")
        if changes:
            with open(log, "a") as fh:
                for c in changes:
                    fh.write(f"- {now_iso} · {c}\n")

    sys_md = "\n".join(f"| {l} | {n} | {d} |" for l, n, d in system)
    rd_md = "\n".join(f"| {l} | {c['id']} {c['name']} | {'/'.join(flags)} | {'; '.join(lines)} |"
                      for c, l, lines, flags in readiness) or "| — | no client has a flag on | | |"
    open(os.path.join(notes_dir, "Hyphening - Health Check.md"), "w").write(f"""---
type: health-check
company: "Hyphening"
generated_at: {now_iso}
overall: {overall}
---
# Hyphening: health check — {overall}

**generated_at: {now_iso}** ({ist:%Y-%m-%d %H:%M} IST). Auto-generated by `scripts/health-check.sh --write`; do not hand-edit. Rules: {LINK}. Stop all blog and SEO work if this says BLOCKED or is older than 24 hours.

## Changes since last check
{changes_md}

## Clients with a flag on
| Status | Client | Flags | Readiness |
|---|---|---|---|
{rd_md}

## System
| Status | Check | Detail |
|---|---|---|
{sys_md}

Full client list: [[Companies/Hyphening/Docs/Hyphening - Client Status]] · history: [[Companies/Hyphening/Docs/Hyphening - Client Changes]].
""")
    print("wrote notes in", notes_dir)

# Only a --write run moves the baseline, so a quick look never swallows a
# change before the notes have reported it.
if data and write:
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    json.dump({"saved_at": now_iso, "clients": {str(k): {f: v.get(f) for f in FIELDS} for k, v in clients.items()}},
              open(state_file, "w"), indent=1)

sys.exit(2 if overall == BLOCKED else 0)
PY
