#!/bin/bash
# NOT IN USE (23 Nov 2026). A launchd job can't read or write the vault on the
# external Mac Valhalla drive (EPERM: macOS privacy protection), and the
# workers need it: the health check, blog narration's audio queue, the
# healthcare compliance note and the night report. Q starts the connector
# again. Install this only after giving the `node` it pins Full Disk Access
# (System Settings > Privacy & Security), and disable Q's four connector
# routines when you do. See docs/NIGHT_PIPELINE.md.
#
# Keeps the Mac connector (scripts/mac_connector.mjs) running under launchd:
# started at login, restarted within seconds if it exits. It replaces Q's
# 11:00/18:00 and 00:55/05:30 start and stop routines in OpenMausBot, so the
# night pipeline no longer needs OpenMausBot open (docs/NIGHT_PIPELINE.md).
#
#   bash scripts/launchd/install-mac-connector.sh            install, or reinstall after a Node or repo move
#   bash scripts/launchd/install-mac-connector.sh uninstall  stop it and remove the job
#
# launchd doesn't load nvm or your shell profile, so this writes the absolute
# path of the `node` you run it with, and a PATH with the tools the workers
# shell out to (claude, python3.12 and ffmpeg in ~/.local/bin, docker).
# Rerun it after switching Node versions.
# Log: ~/Library/Logs/hyphening-mac-connector.log
set -euo pipefail

LABEL=com.hyphening.mac-connector
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$HOME/Library/Logs/hyphening-mac-connector.log"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "uninstall" ]; then
  rm -f "$PLIST"
  echo "Removed $LABEL. Start the connector by hand with: node scripts/mac_connector.mjs"
  exit 0
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "node not found on PATH. Load nvm first (nvm use 20) and rerun." >&2
  exit 1
fi
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
if ! grep -q '^MAC_CONNECTOR_SECRET=' "$REPO/.env" 2>/dev/null; then
  echo "MAC_CONNECTOR_SECRET is missing from $REPO/.env; the connector would refuse to start." >&2
  exit 1
fi

TOOL_PATH="$HOME/.local/bin:$(dirname "$NODE"):/Applications/Docker.app/Contents/Resources/bin:$HOME/.docker/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# A copy started by hand or by Q's old routines would hold a second socket.
pkill -f "scripts/mac_connector.mjs" 2>/dev/null || true

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>scripts/mac_connector.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$TOOL_PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Standard</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

launchctl bootstrap "$DOMAIN" "$PLIST"
sleep 3
if launchctl print "$DOMAIN/$LABEL" | grep -q 'state = running'; then
  echo "Installed $LABEL ($NODE). Log: $LOG"
else
  echo "Installed $LABEL but it isn't running yet; check $LOG" >&2
  exit 1
fi
