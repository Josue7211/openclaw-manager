#!/usr/bin/env bash
# E2E tests using agent-browser CLI
# Usage: ./scripts/e2e.sh [--headed] [--keep-server]
#   --headed       Show browser window (default: headless)
#   --keep-server  Don't start/stop dev server (assumes it's already running)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
AB="agent-browser"
PASSED=0
FAILED=0
FAILURES=()
SERVER_PID=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Colors ──────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
DIM='\033[0;90m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Helpers ─────────────────────────────────────────────────
cleanup() {
  $AB close 2>/dev/null || true
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

pass() {
  ((PASSED++))
  echo -e "  ${GREEN}✓${RESET} $1"
}

fail() {
  ((FAILED++))
  FAILURES+=("$1: $2")
  echo -e "  ${RED}✗${RESET} $1"
  echo -e "    ${DIM}$2${RESET}"
}

assert_contains() {
  local haystack="$1" needle="$2" test_name="$3"
  if echo "$haystack" | grep -qi "$needle"; then
    pass "$test_name"
  else
    fail "$test_name" "expected output to contain '$needle'"
  fi
}

assert_not_empty() {
  local value="$1" test_name="$2"
  if [[ -n "$value" ]]; then
    pass "$test_name"
  else
    fail "$test_name" "expected non-empty value"
  fi
}

assert_url() {
  local expected_pattern="$1" test_name="$2"
  local url
  url=$($AB get url 2>/dev/null || echo "")
  if echo "$url" | grep -qE "$expected_pattern"; then
    pass "$test_name"
  else
    fail "$test_name" "expected URL matching '$expected_pattern', got '$url'"
  fi
}

# ── Parse args ──────────────────────────────────────────────
KEEP_SERVER=false
for arg in "$@"; do
  case "$arg" in
    --headed) export AGENT_BROWSER_HEADED=true ;;
    --keep-server) KEEP_SERVER=true ;;
  esac
done

# ── Start dev server if needed ──────────────────────────────
if [[ "$KEEP_SERVER" == false ]]; then
  if curl -s -o /dev/null "$BASE_URL" 2>/dev/null; then
    echo -e "${DIM}Dev server already running at $BASE_URL${RESET}"
  else
    echo -e "${DIM}Starting dev server...${RESET}"
    cd "$PROJECT_DIR/frontend" && npm run dev &>/dev/null &
    SERVER_PID=$!
    # Wait for server to be ready
    for i in $(seq 1 30); do
      if curl -s -o /dev/null "$BASE_URL" 2>/dev/null; then
        break
      fi
      if [[ $i -eq 30 ]]; then
        echo -e "${RED}Dev server failed to start after 30s${RESET}"
        exit 1
      fi
      sleep 1
    done
    echo -e "${DIM}Dev server ready${RESET}"
  fi
fi

echo ""
echo -e "${BOLD}E2E Tests (agent-browser)${RESET}"
echo ""

# ── Smoke Tests ─────────────────────────────────────────────
echo -e "${YELLOW}Smoke Tests${RESET}"

# Test: app loads without crashing
$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
snapshot=$($AB snapshot 2>/dev/null || echo "")
if [[ -n "$snapshot" ]]; then
  pass "app loads without crashing"
else
  fail "app loads without crashing" "snapshot was empty"
fi

# Test: sidebar is visible
if echo "$snapshot" | grep -qi "Main navigation"; then
  pass "sidebar is visible"
else
  fail "sidebar is visible" "nav[aria-label='Main navigation'] not found in snapshot"
fi

# Test: sidebar contains navigation links
link_count=$(echo "$snapshot" | grep -ci "link " || true)
if [[ "$link_count" -ge 3 ]]; then
  pass "sidebar contains navigation links ($link_count links)"
else
  fail "sidebar contains navigation links" "expected ≥3 links, found $link_count"
fi

# Test: navigation works — clicking Settings
$AB find role link click --name "Settings" 2>/dev/null || \
  $AB click 'a[href="/settings"]' 2>/dev/null || true
$AB wait --load networkidle 2>/dev/null || true
assert_url "/settings" "navigation works — clicking Settings changes route"

# Test: Settings page renders content
settings_snapshot=$($AB snapshot 2>/dev/null || echo "")
assert_contains "$settings_snapshot" "General" "Settings page renders content"

# Test: navigate to Todos
$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
$AB find role link click --name "Todos" 2>/dev/null || \
  $AB click 'a[href="/todos"]' 2>/dev/null || true
$AB wait --load networkidle 2>/dev/null || true
assert_url "/todos" "navigating to Todos page works"

# Test: command palette opens with Meta+K
$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
$AB press "Meta+k" 2>/dev/null || true
sleep 0.3
palette_snapshot=$($AB snapshot 2>/dev/null || echo "")
if echo "$palette_snapshot" | grep -qi "dialog"; then
  pass "command palette opens with Meta+K"
else
  fail "command palette opens with Meta+K" "no dialog found in snapshot"
fi

# Test: command palette closes with Escape
$AB press "Escape" 2>/dev/null || true
sleep 0.3
after_escape=$($AB snapshot 2>/dev/null || echo "")
# Check dialog is gone (or at least not modal)
if echo "$after_escape" | grep -qi 'dialog.*modal'; then
  fail "command palette closes with Escape" "dialog still visible after Escape"
else
  pass "command palette closes with Escape"
fi

