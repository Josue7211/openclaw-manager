#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-hermes-mac-services-tunnel.service}"
AGENT_USER="${AGENT_USER:-aparcedodev}"
AGENT_HOST="${AGENT_HOST:-agent-vm}"
MAC_BLUEBUBBLES_HOST="${MAC_BLUEBUBBLES_HOST:-100.89.236.13}"
MAC_BLUEBUBBLES_PORT="${MAC_BLUEBUBBLES_PORT:-1234}"
MAC_BRIDGE_HOST="${MAC_BRIDGE_HOST:-100.89.236.13}"
MAC_BRIDGE_PORT="${MAC_BRIDGE_PORT:-4100}"
AGENT_BLUEBUBBLES_PORT="${AGENT_BLUEBUBBLES_PORT:-41234}"
AGENT_MAC_BRIDGE_PORT="${AGENT_MAC_BRIDGE_PORT:-14100}"
AGENT_WEBHOOK_PORT="${AGENT_WEBHOOK_PORT:-8645}"
DESKTOP_WEBHOOK_PORT="${DESKTOP_WEBHOOK_PORT:-48645}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$SERVICE_NAME"
ENABLE=0
START=0

usage() {
  cat <<'EOF'
Usage: scripts/install-hermes-mac-tunnel-service.sh [--enable] [--start]

Installs the user systemd tunnel unit used by Hermes Mac services.

Default behavior only writes the unit and reloads the user systemd daemon. It
does not start or enable the tunnel. Use --start for a temporary active tunnel,
or --enable when the BlueBubbles/Hermes bridge is explicitly approved for
persistent operation.

Forwards:
  agent-vm 127.0.0.1:41234 -> Mac BlueBubbles :1234
  agent-vm 127.0.0.1:14100 -> Mac Bridge :4100
  desktop 0.0.0.0:48645 -> agent-vm Hermes webhook :8645
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --enable)
      ENABLE=1
      shift
      ;;
    --start)
      START=1
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

mkdir -p "$UNIT_DIR"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Hermes Mac services tunnel through josuesdesktop
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new -R 127.0.0.1:$AGENT_BLUEBUBBLES_PORT:$MAC_BLUEBUBBLES_HOST:$MAC_BLUEBUBBLES_PORT -R 127.0.0.1:$AGENT_MAC_BRIDGE_PORT:$MAC_BRIDGE_HOST:$MAC_BRIDGE_PORT -L 0.0.0.0:$DESKTOP_WEBHOOK_PORT:127.0.0.1:$AGENT_WEBHOOK_PORT $AGENT_USER@$AGENT_HOST
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload

if [ "$ENABLE" -eq 1 ]; then
  systemctl --user enable "$SERVICE_NAME"
else
  systemctl --user disable "$SERVICE_NAME" >/dev/null 2>&1 || true
fi

if [ "$START" -eq 1 ]; then
  systemctl --user start "$SERVICE_NAME"
fi

printf 'installed=%s\n' "$UNIT_PATH"
printf 'active=%s\n' "$(systemctl --user is-active "$SERVICE_NAME" || true)"
printf 'enabled=%s\n' "$(systemctl --user is-enabled "$SERVICE_NAME" || true)"
