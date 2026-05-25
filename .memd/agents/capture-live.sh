#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/run/media/josue/T7/projects/clawcontrol/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"

args=(hook capture --output "$MEMD_BUNDLE_ROOT" --summary)
args+=(--tag basic-memory --tag live-capture --promote-kind live_truth)
exec memd "${args[@]}" "$@"
