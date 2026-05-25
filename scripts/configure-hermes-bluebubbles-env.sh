#!/usr/bin/env bash
set -euo pipefail

AGENT_HOST="${AGENT_HOST:-agent-vm}"
AGENT_USER="${AGENT_USER:-aparcedodev}"
SSH_TARGET="${AGENT_USER}@${AGENT_HOST}"
AGENT_BLUEBUBBLES_PORT="${AGENT_BLUEBUBBLES_PORT:-41234}"
BLUEBUBBLES_SERVER_URL="${BLUEBUBBLES_SERVER_URL:-http://127.0.0.1:$AGENT_BLUEBUBBLES_PORT}"
BLUEBUBBLES_WEBHOOK_HOST="${BLUEBUBBLES_WEBHOOK_HOST:-127.0.0.1}"
BLUEBUBBLES_WEBHOOK_PORT="${BLUEBUBBLES_WEBHOOK_PORT:-8645}"
BLUEBUBBLES_WEBHOOK_PATH="${BLUEBUBBLES_WEBHOOK_PATH:-/bluebubbles-webhook}"
DESKTOP_WEBHOOK_HOST="${DESKTOP_WEBHOOK_HOST:-100.97.74.2}"
DESKTOP_WEBHOOK_PORT="${DESKTOP_WEBHOOK_PORT:-48645}"
BLUEBUBBLES_WEBHOOK_PUBLIC_URL="${BLUEBUBBLES_WEBHOOK_PUBLIC_URL:-http://$DESKTOP_WEBHOOK_HOST:$DESKTOP_WEBHOOK_PORT$BLUEBUBBLES_WEBHOOK_PATH}"
BLUEBUBBLES_ALLOWED_USERS="${BLUEBUBBLES_ALLOWED_USERS:-}"
BLUEBUBBLES_ALLOWED_CHATS="${BLUEBUBBLES_ALLOWED_CHATS:-}"
BLUEBUBBLES_ALLOW_FROM_ME_CHATS="${BLUEBUBBLES_ALLOW_FROM_ME_CHATS:-}"
BLUEBUBBLES_FROM_ME_PREFIXES="${BLUEBUBBLES_FROM_ME_PREFIXES:-}"
BLUEBUBBLES_SEND_READ_RECEIPTS="${BLUEBUBBLES_SEND_READ_RECEIPTS:-false}"
APPLY=0
DISABLE=0
RESTART=0

usage() {
  cat <<'EOF'
Usage:
  scripts/configure-hermes-bluebubbles-env.sh [--apply] [--restart]
  scripts/configure-hermes-bluebubbles-env.sh --disable [--apply] [--restart]

Default behavior is dry-run only. It prints a redacted plan and does not write
files, restart Hermes, register webhooks, create chats, or send messages.

Enabling BlueBubbles requires both --apply and:
  HERMES_BLUEBUBBLES_APPROVED=1
  BLUEBUBBLES_ALLOWED_USERS=<your iMessage sender handle>
  BLUEBUBBLES_ALLOWED_CHATS=<specific iMessage chat GUID>
  BLUEBUBBLES_WEBHOOK_PUBLIC_URL=<desktop tunnel URL BlueBubbles can reach>

Optional self-chat command mode, for texting the same Apple ID from your phone:
  BLUEBUBBLES_ALLOW_FROM_ME_CHATS=<specific self-chat GUID>
  BLUEBUBBLES_FROM_ME_PREFIXES=/media,/hermes

Disabling does not require that approval variable.

Options:
  --apply     Write the planned Hermes env changes to agent-vm.
  --disable   Remove BLUEBUBBLES_* values from Hermes env files on agent-vm.
  --restart   Restart hermes-api-server.service after applying changes.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --disable)
      DISABLE=1
      shift
      ;;
    --restart)
      RESTART=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'error: %s is required\n' "$1" >&2
    exit 1
  }
}

secret() {
  secret-tool lookup service com.clawctrl.desktop username "$1"
}

need ssh

target_files='~/.hermes/.env ~/.config/clawcontrol-hermes.env'

set_bluebubbles_config_safety() {
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawcontrol_known_hosts "$SSH_TARGET" '
    set -e
    python3 - <<'"'"'PY'"'"'
from pathlib import Path
import yaml

path = Path.home() / ".hermes/config.yaml"
data = {}
if path.exists():
    loaded = yaml.safe_load(path.read_text())
    if isinstance(loaded, dict):
        data = loaded
bb = data.setdefault("bluebubbles", {})
if not isinstance(bb, dict):
    bb = {}
    data["bluebubbles"] = bb
bb["unauthorized_dm_behavior"] = "ignore"
path.write_text(yaml.safe_dump(data, sort_keys=False))
PY
  '
}

