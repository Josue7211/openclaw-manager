#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/run/media/josue/T7/projects/clawctrl/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"

args=(rag sync)
[[ -n "${MEMD_PROJECT:-}" ]] && args+=(--project "$MEMD_PROJECT")
[[ -n "${MEMD_NAMESPACE:-}" ]] && args+=(--namespace "$MEMD_NAMESPACE")
exec memd "${args[@]}" "$@"
