#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Mission Control — Pre-commit checks
# Run: ./scripts/pre-commit.sh   or install as .git/hooks/pre-commit
# ─────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
FRONTEND="$ROOT/frontend"
FRONTEND_SRC="$FRONTEND/src"
FAILED=0
TOTAL_START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

# ── Helpers ──────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

elapsed_ms() {
  local start_ns=$1
  local end_ns
  end_ns=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
  echo $(( (end_ns - start_ns) / 1000000 ))
}

pass() {
  local ms=$1; shift
  printf "${GREEN}  PASS${RESET}  %-40s ${CYAN}%s${RESET}\n" "$*" "${ms}ms"
}

fail() {
  local ms=$1; shift
  printf "${RED}  FAIL${RESET}  %-40s ${CYAN}%s${RESET}\n" "$*" "${ms}ms"
  FAILED=1
}

warn() {
  local ms=$1; shift
  printf "${YELLOW}  WARN${RESET}  %-40s ${CYAN}%s${RESET}\n" "$*" "${ms}ms"
}

section() {
  printf "\n${BOLD}── %s ──${RESET}\n" "$1"
}

# ─────────────────────────────────────────────────────────────
printf "${BOLD}Mission Control — Pre-commit Checks${RESET}\n"
# ─────────────────────────────────────────────────────────────

# ── 1. No Secrets Check (fastest — only scans staged files) ──
section "Secrets & Sensitive Data"

step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

secrets_found=0

# Check if .env.local or other secret files are staged
staged_files=$(git diff --cached --name-only 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)

if [ -n "$staged_files" ]; then
  # Block .env files, credential files, key files
  env_files=$(echo "$staged_files" | grep -E '\.env($|\.)' | grep -v '\.env\.example$' | grep -v '\.env\.test$' || true)
  env_files+=$(echo "$staged_files" | grep -E 'credentials\.json|\.pem$|\.key$|id_rsa|id_ed25519' || true)
  if [ -n "$env_files" ]; then
    printf "    ${RED}Staged secret files detected:${RESET}\n"
    echo "$env_files" | while read -r f; do printf "      - %s\n" "$f"; done
    secrets_found=1
  fi

  # Scan staged file contents for hardcoded secrets
  # Only check text files that are staged
  secret_patterns='(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|AKIA[A-Z0-9]{16}|password\s*[:=]\s*"[^"]{8,}|100\.\d+\.\d+\.\d+)'
  leaks=$(echo "$staged_files" | while read -r f; do
    [ -f "$ROOT/$f" ] || continue
    # skip binary files and lockfiles
    case "$f" in
      *.lock|*.png|*.jpg|*.ico|*.woff*|*.ttf|*.wasm|*pre-commit*) continue ;;
    esac
    git diff --cached -- "$ROOT/$f" 2>/dev/null | grep -En "$secret_patterns" || true
  done)

  if [ -n "$leaks" ]; then
    printf "    ${RED}Potential secrets in staged diffs:${RESET}\n"
    echo "$leaks" | head -10 | while read -r line; do printf "      %s\n" "$line"; done
    secrets_found=1
  fi
fi

ms=$(elapsed_ms "$step_start")
if [ "$secrets_found" -eq 1 ]; then
  fail "$ms" "No secrets in staged files"
else
  pass "$ms" "No secrets in staged files"
fi

# ── 2. Accessibility Grep Checks (fast static analysis) ──────
section "Accessibility (static analysis)"

# 2a. div/span onClick (should be <button> instead)
step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

a11y_clicks=$(grep -rn 'div onClick\|span onClick' "$FRONTEND_SRC" --include="*.tsx" 2>/dev/null || true)
click_count=$(echo "$a11y_clicks" | grep -c . 2>/dev/null || echo 0)
# Handle empty string case
[ -z "$a11y_clicks" ] && click_count=0

ms=$(elapsed_ms "$step_start")
if [ "$click_count" -gt 0 ]; then
  fail "$ms" "No div/span onClick (found $click_count — use <button>)"
  echo "$a11y_clicks" | head -5 | while read -r line; do printf "      %s\n" "$line"; done
  [ "$click_count" -gt 5 ] && printf "      ... and %d more\n" $((click_count - 5))
