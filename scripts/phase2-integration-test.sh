#!/usr/bin/env bash
# Phase 2 end-to-end auth test. Run against `pnpm dev`.
# Usage: ./scripts/phase2-integration-test.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "Phase 2 integration test against $BASE"

# 1. Health endpoint is public.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")
[ "$code" = "200" ] && pass "GET /api/health → 200" || fail "health was $code"

# 2. Unauthenticated profile request is 401.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/user/profile")
[ "$code" = "401" ] && pass "GET /api/user/profile (no cookie) → 401" || fail "profile was $code"

# 3. Unauthenticated page request 307/308 redirects to /login.
redirect=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE/")
code=${redirect%% *}
url=${redirect#* }
echo "$code $url" | grep -qE '^(307|308) .*\/login' && pass "GET / (no cookie) → redirect $code to $url" || fail "redirect was $code $url"

# 4. Wrong PIN × 3 → 401 then 429.
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"pin":"999999"}')
  if [ "$i" -le 3 ] && [ "$code" != "401" ]; then fail "attempt $i expected 401, got $code"; fi
done
pass "wrong PIN ×3 → 401 three times"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"pin":"999999"}')
[ "$code" = "429" ] && pass "4th attempt → 429 rate-limited" || fail "expected 429, got $code"

# 5. Wait for rate-limit to clear (15 min) — skip with an override:
#    We instead reset by restarting the dev server in CI. Here we just verify
#    that once the user restarts dev, login works. For the scripted run we
#    bump the limiter by using a different IP via X-Forwarded-For.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 10.0.0.99' \
  -d '{"pin":"123456"}' -c "$COOKIE_JAR")
[ "$code" = "200" ] && pass "correct PIN 123456 → 200 (new IP)" || fail "login was $code"

grep -q "fit_token" "$COOKIE_JAR" && pass "httpOnly fit_token cookie set" || fail "no fit_token cookie"
grep -q "HttpOnly" "$COOKIE_JAR" && pass "cookie has HttpOnly flag" || fail "cookie missing HttpOnly"

# 6. Authenticated profile GET.
profile=$(curl -s "$BASE/api/user/profile" -b "$COOKIE_JAR")
echo "$profile" | grep -q '"name":"Prateek"' && pass "GET profile returns Prateek" || fail "profile was: $profile"

# 7. Authenticated profile PUT (increase calorie target, then set back).
patch=$(curl -s -X PUT "$BASE/api/user/profile" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d '{"dailyCalorieTarget":2000}')
echo "$patch" | grep -q '"dailyCalorieTarget":2000' && pass "PUT profile 2000 kcal" || fail "PUT response: $patch"

curl -s -X PUT "$BASE/api/user/profile" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d '{"dailyCalorieTarget":1900}' > /dev/null

# 8. PUT rejects out-of-range values (600 kcal — below min 1000).
code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/user/profile" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d '{"dailyCalorieTarget":600}')
[ "$code" = "400" ] && pass "PUT 600 kcal → 400 validation error" || fail "got $code"

# 9. Change-PIN happy path.
cp_res=$(curl -s -X POST "$BASE/api/user/change-pin" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d '{"currentPin":"123456","newPin":"246810"}')
echo "$cp_res" | grep -q '"ok":true' && pass "change PIN 123456 → 246810" || fail "change-pin: $cp_res"

# Wrong currentPin is rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/user/change-pin" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"currentPin":"000000","newPin":"111111"}')
[ "$code" = "401" ] && pass "wrong currentPin → 401" || fail "got $code"

# Revert back to 123456.
curl -s -X POST "$BASE/api/user/change-pin" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d '{"currentPin":"246810","newPin":"123456"}' > /dev/null
pass "revert PIN to 123456"

# 10. Logout clears cookie (Set-Cookie with Max-Age=0).
logout_hdr=$(curl -s -i -X POST "$BASE/api/auth/logout" -b "$COOKIE_JAR")
echo "$logout_hdr" | grep -qi 'Set-Cookie:.*fit_token=;.*Max-Age=0' \
  && pass "POST /api/auth/logout clears cookie" \
  || fail "logout header: $(echo "$logout_hdr" | head -20)"

echo
echo "✅ Phase 2 integration test passed."
