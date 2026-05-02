#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/home/josue/Documents/projects/clawcontrol/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"
project_root="$(cd "$MEMD_BUNDLE_ROOT/.." && pwd)"
exec memd watch --root "$project_root" --output "$MEMD_BUNDLE_ROOT" "$@"
