#!/usr/bin/env bash
# Measure total gzip JS bundle size.
# Usage: ./measure.sh
# Outputs: JSON with total_gzip_kb and per-chunk breakdown

set -euo pipefail

cd "$(dirname "$0")/../../frontend"

# Build and capture output
BUILD_OUTPUT=$(npx vite build 2>&1)

if echo "$BUILD_OUTPUT" | grep -q "^error\|Build failed"; then
  echo '{"error": "Build failed", "total_gzip_kb": 999999}' >&2
  exit 1
fi

# Parse gzip sizes from build output
CHUNKS=$(echo "$BUILD_OUTPUT" | grep "dist/assets.*\.js" | while IFS= read -r line; do
  name=$(echo "$line" | sed 's|dist/assets/||' | awk '{print $1}')
  gzip=$(echo "$line" | awk -F'gzip:' '{print $2}' | tr -d ' kB')
  echo "{\"name\": \"$name\", \"gzip_kb\": $gzip}"
done | paste -sd ',' -)

TOTAL=$(echo "$BUILD_OUTPUT" | grep "dist/assets.*\.js" | awk -F'gzip:' '{print $2}' | tr -d ' kB' | awk '{sum+=$1} END {printf "%.2f", sum}')

echo "{\"total_gzip_kb\": $TOTAL, \"chunks\": [$CHUNKS]}"
