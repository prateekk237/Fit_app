#!/usr/bin/env bash
# Phase 16 (Vercel pivot) integration test.
# Validates the changes that ride on top of the Phase 5/11/12/13 tests:
#  - /api/cron/* Bearer auth
#  - photo route still works (with the new maxDuration export)
#  - weekly-digest cron triggers a regen
#  - storage abstraction (disk fallback because R2 envs unset in dev)
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR" /tmp/fit-meal16.jpg' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

CRON_SECRET="${CRON_SECRET:-test-cron-secret-please-change-me}"
export CRON_SECRET

echo "Phase 16 (Vercel pivot) test against $BASE"
uid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc "SELECT id FROM users LIMIT 1")
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid;
   DELETE FROM food_logs WHERE log_date = CURRENT_DATE;" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Cron routes are public-from-middleware-perspective but Bearer-gated.
for path in /api/cron/alerts /api/cron/weekly-digest /api/cron/keepalive; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  [ "$code" = "401" ] && pass "$path no Bearer → 401" || fail "$path got $code"
done

# 2. Wrong Bearer → 401.
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong' "$BASE/api/cron/keepalive")
[ "$code" = "401" ] && pass "wrong Bearer → 401" || fail "got $code"

# 3. Right Bearer → 200 (keepalive).
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/keepalive")
[ "$code" = "200" ] && pass "keepalive with valid Bearer → 200" || fail "got $code"

# 4. Alerts cron iterates users and persists alerts (mock-time would be
#    current — IST evening might or might not fire MEAL_MISSED_BREAKFAST,
#    so we only assert it returns 200 and shape is correct).
res=$(curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/alerts")
results_len=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).results.length))")
[ "$results_len" -ge 1 ] && pass "alerts cron processed $results_len user(s)" || fail "got $results_len"

# 5. Weekly-digest cron writes a WEEKLY_DIGEST cache row.
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/weekly-digest")
[ "$code" = "200" ] && pass "weekly-digest cron → 200" || fail "got $code"
cache=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid AND type='WEEKLY_DIGEST'")
[ "$cache" = "1" ] && pass "WEEKLY_DIGEST cache row present" || fail "rows=$cache"

# 6. Photo route still works with maxDuration = 10. Reuse Phase 6 sample.
node -e "
const sharp=require('sharp');
sharp({create:{width:300,height:300,channels:3,background:{r:200,g:140,b:80}}})
  .jpeg({quality:75}).toFile('/tmp/fit-meal16.jpg').then(()=>console.log('ok'));
" > /dev/null
res=$(curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-meal16.jpg" -F "preview=1")
provider=$(jq_get "$res" provider)
[ -n "$provider" ] && pass "photo analyse provider=$provider" || fail "no provider"
food_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.foods.length))")
[ "$food_count" -ge 1 ] && pass "photo returned $food_count item(s)" || fail "count=$food_count"

# 7. Storage abstraction — uploads still land in ./uploads (disk fallback).
mkdir -p uploads
res=$(curl -s -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fit-meal16.jpg" -F "type=body")
url=$(jq_get "$res" url)
echo "$url" | grep -q '^/api/photos/body-' && pass "progress-photo URL: $url" || fail "url=$url"
# File should be on disk since R2_BUCKET_NAME isn't set.
disk_file=$(echo "$url" | sed 's|/api/photos/||')
[ -f "uploads/$disk_file" ] && pass "disk fallback wrote uploads/$disk_file" || fail "no disk file"

# 8. Photo serve route streams the bytes.
size=$(curl -s -o /dev/null -w '%{size_download}' "$BASE$url" -b "$JAR")
[ "$size" -gt 100 ] && pass "auth'd photo serve returned $size bytes" || fail "size=$size"

# Cleanup.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid;
   DELETE FROM food_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM weight_logs WHERE log_date = CURRENT_DATE;" >/dev/null
rm -f "uploads/$disk_file" 2>/dev/null || true

echo
echo "✅ Phase 16 (Vercel pivot) integration test passed."