else
  pass "$ms" "No div/span onClick"
fi

# 2b. Inputs without aria-label
step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

# Count <input elements that lack aria-label, aria-labelledby, or id (for <label htmlFor>)
input_total=$(grep -rn '<input' "$FRONTEND_SRC" --include="*.tsx" 2>/dev/null | wc -l || echo 0)
input_labeled=$(grep -rn '<input' "$FRONTEND_SRC" --include="*.tsx" 2>/dev/null | grep -c 'aria-label\|aria-labelledby\|id=' || echo 0)
input_unlabeled=$((input_total - input_labeled))

ms=$(elapsed_ms "$step_start")
if [ "$input_unlabeled" -gt 10 ]; then
  warn "$ms" "Inputs without aria-label ($input_unlabeled of $input_total)"
elif [ "$input_unlabeled" -gt 0 ]; then
  pass "$ms" "Inputs without aria-label ($input_unlabeled of $input_total — OK)"
else
  pass "$ms" "All inputs have aria-label"
fi

# ── 3. TypeScript Type-check ─────────────────────────────────
section "TypeScript & Build"

step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

tsc_output=$(cd "$FRONTEND" && npx tsc --noEmit 2>&1) || tsc_exit=$?
tsc_exit=${tsc_exit:-0}
ms=$(elapsed_ms "$step_start")

if [ "$tsc_exit" -eq 0 ]; then
  pass "$ms" "TypeScript type-check (tsc --noEmit)"
else
  fail "$ms" "TypeScript type-check (tsc --noEmit)"
  echo "$tsc_output" | head -20 | while read -r line; do printf "      %s\n" "$line"; done
  tsc_errors=$(echo "$tsc_output" | grep -c 'error TS' || echo 0)
  [ "$tsc_errors" -gt 20 ] && printf "      ... %d errors total\n" "$tsc_errors"
fi

# ── 4. Vitest Tests ──────────────────────────────────────────
section "Tests"

step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

test_output=$(cd "$FRONTEND" && npx vitest run 2>&1) || test_exit=$?
test_exit=${test_exit:-0}
ms=$(elapsed_ms "$step_start")

if [ "$test_exit" -eq 0 ]; then
  # Extract test count from vitest output
  test_summary=$(echo "$test_output" | grep -E 'Tests\s+\d+' | tail -1 || echo "")
  pass "$ms" "Vitest tests${test_summary:+ — $test_summary}"
else
  fail "$ms" "Vitest tests"
  # Show failed test names
  echo "$test_output" | grep -E 'FAIL|AssertionError|Error:|expected|×' | head -15 | while read -r line; do printf "      %s\n" "$line"; done
fi

# ── 5. Vite Build ────────────────────────────────────────────
section "Production Build"

step_start=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

build_output=$(cd "$FRONTEND" && npx vite build 2>&1) || build_exit=$?
build_exit=${build_exit:-0}
ms=$(elapsed_ms "$step_start")

if [ "$build_exit" -eq 0 ]; then
  # Extract bundle size info
  bundle_info=$(echo "$build_output" | grep -E 'dist/.*\.js' | tail -1 || echo "")
  pass "$ms" "Vite production build${bundle_info:+ — $bundle_info}"
else
  fail "$ms" "Vite production build"
  echo "$build_output" | grep -iE 'error|failed|cannot find' | head -10 | while read -r line; do printf "      %s\n" "$line"; done
fi

# ── Summary ──────────────────────────────────────────────────
total_ms=$(elapsed_ms "$TOTAL_START")
total_sec=$(echo "scale=1; $total_ms / 1000" | bc 2>/dev/null || echo "$((total_ms / 1000))")

printf "\n${BOLD}──────────────────────────────────────────────${RESET}\n"
if [ "$FAILED" -eq 0 ]; then
  printf "${GREEN}${BOLD}All checks passed${RESET} in ${CYAN}${total_sec}s${RESET}\n"
  exit 0
else
  printf "${RED}${BOLD}Some checks failed${RESET} in ${CYAN}${total_sec}s${RESET} — fix before committing\n"
  exit 1
fi
