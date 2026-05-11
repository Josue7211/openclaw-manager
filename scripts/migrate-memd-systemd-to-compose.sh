#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-$HOME/stacks/clawcontrol-backend}"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$STACK_DIR/deploy/portainer/clawcontrol-backend.stack.yml}"
MEMD_DATA_DIR="${MEMD_DATA_DIR:-$HOME/.local/share/memd}"
MEMD_SERVICE="${MEMD_SERVICE:-memd-server.service}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/memd}"

log() {
  printf '[memd-migrate] %s\n' "$*"
}

need_file() {
  if [ ! -f "$1" ]; then
    printf 'Missing required file: %s\n' "$1" >&2
    exit 1
  fi
}

wait_health() {
  local url=$1
  local name=$2
  local attempts=${3:-30}
  local delay=${4:-2}
  local i
  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS --max-time 3 "$url" >/dev/null; then
      log "$name healthy at $url"
      return 0
    fi
    sleep "$delay"
  done
  log "$name failed health at $url"
  return 1
}

need_file "$ENV_FILE"
need_file "$COMPOSE_FILE"
need_file "$MEMD_DATA_DIR/memd.db"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/$timestamp"
mkdir -p "$backup_dir"

log "backing up $MEMD_DATA_DIR to $backup_dir"
cp -a "$MEMD_DATA_DIR/." "$backup_dir/"

log "validating compose config"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null

log "building Docker memd images before stopping $MEMD_SERVICE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build memd-server memd-rag-sidecar

systemd_was_active=0
if systemctl --user is-active --quiet "$MEMD_SERVICE"; then
  systemd_was_active=1
  log "stopping $MEMD_SERVICE so Docker can bind :8787"
  systemctl --user stop "$MEMD_SERVICE"
fi

rollback() {
  log "rolling back Docker memd services"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop memd-server memd-rag-sidecar >/dev/null 2>&1 || true
  if [ "$systemd_was_active" -eq 1 ]; then
    log "restarting $MEMD_SERVICE"
    systemctl --user start "$MEMD_SERVICE" || true
  fi
}

trap 'rollback' ERR

log "starting Docker memd services"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d memd-server memd-rag-sidecar

wait_health "http://127.0.0.1:8787/healthz" "memd-server"
wait_health "http://127.0.0.1:9000/healthz" "memd-rag-sidecar"

trap - ERR

if [ "$systemd_was_active" -eq 1 ]; then
  log "disabling $MEMD_SERVICE after successful Docker health checks"
  systemctl --user disable "$MEMD_SERVICE" >/dev/null || true
fi

log "done. backup kept at $backup_dir"
