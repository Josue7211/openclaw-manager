#!/usr/bin/env bash
set -euo pipefail

LOG_PATH="${LOG_PATH:-/tmp/clawctrl-bluebubbles-watch.log}"
APP_PATH="${BLUEBUBBLES_APP_PATH:-/Applications/BlueBubbles.app}"
PORT="${BLUEBUBBLES_PORT:-1234}"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_PATH"
}

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  exit 0
fi

if pgrep -f "/Applications/BlueBubbles.app/Contents/MacOS/BlueBubbles" >/dev/null 2>&1; then
  exit 0
fi

if [[ ! -d "$APP_PATH" ]]; then
  log "BlueBubbles app missing at $APP_PATH"
  exit 0
fi

log "BlueBubbles is not listening on :$PORT; opening $APP_PATH"
/usr/bin/open -gj -a "$APP_PATH" || log "failed to open BlueBubbles"
