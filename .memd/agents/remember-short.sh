#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/home/josue/Documents/projects/clawcontrol/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"

args=(checkpoint --output "$MEMD_BUNDLE_ROOT" --tag basic-memory --tag short-term)
exec memd "${args[@]}" "$@"