if [ "$DISABLE" -eq 1 ]; then
  if [ "$APPLY" -eq 0 ]; then
    printf 'dry_run=true\n'
    printf 'target=%s\n' "$SSH_TARGET"
    printf 'action=remove BLUEBUBBLES_* from %s\n' "$target_files"
    [ "$RESTART" -eq 1 ] && printf 'restart=hermes-api-server.service\n'
    exit 0
  fi

  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawcontrol_known_hosts "$SSH_TARGET" '
    set -e
    python3 - <<'"'"'PY'"'"'
from pathlib import Path

for path in [Path.home() / ".hermes/.env", Path.home() / ".config/clawcontrol-hermes.env"]:
    if not path.exists():
        continue
    kept = []
    for line in path.read_text().splitlines():
        key = line.split("=", 1)[0] if "=" in line else ""
        if not key.startswith("BLUEBUBBLES_"):
            kept.append(line)
    path.write_text("\n".join(kept) + ("\n" if kept else ""))
PY
  '
  set_bluebubbles_config_safety
  if [ "$RESTART" -eq 1 ]; then
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawcontrol_known_hosts "$SSH_TARGET" \
      'systemctl --user restart hermes-api-server.service'
  fi
  printf 'disabled=true\n'
  exit 0
fi

if [ "$APPLY" -eq 1 ] && [ "${HERMES_BLUEBUBBLES_APPROVED:-}" != "1" ]; then
  printf 'error: refusing to enable Hermes BlueBubbles without HERMES_BLUEBUBBLES_APPROVED=1\n' >&2
  printf 'dry_run=true\n' >&2
  printf 'Run without --apply to inspect the redacted plan first.\n' >&2
  exit 5
fi

if [ "$APPLY" -eq 1 ] && [ -z "$BLUEBUBBLES_ALLOWED_USERS" ]; then
  printf 'error: refusing to enable Hermes BlueBubbles without BLUEBUBBLES_ALLOWED_USERS\n' >&2
  printf 'Set it to the exact iMessage sender handle that is allowed to talk to Hermes.\n' >&2
  exit 6
fi

if [ "$APPLY" -eq 1 ] && [ -z "$BLUEBUBBLES_ALLOWED_CHATS" ]; then
  printf 'error: refusing to enable Hermes BlueBubbles without BLUEBUBBLES_ALLOWED_CHATS\n' >&2
  printf 'Set it to the exact iMessage chat GUID Hermes is allowed to answer in.\n' >&2
  exit 7
fi

if [ "$APPLY" -eq 1 ] && [ -n "$BLUEBUBBLES_ALLOW_FROM_ME_CHATS" ] && [ -z "$BLUEBUBBLES_FROM_ME_PREFIXES" ]; then
  printf 'error: refusing self-chat from-me mode without BLUEBUBBLES_FROM_ME_PREFIXES\n' >&2
  printf 'Set prefixes like BLUEBUBBLES_FROM_ME_PREFIXES=/media,/hermes so Hermes ignores its own replies.\n' >&2
  exit 8
fi

need jq
need secret-tool

BB_PASS="$(secret hermes.bluebubbles-password)"
if [ -z "$BB_PASS" ]; then
  BB_PASS="$(secret bluebubbles.password)"
fi
[ -n "$BB_PASS" ] || {
  printf 'error: missing hermes.bluebubbles-password or bluebubbles.password in keyring\n' >&2
  exit 1
}

