#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${CLAWCTRL_ENV_FILE:-$ROOT/.env.local}"
MAC_HOST="${MAC_HOST:-macbook}"
MAC_BRIDGE_SRC="${MAC_BRIDGE_SRC:-/home/josue/Documents/projects new/memd/integrations/mac-bridge}"
MAC_BRIDGE_REMOTE_DIR_RAW="${MAC_BRIDGE_REMOTE_DIR:-~/Documents/projects/memd/integrations/mac-bridge}"
CLAWCTRL_REMOTE_DIR_RAW="${CLAWCTRL_REMOTE_DIR:-~/Documents/projects/clawctrl}"
MAC_BRIDGE_PORT="${MAC_BRIDGE_PORT:-4100}"
BLUEBUBBLES_PORT="${BLUEBUBBLES_PORT:-1234}"

say() {
  printf 'clawctrl mac bootstrap: %s\n' "$*"
}

fail() {
  printf 'clawctrl mac bootstrap: error: %s\n' "$*" >&2
  exit 1
}

load_env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
}

expand_remote_home() {
  local remote_home="$1"
  local path="$2"
  if [[ "$path" == "~/"* ]]; then
    printf '%s/%s' "$remote_home" "${path:2}"
  elif [[ "$path" == "~" ]]; then
    printf '%s' "$remote_home"
  else
    printf '%s' "$path"
  fi
}

command -v ssh >/dev/null 2>&1 || fail "ssh is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"
[ -d "$MAC_BRIDGE_SRC" ] || fail "Mac Bridge source not found: $MAC_BRIDGE_SRC"

bridge_key="${MAC_BRIDGE_API_KEY:-$(load_env_value MAC_BRIDGE_API_KEY)}"
[ -n "${bridge_key:-}" ] || fail "MAC_BRIDGE_API_KEY is not set in env or $ENV_FILE"

SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new)
SCP_BASE=(scp -o StrictHostKeyChecking=accept-new)
if [ -n "${MAC_SSH_PASSWORD:-}" ]; then
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required when MAC_SSH_PASSWORD is set"
  export SSHPASS="$MAC_SSH_PASSWORD"
  SSH_BASE=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no)
  SCP_BASE=(sshpass -e scp -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no)
fi

say "checking SSH to $MAC_HOST"
if [ -z "${MAC_SSH_PASSWORD:-}" ]; then
  SSH_BASE+=(-o BatchMode=yes)
fi
"${SSH_BASE[@]}" -o ConnectTimeout=8 "$MAC_HOST" 'uname -s' | grep -q '^Darwin$' \
  || fail "SSH is not available or target is not macOS"
remote_home="$("${SSH_BASE[@]}" "$MAC_HOST" 'printf %s "$HOME"')"
[ -n "$remote_home" ] || fail "could not determine remote home directory"
MAC_BRIDGE_REMOTE_DIR="$(expand_remote_home "$remote_home" "$MAC_BRIDGE_REMOTE_DIR_RAW")"
CLAWCTRL_REMOTE_DIR="$(expand_remote_home "$remote_home" "$CLAWCTRL_REMOTE_DIR_RAW")"
REMOTE_LAUNCH_AGENTS="$remote_home/Library/LaunchAgents"

say "copying Mac Bridge files"
tar -C "$MAC_BRIDGE_SRC" \
  --exclude node_modules \
  --exclude .env \
  --exclude '*.log' \
  -cf - . \
  | "${SSH_BASE[@]}" "$MAC_HOST" "mkdir -p '$MAC_BRIDGE_REMOTE_DIR' && tar -C '$MAC_BRIDGE_REMOTE_DIR' -xf -"

say "installing LaunchAgent with synced API key"
{
  printf 'BRIDGE_PORT=%s\n' "$MAC_BRIDGE_PORT"
  printf 'BRIDGE_API_KEY=%s\n' "$bridge_key"
} | "${SSH_BASE[@]}" "$MAC_HOST" "umask 077; cat > '$MAC_BRIDGE_REMOTE_DIR/.env'"

"${SSH_BASE[@]}" "$MAC_HOST" "cd '$MAC_BRIDGE_REMOTE_DIR' && ./install.sh >/tmp/clawctrl-mac-bridge-install.log 2>&1"
"${SSH_BASE[@]}" "$MAC_HOST" "launchctl kickstart -k gui/\$(id -u)/com.memd.mac-bridge || true"

say "installing BlueBubbles keepalive LaunchAgent"
"${SSH_BASE[@]}" "$MAC_HOST" "mkdir -p '$CLAWCTRL_REMOTE_DIR/scripts' '$REMOTE_LAUNCH_AGENTS'"
"${SCP_BASE[@]}" "$ROOT/scripts/ensure-bluebubbles.sh" "$MAC_HOST:$CLAWCTRL_REMOTE_DIR/scripts/ensure-bluebubbles.sh" >/dev/null
"${SSH_BASE[@]}" "$MAC_HOST" "chmod 755 '$CLAWCTRL_REMOTE_DIR/scripts/ensure-bluebubbles.sh'"
"${SSH_BASE[@]}" "$MAC_HOST" "cat > '$REMOTE_LAUNCH_AGENTS/com.clawctrl.bluebubbles-watch.plist' <<EOF
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>com.clawctrl.bluebubbles-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CLAWCTRL_REMOTE_DIR/scripts/ensure-bluebubbles.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>/tmp/clawctrl-bluebubbles-watch.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/clawctrl-bluebubbles-watch.log</string>
</dict>
</plist>
EOF
launchctl bootout gui/\$(id -u) '$REMOTE_LAUNCH_AGENTS/com.clawctrl.bluebubbles-watch.plist' 2>/dev/null || true
launchctl bootstrap gui/\$(id -u) '$REMOTE_LAUNCH_AGENTS/com.clawctrl.bluebubbles-watch.plist' 2>/dev/null || launchctl load '$REMOTE_LAUNCH_AGENTS/com.clawctrl.bluebubbles-watch.plist'
launchctl kickstart -k gui/\$(id -u)/com.clawctrl.bluebubbles-watch || true"

mac_ip="$("${SSH_BASE[@]}" "$MAC_HOST" 'tailscale ip -4 2>/dev/null | head -n1')"
[ -n "$mac_ip" ] || mac_ip="$("${SSH_BASE[@]}" "$MAC_HOST" 'ipconfig getifaddr en0 2>/dev/null || true')"
[ -n "$mac_ip" ] || fail "could not determine Mac IP"

say "verifying Mac Bridge health"
curl -fsS -m 8 \
  -H "X-API-Key: $bridge_key" \
  "http://$mac_ip:$MAC_BRIDGE_PORT/health" >/dev/null \
  || fail "Mac Bridge did not pass health check at http://$mac_ip:$MAC_BRIDGE_PORT/health"

say "verifying BlueBubbles listener"
timeout 8 bash -lc "</dev/tcp/$mac_ip/$BLUEBUBBLES_PORT" \
  || fail "BlueBubbles is not listening at $mac_ip:$BLUEBUBBLES_PORT"

say "Mac Bridge is reachable at http://$mac_ip:$MAC_BRIDGE_PORT"
say "BlueBubbles password still must exist in synced account secrets before Messages can authenticate."
