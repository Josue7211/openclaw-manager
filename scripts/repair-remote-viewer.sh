#!/usr/bin/env bash
set -euo pipefail

USER_SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORWARD="127.0.0.1:5901:127.0.0.1:5901"
REMOTE_HOST="${REMOTE_VIEWER_HOST:-}"

if [[ -z "${REMOTE_HOST}" && -f "${REPO_ROOT}/.env.local" ]]; then
  REMOTE_URL="$(grep -E '^(HARNESS_API_URL|HERMES_API_URL|OPENCLAW_API_URL)=' "${REPO_ROOT}/.env.local" | head -n 1 | cut -d= -f2-)"
  REMOTE_URL="${REMOTE_URL#*://}"
  REMOTE_URL="${REMOTE_URL%%/*}"
  REMOTE_HOST="${REMOTE_URL%%:*}"
fi

REMOTE_HOST="${REMOTE_HOST:-openclaw-vm}"

echo "Remote Viewer repair"
echo "remote host: ${REMOTE_HOST}"

ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_HOST}" \
  "systemctl --user restart clawcontrol-vnc.service"

if [[ "$(uname -s)" == "Darwin" ]]; then
  pkill -f "ssh .*${FORWARD}" 2>/dev/null || true
  ssh -f -N \
    -L "${FORWARD}" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o TCPKeepAlive=yes \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=2 \
    -o ExitOnForwardFailure=yes \
    "${REMOTE_HOST}"
else
  mkdir -p "${USER_SYSTEMD_DIR}"
  install -m 0644 "${REPO_ROOT}/deploy/systemd/openclaw-vnc-tunnel.service" "${USER_SYSTEMD_DIR}/openclaw-vnc-tunnel.service"
  systemctl --user daemon-reload
  systemctl --user enable --now openclaw-vnc-tunnel.service
  systemctl --user restart openclaw-vnc-tunnel.service
fi

echo "checking local VNC tunnel..."
for attempt in {1..20}; do
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 5901 && break
  else
    timeout 1 bash -c "</dev/tcp/127.0.0.1/5901" 2>/dev/null && break
  fi

  if [[ "${attempt}" == "20" ]]; then
    if [[ "$(uname -s)" != "Darwin" ]]; then
      systemctl --user status openclaw-vnc-tunnel.service --no-pager || true
    fi
    exit 1
  fi

  sleep 0.5
done

echo "Remote Viewer tunnel is listening on 127.0.0.1:5901"
