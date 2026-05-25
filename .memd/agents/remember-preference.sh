#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/run/media/josue/T7/projects/clawcontrol/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"

args=(remember --output "$MEMD_BUNDLE_ROOT" --kind "preference" --scope project)
args+=(--tag "basic-memory")
args+=(--tag "preference")
exec memd "${args[@]}" "$@"
