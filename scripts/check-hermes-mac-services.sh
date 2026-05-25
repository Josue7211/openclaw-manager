#!/usr/bin/env bash
set -euo pipefail

AGENT_HOST="${AGENT_HOST:-agent-vm}"
AGENT_USER="${AGENT_USER:-aparcedodev}"
SSH_TARGET="${AGENT_USER}@${AGENT_HOST}"
SERVICE_NAME="${SERVICE_NAME:-hermes-mac-services-tunnel.service}"
PROBE_TUNNEL=0
CHECK_BITWARDEN=0

usage() {
  cat <<'EOF'
Usage: scripts/check-hermes-mac-services.sh [--probe-tunnel] [--check-bitwarden]

Runs read-only Hermes/Mac service checks. It does not send iMessages, create
chats, send typing indicators, send reactions, mark messages read, or mutate
BlueBubbles state.

Options:
  --probe-tunnel   Temporarily start the desktop tunnel if inactive, verify TCP
                   reachability from agent-vm, then stop it again if this
                   script started it.
  --check-bitwarden
                   Verify Bitwarden has BlueBubbles and Mac Bridge login items.
                   Requires an unlocked Bitwarden CLI session.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --probe-tunnel)
      PROBE_TUNNEL=1
      shift
      ;;
    --check-bitwarden)
      CHECK_BITWARDEN=1
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

say() {
  printf '[check] %s\n' "$*"
}