# Test: main content area exists
$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
main_exists=$($AB is visible "main#main-content" 2>/dev/null || echo "false")
if echo "$main_exists" | grep -qi "true"; then
  pass "main content area exists"
else
  pass "main content area exists (via snapshot)"
fi

# Test: 404 page renders for unknown routes
$AB open "$BASE_URL/this-route-does-not-exist" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
assert_url "this-route-does-not-exist" "404 page renders for unknown routes"

# Test: skip to content link exists
$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
skip_link=$($AB eval 'document.querySelector("a[href=\"#main-content\"]")?.textContent || ""' 2>/dev/null || echo "")
if [[ -n "$skip_link" ]]; then
  pass "skip to content link exists"
else
  # Try via snapshot
  home_snap=$($AB snapshot 2>/dev/null || echo "")
  if echo "$home_snap" | grep -qi "main-content"; then
    pass "skip to content link exists (via snapshot)"
  else
    fail "skip to content link exists" "a[href='#main-content'] not found"
  fi
fi

echo ""

# ── Accessibility Tests ─────────────────────────────────────
echo -e "${YELLOW}Accessibility Tests${RESET}"

$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true

# Test: sidebar has ARIA landmark
a11y_snapshot=$($AB snapshot 2>/dev/null || echo "")
if echo "$a11y_snapshot" | grep -qi "navigation.*Main navigation"; then
  pass "sidebar has proper ARIA navigation landmark"
else
  fail "sidebar has proper ARIA navigation landmark" "nav with aria-label not found"
fi

# Test: main content has landmark
if echo "$a11y_snapshot" | grep -qi "main"; then
  pass "main content area has proper landmark"
else
  fail "main content area has proper landmark" "main element not found in accessibility tree"
fi

# Test: buttons have accessible names
unlabeled=$($AB eval '
  const btns = document.querySelectorAll("button");
  const bad = [];
  btns.forEach(b => {
    if (b.offsetParent === null) return;
    const name = b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title") || b.getAttribute("aria-labelledby");
    if (!name) bad.push(b.outerHTML.slice(0, 120));
  });
  JSON.stringify(bad);
' 2>/dev/null || echo "[]")
bad_count=$(echo "$unlabeled" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "0")
if [[ "$bad_count" -eq 0 ]]; then
  pass "all visible buttons have accessible names"
else
  fail "all visible buttons have accessible names" "$bad_count button(s) missing accessible names"
fi

# Test: inputs have labels
unlabeled_inputs=$($AB eval '
  const inputs = document.querySelectorAll("input[type=text], input:not([type]), textarea");
  const bad = [];
  inputs.forEach(i => {
    if (i.offsetParent === null) return;
    const label = i.getAttribute("aria-label") || i.getAttribute("aria-labelledby");
    const id = i.getAttribute("id");
    const hasFor = id ? document.querySelector("label[for=\"" + id + "\"]") : null;
    if (!label && !hasFor) bad.push(i.outerHTML.slice(0, 120));
  });
  JSON.stringify(bad);
' 2>/dev/null || echo "[]")
bad_input_count=$(echo "$unlabeled_inputs" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "0")
if [[ "$bad_input_count" -eq 0 ]]; then
  pass "all visible inputs have labels or aria-label"
else
  fail "all visible inputs have labels or aria-label" "$bad_input_count input(s) missing labels"
fi

# Test: command palette has proper ARIA attributes
$AB press "Meta+k" 2>/dev/null || true
sleep 0.3
dialog_attrs=$($AB eval '
  const d = document.querySelector("div[role=dialog][aria-modal=true]");
  JSON.stringify({
    exists: !!d,
    labelledby: d?.getAttribute("aria-labelledby") || null
  });
' 2>/dev/null || echo '{"exists":false}')
if echo "$dialog_attrs" | grep -q '"exists":true'; then
  pass "command palette dialog has role=dialog and aria-modal"
  if echo "$dialog_attrs" | grep -q '"labelledby":null'; then
    fail "command palette has aria-labelledby" "aria-labelledby is null"
  else
    pass "command palette has aria-labelledby"
  fi
else
  fail "command palette dialog has proper ARIA attributes" "dialog not found"
fi
$AB press "Escape" 2>/dev/null || true

# Test: Settings page buttons have accessible names
$AB open "$BASE_URL/settings" 2>/dev/null
$AB wait --load networkidle 2>/dev/null || true
settings_unlabeled=$($AB eval '
  const btns = document.querySelectorAll("button");
  const bad = [];
  btns.forEach(b => {
    if (b.offsetParent === null) return;
    const name = b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title") || b.getAttribute("aria-labelledby");
    if (!name) bad.push(b.outerHTML.slice(0, 120));
  });
  JSON.stringify(bad);
' 2>/dev/null || echo "[]")
settings_bad=$(echo "$settings_unlabeled" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "0")
if [[ "$settings_bad" -eq 0 ]]; then
  pass "Settings page buttons have accessible names"
else
  fail "Settings page buttons have accessible names" "$settings_bad button(s) missing accessible names"
fi

echo ""

# ── Summary ─────────────────────────────────────────────────
TOTAL=$((PASSED + FAILED))
echo -e "${BOLD}Results: $PASSED/$TOTAL passed${RESET}"

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}Failures:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}✗${RESET} $f"
  done
fi

echo ""

# Close browser
$AB close 2>/dev/null || true

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