printf 'dry_run=%s\n' "$([ "$APPLY" -eq 1 ] && printf false || printf true)"
printf 'target=%s\n' "$SSH_TARGET"
printf 'target_files=%s\n' "$target_files"
printf 'BLUEBUBBLES_SERVER_URL=%s\n' "$BLUEBUBBLES_SERVER_URL"
printf 'BLUEBUBBLES_PASSWORD=<redacted>\n'
printf 'BLUEBUBBLES_WEBHOOK_HOST=%s\n' "$BLUEBUBBLES_WEBHOOK_HOST"
printf 'BLUEBUBBLES_WEBHOOK_PORT=%s\n' "$BLUEBUBBLES_WEBHOOK_PORT"
printf 'BLUEBUBBLES_WEBHOOK_PATH=%s\n' "$BLUEBUBBLES_WEBHOOK_PATH"
printf 'BLUEBUBBLES_WEBHOOK_PUBLIC_URL=%s\n' "$BLUEBUBBLES_WEBHOOK_PUBLIC_URL"
printf 'BLUEBUBBLES_ALLOW_ALL_USERS=false\n'
printf 'BLUEBUBBLES_ALLOWED_USERS=%s\n' "$([ -n "$BLUEBUBBLES_ALLOWED_USERS" ] && printf '<set>' || printf '<empty>')"
printf 'BLUEBUBBLES_ALLOWED_CHATS=%s\n' "$([ -n "$BLUEBUBBLES_ALLOWED_CHATS" ] && printf '<set>' || printf '<empty>')"
printf 'BLUEBUBBLES_ALLOW_FROM_ME_CHATS=%s\n' "$([ -n "$BLUEBUBBLES_ALLOW_FROM_ME_CHATS" ] && printf '<set>' || printf '<empty>')"
printf 'BLUEBUBBLES_FROM_ME_PREFIXES=%s\n' "$([ -n "$BLUEBUBBLES_FROM_ME_PREFIXES" ] && printf '<set>' || printf '<empty>')"
printf 'BLUEBUBBLES_SEND_READ_RECEIPTS=%s\n' "$BLUEBUBBLES_SEND_READ_RECEIPTS"
printf 'bluebubbles.unauthorized_dm_behavior=ignore\n'
[ "$RESTART" -eq 1 ] && printf 'restart=hermes-api-server.service\n'

if [ "$APPLY" -eq 0 ]; then
  exit 0
fi

payload="$(jq -nc \
  --arg server_url "$BLUEBUBBLES_SERVER_URL" \
  --arg password "$BB_PASS" \
  --arg webhook_host "$BLUEBUBBLES_WEBHOOK_HOST" \
  --arg webhook_port "$BLUEBUBBLES_WEBHOOK_PORT" \
  --arg webhook_path "$BLUEBUBBLES_WEBHOOK_PATH" \
  --arg webhook_public_url "$BLUEBUBBLES_WEBHOOK_PUBLIC_URL" \
  --arg allowed_users "$BLUEBUBBLES_ALLOWED_USERS" \
  --arg allowed_chats "$BLUEBUBBLES_ALLOWED_CHATS" \
  --arg allow_from_me_chats "$BLUEBUBBLES_ALLOW_FROM_ME_CHATS" \
  --arg from_me_prefixes "$BLUEBUBBLES_FROM_ME_PREFIXES" \
  '{
    BLUEBUBBLES_SERVER_URL: $server_url,
    BLUEBUBBLES_PASSWORD: $password,
    BLUEBUBBLES_WEBHOOK_HOST: $webhook_host,
    BLUEBUBBLES_WEBHOOK_PORT: $webhook_port,
    BLUEBUBBLES_WEBHOOK_PATH: $webhook_path,
    BLUEBUBBLES_WEBHOOK_PUBLIC_URL: $webhook_public_url,
    BLUEBUBBLES_ALLOW_ALL_USERS: "false",
    BLUEBUBBLES_SEND_READ_RECEIPTS: "false",
    GATEWAY_ALLOW_ALL_USERS: "false",
    BLUEBUBBLES_ALLOWED_USERS: $allowed_users,
    BLUEBUBBLES_ALLOWED_CHATS: $allowed_chats,
    BLUEBUBBLES_ALLOW_FROM_ME_CHATS: $allow_from_me_chats,
    BLUEBUBBLES_FROM_ME_PREFIXES: $from_me_prefixes
  }')"

printf '%s' "$payload" | ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawcontrol_known_hosts "$SSH_TARGET" '
  set -e
  python3 -c '"'"'
import json
import sys
from pathlib import Path

payload = json.load(sys.stdin)
paths = [Path.home() / ".hermes/.env", Path.home() / ".config/clawcontrol-hermes.env"]
for path in paths:
    lines = path.read_text().splitlines() if path.exists() else []
    seen = set()
    out = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in payload:
            out.append(f"{key}={payload[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in payload.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out) + "\n")
'"'"'
'

set_bluebubbles_config_safety

if [ "$RESTART" -eq 1 ]; then
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawcontrol_known_hosts "$SSH_TARGET" \
    'systemctl --user restart hermes-api-server.service'
fi
