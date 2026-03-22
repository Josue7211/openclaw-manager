#!/usr/bin/env bash
# Bundle size budget check — fails if any JS chunk > 400KB or total > 5MB (uncompressed)
# Usage: bash scripts/check-bundle-size.sh [--dist-dir frontend/dist]
set -euo pipefail

# ── Thresholds ──
MAX_CHUNK_KB=400
MAX_TOTAL_KB=5120  # 5MB

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# ── Parse args ──
DIST_DIR="frontend/dist"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist-dir) DIST_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

ASSETS_DIR="${DIST_DIR}/assets"

if [ ! -d "$ASSETS_DIR" ]; then
  echo -e "${RED}ERROR${NC}: No assets directory at ${ASSETS_DIR}"
  echo "Run 'cd frontend && npx vite build' first."
  exit 1
fi

# ── Measure ──
VIOLATIONS=0
TOTAL_BYTES=0

# Cross-platform stat
get_size() {
  if stat --format='%s' "$1" 2>/dev/null; then
    return
  fi
  stat -f '%z' "$1" 2>/dev/null
}

echo ""
echo "Bundle Size Budget Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check each JS chunk
while IFS= read -r file; do
  name=$(basename "$file")
  size_bytes=$(get_size "$file")
  size_kb=$(( size_bytes / 1024 ))
  TOTAL_BYTES=$(( TOTAL_BYTES + size_bytes ))

  if [ "$size_kb" -gt "$MAX_CHUNK_KB" ]; then
    printf "  ${RED}FAIL${NC}  %-50s %6d KB  (limit: %d KB)\n" "$name" "$size_kb" "$MAX_CHUNK_KB"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(find "$ASSETS_DIR" -name "*.js" -type f | sort)

TOTAL_KB=$(( TOTAL_BYTES / 1024 ))

echo ""

# Total check
if [ "$TOTAL_KB" -gt "$MAX_TOTAL_KB" ]; then
  printf "  ${RED}FAIL${NC}  Total JS: %s KB  (limit: %s KB)\n" "$TOTAL_KB" "$MAX_TOTAL_KB"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  printf "  ${GREEN}OK${NC}    Total JS: %s KB  (limit: %s KB)\n" "$TOTAL_KB" "$MAX_TOTAL_KB"
fi

CHUNK_COUNT=$(find "$ASSETS_DIR" -name "*.js" -type f | wc -l | tr -d ' ')
echo "  Chunks: ${CHUNK_COUNT}"
echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}Bundle budget exceeded — ${VIOLATIONS} violation(s)${NC}"
  exit 1
else
  echo -e "${GREEN}Bundle budget OK${NC}"
  exit 0
fi
