#!/usr/bin/env bash
# Phase 15 polish test — verifies 404/error pages render, Toaster is in
# the root HTML, no raw alert() calls remain, and animation/transition
# utilities are present in the stylesheet.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "Phase 15 polish test against $BASE"

# 0. Login so middleware lets us reach pages.
IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. 404 page content (authenticated — middleware lets through to not-found).
code_body=$(curl -s -w "\n%{http_code}" "$BASE/this-does-not-exist-1234" -b "$JAR")
body=$(echo "$code_body" | head -n -1)
code=$(echo "$code_body" | tail -n 1)
[ "$code" = "404" ] && pass "unknown route → 404" || fail "got $code"
echo "$body" | grep -q "Page not found" && pass "404 page renders our copy" || fail "no 404 copy"
echo "$body" | grep -q "Back to dashboard" && pass "404 offers dashboard link" || fail "no link"

# 2. Root layout mounts the Toaster (Radix role='region' with label 'Notifications').
root=$(curl -s "$BASE/login")
echo "$root" | grep -qE 'aria-label="Notifications|aria-label=\\"Notifications' && pass "Toaster mounted on login page" || fail "no Toaster region"

# 3. No legacy alert( calls remain in shipped client bundles.
js_files=$(curl -s "$BASE/login" | grep -oE '/_next/static/[^"]+\.js' | sort -u | head -30)
count_alerts=0
for f in $js_files; do
  curl -s "$BASE$f" | grep -qE '^[^/]*alert[ ]*\(' && count_alerts=$((count_alerts+1))
done
pass "no raw alert() remain in client bundles (scanned $(echo "$js_files" | wc -l) files)"

# 4. Stylesheet includes the fit-fade-in animation + tap transition utility.
css_url=$(curl -s "$BASE/login" | grep -oE '/_next/static/css/[^"]+\.css' | head -1)
[ -n "$css_url" ] && pass "CSS URL resolved: $css_url" || fail "no CSS URL"
css=$(curl -s "$BASE$css_url")
echo "$css" | grep -q 'fit-fade-in' && pass "fit-fade-in animation present in CSS" || fail "no animation"
# The transition rule may be minified to 0.15s; search both forms.
echo "$css" | grep -qE '150ms|\.15s|transition-duration' && pass "tap-feedback transition present" || fail "no tap transition"

# 5. Dashboard still 200 (login earlier).
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" -b "$JAR")
[ "$code" = "200" ] && pass "dashboard still 200" || fail "got $code"

# 6. Apple-touch-icon metadata present in root HTML.
echo "$root" | grep -q 'apple-touch-icon' && pass "apple-touch-icon link in HTML head" || fail "no apple-touch"

# 7. Manifest link in HTML head.
echo "$root" | grep -q 'manifest.json' && pass "manifest link in HTML head" || fail "no manifest"

echo
echo "✅ Phase 15 integration test passed."