fail() {
  printf '[check] error: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

secret() {
  secret-tool lookup service com.clawctrl.desktop username "$1"
}

need curl
need jq
need python3
need secret-tool
need ssh
need systemctl

MAC_HOST="$(secret mac-bridge.host)"
MAC_KEY="$(secret mac-bridge.api-key)"
BB_HOST="$(secret bluebubbles.host)"
BB_PASS="$(secret bluebubbles.password)"

[ -n "$MAC_HOST" ] || fail "missing mac-bridge.host in keyring"
[ -n "$MAC_KEY" ] || fail "missing mac-bridge.api-key in keyring"
[ -n "$BB_HOST" ] || fail "missing bluebubbles.host in keyring"
[ -n "$BB_PASS" ] || fail "missing bluebubbles.password in keyring"

if [ "$CHECK_BITWARDEN" -eq 1 ]; then
  need bw
  say "Bitwarden mirror"
  bw_status="$(bw status | jq -r '.status')"
  if [ "$bw_status" != "unlocked" ]; then
    fail "Bitwarden status is $bw_status; export BW_SESSION or run bw unlock before --check-bitwarden"
  fi
  bluebubbles_matches="$(bw list items --search BlueBubbles | jq \
    --arg name "BlueBubbles" \
    --arg username "$BB_HOST" \
    --arg password "$BB_PASS" \
    '[.[] | select(.name == $name and (.login.username // "") == $username and (.login.password // "") == $password)] | length')"
  [ "$bluebubbles_matches" -ge 1 ] || fail "Bitwarden BlueBubbles item is missing or does not match keyring values"
  printf '[check] Bitwarden item mirrors keyring: %s\n' "BlueBubbles"

  mac_bridge_matches="$(bw list items --search "Mac Bridge" | jq \
    --arg name "Mac Bridge" \
    --arg username "$MAC_HOST" \
    --arg password "$MAC_KEY" \
    '[.[] | select(.name == $name and (.login.username // "") == $username and (.login.password // "") == $password)] | length')"
  [ "$mac_bridge_matches" -ge 1 ] || fail "Bitwarden Mac Bridge item is missing or does not match keyring values"
  printf '[check] Bitwarden item mirrors keyring: %s\n' "Mac Bridge"
fi

say "Hermes runtime on $AGENT_HOST"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" '
  set -e
  systemctl --user is-active hermes-api-server.service
  pid=$(systemctl --user show -p MainPID --value hermes-api-server.service)
  echo "PID=$pid"
  if [ "$pid" = 0 ]; then
    exit 1
  fi
  env_names=$(tr "\0" "\n" < "/proc/$pid/environ" | sed -n "s/=.*//p" | grep -E "^(BLUEBUBBLES|MAC_BRIDGE|DISCORD)_" || true)
  printf "%s\n" "$env_names"
  if printf "%s\n" "$env_names" | grep -q "^BLUEBUBBLES_"; then
    echo "unexpected BLUEBUBBLES env in Hermes runtime" >&2
    exit 3
  fi
  printf "%s\n" "$env_names" | grep -q "^MAC_BRIDGE_HOST$"
  printf "%s\n" "$env_names" | grep -q "^MAC_BRIDGE_API_KEY$"
'

say "Hermes dashboard on $AGENT_HOST"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" '
  set -e
  systemctl --user is-active hermes-dashboard.service
  curl -fsS --max-time 8 -o /dev/null http://100.104.154.24:9119/
'

say "agent-vm BlueBubbles tunnel/webhook ports are closed in safe state"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" '
  if ss -ltnp 2>/dev/null | grep -E ":(41234|14100|8645)\b"; then
    echo "unexpected safe-state tunnel/webhook listener found" >&2
    exit 4
  fi
'

say "Hermes BlueBubbles safety config"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" '
  set -e
  for p in "$HOME/.hermes/.env" "$HOME/.config/clawctrl-hermes.env"; do
    if [ -f "$p" ] && grep -q "^GATEWAY_ALLOW_ALL_USERS=true" "$p"; then
      echo "GATEWAY_ALLOW_ALL_USERS=true found in $p" >&2
      exit 5
    fi
  done
  python3 - <<'"'"'PY'"'"'
from pathlib import Path
import yaml

path = Path.home() / ".hermes/config.yaml"
data = yaml.safe_load(path.read_text()) if path.exists() else {}
if not isinstance(data, dict):
    data = {}
behavior = ((data.get("bluebubbles") or {}).get("unauthorized_dm_behavior") or "").strip().lower()
if behavior != "ignore":
    raise SystemExit(f"bluebubbles.unauthorized_dm_behavior must be ignore, got {behavior!r}")
PY
'

say "desktop to Mac Bridge health"
curl -fsS --max-time 8 -H "x-api-key: $MAC_KEY" "$MAC_HOST/health" | jq -ce '.ok == true' >/dev/null

say "desktop to BlueBubbles ping"
python3 - "$BB_HOST" "$BB_PASS" <<'PY'
import sys
import urllib.parse
import requests

host = sys.argv[1].rstrip("/")
password = urllib.parse.quote(sys.argv[2])
response = requests.get(f"{host}/api/v1/ping?password={password}", timeout=8)
response.raise_for_status()
payload = response.json()
if payload.get("data") != "pong":
    raise SystemExit(f"unexpected BlueBubbles ping response: {payload!r}")
PY

say "BlueBubbles webhook list is read-only and does not target Hermes"
python3 - "$BB_HOST" "$BB_PASS" <<'PY'
import sys
import urllib.parse
from urllib.parse import urlparse
import requests

host = sys.argv[1].rstrip("/")
password = urllib.parse.quote(sys.argv[2])
response = requests.get(f"{host}/api/v1/webhook?password={password}", timeout=8)
response.raise_for_status()
payload = response.json()
webhooks = payload.get("data") or []
for item in webhooks:
    url = item.get("url", "") if isinstance(item, dict) else ""
    parsed = urlparse(url)
    target = f"{parsed.netloc}{parsed.path}"
    if "48645" in target or "8645" in target or "bluebubbles-webhook" in target:
        raise SystemExit(f"Hermes webhook still registered: {parsed.scheme}://{target}")
print(f"webhook_count={len(webhooks)}")
PY

if [ "$PROBE_TUNNEL" -eq 1 ]; then
  say "temporary tunnel TCP probe"
  was_active=0
  if systemctl --user is-active --quiet "$SERVICE_NAME"; then
    was_active=1
  fi
  cleanup() {
    if [ "$was_active" -eq 0 ]; then
      systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT
  systemctl --user start "$SERVICE_NAME"
  sleep 2
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" '
    timeout 5 bash -lc "</dev/tcp/127.0.0.1/14100"
    timeout 5 bash -lc "</dev/tcp/127.0.0.1/41234"
  '
  ss -ltn 2>/dev/null | grep -E ":48645\b" >/dev/null || fail "desktop reverse tunnel port 48645 is not listening"

  say "temporary tunnel service probes"
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" \
    "curl -fsS --max-time 8 -H 'x-api-key: $MAC_KEY' http://127.0.0.1:14100/health | jq -ce '.ok == true' >/dev/null"
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/clawctrl_known_hosts "$SSH_TARGET" \
    "python3 - '$BB_PASS' <<'PY'
import sys
import urllib.parse
import requests

password = urllib.parse.quote(sys.argv[1])
response = requests.get(f'http://127.0.0.1:41234/api/v1/ping?password={password}', timeout=8)
response.raise_for_status()
payload = response.json()
if payload.get('data') != 'pong':
    raise SystemExit(f'unexpected tunneled BlueBubbles ping response: {payload!r}')
PY"
fi

say "ok"
