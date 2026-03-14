#!/usr/bin/env bash
set -euo pipefail

echo "Running pre-commit checks..."

cd "$(git rev-parse --show-toplevel)/frontend"

echo "Running tests..."
npx vitest run

echo "Type-checking..."
npx tsc --noEmit

echo "All pre-commit checks passed."
