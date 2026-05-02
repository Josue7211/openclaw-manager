#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/home/josue/Documents/projects/clawcontrol/.memd"
set -a
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"
set +a
if [[ -z "${MEMD_TAB_ID:-}" ]]; then
  if [[ -n "${WT_SESSION:-}" ]]; then
    export MEMD_TAB_ID="tab-${WT_SESSION:0:8}"
  elif [[ -n "${TERM_SESSION_ID:-}" ]]; then
    export MEMD_TAB_ID="tab-${TERM_SESSION_ID:0:8}"
  else
    tty_id="$(tty 2>/dev/null || true)"
    if [[ -n "$tty_id" && "$tty_id" != "not a tty" ]]; then
      export MEMD_TAB_ID="tab-${tty_id//\//-}"
    else
      export MEMD_TAB_ID="tab-$$"
    fi
  fi
fi
export MEMD_AGENT="hermes"
export MEMD_WORKER_NAME="Hermes"
memd wake --output "$MEMD_BUNDLE_ROOT" --route auto --intent current_task --write >/dev/null 2>&1 || true
nohup memd heartbeat --output "$MEMD_BUNDLE_ROOT" --watch --interval-secs 30 --probe-base-url >/tmp/memd-heartbeat.log 2>&1 &
memd hive --output "$MEMD_BUNDLE_ROOT" --publish-heartbeat --summary >/dev/null 2>&1 || true
exec memd wake --output "$MEMD_BUNDLE_ROOT" --route auto --intent current_task --write "$@"
