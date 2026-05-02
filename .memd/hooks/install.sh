#!/usr/bin/env bash
set -euo pipefail

PREFIX="${1:-${PREFIX:-$HOME/.local/bin}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMD_BIN="${MEMD_BIN:-memd}"

mkdir -p "$PREFIX"
install -m 0755 "$SCRIPT_DIR/memd-context.sh" "$PREFIX/memd-context"
install -m 0755 "$SCRIPT_DIR/memd-spill.sh" "$PREFIX/memd-spill"

cat > "$PREFIX/memd-hook-context" <<EOF
#!/usr/bin/env bash
exec "$PREFIX/memd-context" "\$@"
EOF
chmod +x "$PREFIX/memd-hook-context"

cat > "$PREFIX/memd-hook-spill" <<EOF
#!/usr/bin/env bash
exec "$MEMD_BIN" hook spill "\$@"
EOF
chmod +x "$PREFIX/memd-hook-spill"

echo "Installed memd hooks to $PREFIX"
echo "Add $PREFIX to PATH if needed."
echo "Set MEMD_BIN if the memd CLI is not already on PATH."
