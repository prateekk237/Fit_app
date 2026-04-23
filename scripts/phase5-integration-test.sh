#!/usr/bin/env bash
# Phase 5 photo-analyser end-to-end test.
# Uses the mock provider (no NVIDIA_API_KEY in env) so the test runs
# with zero external dependencies. When real keys are present, the same
# flow exercises the real providers.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR" /tmp/fit-sample.jpg' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 5 photo-analyser test against $BASE"

# Clean slate.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

# Craft a small valid JPEG on the fly using sharp.
node -e "
const sharp=require('sharp');
sharp({create:{width:64,height:64,channels:3,background:{r:240,g:200,b:120}}})
  .jpeg({quality:80}).toFile('/tmp/fit-sample.jpg').then(()=>console.log('ok'));
" > /dev/null
[ -s /tmp/fit-sample.jpg ] && pass "sample JPEG crafted ($(wc -c </tmp/fit-sample.jpg) bytes)" || fail "no sample"

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login was $code"

# 1. Unauthenticated request is 401.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs/photo" \
  -F "image=@/tmp/fit-sample.jpg")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. Missing image is 400.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "not_image=foo")
[ "$code" = "400" ] && pass "no image → 400" || fail "got $code"

# 3. Non-image content-type rejected.
echo "not an image" > /tmp/fake.txt
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fake.txt;type=text/plain")
[ "$code" = "415" ] && pass "non-image → 415" || fail "got $code"
rm -f /tmp/fake.txt

# 4. Happy path (mock provider → rajma + brown rice).
start=$(date +%s%N)
res=$(curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-sample.jpg" -F "meal_type=dinner")
end=$(date +%s%N)
elapsed_ms=$(( (end - start) / 1000000 ))
provider=$(jq_get "$res" provider)
food_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.foods.length))")
confidence=$(jq_get "$res" result.confidence)
total_cal=$(jq_get "$res" result.total_calories)
log_ids_len=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logIds.length))")

echo "    provider=$provider | foods=$food_count | conf=$confidence | cal=$total_cal | logs=$log_ids_len | ${elapsed_ms}ms"
[ "$provider" = "mock" ] || [ "$provider" = "nvidia-nim" ] && pass "provider resolved ($provider)" || fail "provider=$provider"
[ "$food_count" -ge 1 ] && pass "at least 1 food detected ($food_count)" || fail "foods=$food_count"
# confidence must be > 0.5 per spec
conf_int=$(node -e "console.log(Math.round(($confidence||0)*100))")
[ "$conf_int" -gt 50 ] && pass "confidence > 0.5 ($confidence)" || fail "confidence=$confidence"
[ "$elapsed_ms" -lt 8000 ] && pass "processing < 8s (${elapsed_ms}ms)" || fail "${elapsed_ms}ms too slow"
[ "$log_ids_len" = "$food_count" ] && pass "each food persisted as food_log" || fail "$log_ids_len vs $food_count"

# 5. Dashboard reflects the new logs.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
dash_items=$(jq_get "$dash" consumed.itemsLogged)
[ "$dash_items" = "$food_count" ] && pass "dashboard itemsLogged=$dash_items" || fail "items=$dash_items"

# 6. ai_raw_json is stored on each row.
ai_rows=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM food_logs WHERE source='photo' AND ai_raw_json IS NOT NULL AND log_date=CURRENT_DATE")
[ "$ai_rows" = "$food_count" ] && pass "ai_raw_json saved on $ai_rows row(s)" || fail "ai_rows=$ai_rows"

# 7. Preview mode does NOT persist.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null
res=$(curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-sample.jpg" -F "preview=1")
preview_logs=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logIds.length))")
preview_foods=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.foods.length))")
[ "$preview_logs" = "0" ] && pass "preview=1 → no logs persisted" || fail "preview inserted $preview_logs"
[ "$preview_foods" -ge 1 ] && pass "preview=1 still returns foods ($preview_foods)" || fail "preview foods=$preview_foods"
db_rows=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM food_logs WHERE log_date = CURRENT_DATE")
[ "$db_rows" = "0" ] && pass "DB confirms preview bypass" || fail "leaked $db_rows rows"

# 8. Schema shape — zod-validated server-side.
bad_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-sample.jpg" -F "meal_type=invalid-meal-type")
# meal_type falls back to inferred → still 201. Ensure not 400.
[ "$bad_code" = "201" ] && pass "invalid meal_type silently falls back" || fail "$bad_code"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

# 9. Rate limit: 12 photos / 5 min / user. We've already made 3 calls, so
#    expect ≥ 1 success (out of 12 more) and ≥ 1 × 429 somewhere in the sequence.
ok_count=0
rl_count=0
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
    -F "image=@/tmp/fit-sample.jpg" -F "preview=1")
  if [ "$code" = "200" ]; then ok_count=$((ok_count+1)); fi
  if [ "$code" = "429" ]; then rl_count=$((rl_count+1)); fi
done
echo "    after 12 more calls: ok=$ok_count rate-limited=$rl_count"
[ "$rl_count" -ge 1 ] && pass "rate limit triggered at some point ($rl_count × 429)" || fail "no 429 seen"
[ "$ok_count" -ge 1 ] && pass "at least one extra call succeeded ($ok_count × 200)" || fail "none succeeded"

echo
echo "✅ Phase 5 integration test passed."
