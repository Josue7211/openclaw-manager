#!/usr/bin/env bash
# Measure Rust build time baseline for Mission Control
# Usage: bash scripts/perf-research/measure-rust-build.sh
# Run from project root.

set -euo pipefail

TAURI_DIR="$(cd "$(dirname "$0")/../../src-tauri" && pwd)"
cd "$TAURI_DIR"

echo "=== Rust Build Baseline Measurement ==="
echo "Date: $(date -Iseconds)"
echo ""

# Clean build
echo ">>> Cleaning build artifacts..."
cargo clean 2>/dev/null || true

echo ">>> Starting clean build with --timings..."
START=$(date +%s)
cargo build --timings 2>&1 | tee /tmp/mc-rust-build.log
END=$(date +%s)
ELAPSED=$((END - START))
echo ""
echo ">>> Clean build completed in ${ELAPSED}s"

# Count compiled crates
CRATE_COUNT=$(grep -c "Compiling" /tmp/mc-rust-build.log || echo "unknown")
echo ">>> Crates compiled: ${CRATE_COUNT}"

# Binary size
BINARY="$TAURI_DIR/target/debug/mission-control"
if [ -f "$BINARY" ]; then
    SIZE=$(ls -lh "$BINARY" | awk '{print $5}')
    echo ">>> Debug binary size: $SIZE"
fi

# Dependency count
DEP_COUNT=$(cargo tree --depth 1 2>/dev/null | wc -l)
echo ">>> Direct dependencies: $DEP_COUNT"

# Total crates in lock file
LOCK_CRATES=$(grep -c '^name = ' "$TAURI_DIR/Cargo.lock" 2>/dev/null || echo "unknown")
echo ">>> Total crates in Cargo.lock: $LOCK_CRATES"

echo ""
echo ">>> Timing report saved to:"
echo "    $TAURI_DIR/target/cargo-timings/cargo-timing.html"
echo ""
echo "Open the HTML report in a browser to see per-crate timing breakdown."
echo "Look for the top 3 slowest crates and add them to rust-build-baseline.md."
