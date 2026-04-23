#!/usr/bin/env bash
# Phase 6 photo-log UI flow test.
# Simulates the full client-side flow via API:
#   capture -> POST /api/food-logs/photo?preview=1 -> edit item portions ->
#   POST /api/food-logs for each edited item -> dashboard reacts.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR" /tmp/fit-meal.jpg' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 6 photo-log flow test against $BASE"

# Reset log_date slate.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

# Craft a sample meal photo (small JPEG).
node -e "
const sharp=require('sharp');
sharp({create:{width:480,height:480,channels:3,background:{r:200,g:120,b:80}}})
  .jpeg({quality:75}).toFile('/tmp/fit-meal.jpg').then(()=>console.log('ok'));
" > /dev/null
[ -s /tmp/fit-meal.jpg ] && pass "sample JPEG crafted ($(wc -c </tmp/fit-meal.jpg) bytes)" || fail "no sample"

# 0. Login
IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login was $code"

# 1. /log/photo page renders (server-side HTML even if client-rendered).
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/log/photo" -b "$JAR")
[ "$code" = "200" ] && pass "GET /log/photo → 200" || fail "got $code"

# 2. Preview-mode analysis returns shape the UI expects.
res=$(curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-meal.jpg" -F "preview=1")
provider=$(jq_get "$res" provider)
food_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.foods.length))")
conf=$(jq_get "$res" result.confidence)
duration=$(jq_get "$res" durationMs)
[ -n "$provider" ] && pass "preview has provider=$provider" || fail "no provider"
[ "$food_count" -ge 1 ] && pass "preview detected $food_count food(s)" || fail "foods=$food_count"
[ -n "$conf" ] && pass "preview has confidence=$conf" || fail "no conf"
[ -n "$duration" ] && pass "preview has durationMs=$duration" || fail "no duration"

# 3. Preview did NOT persist (per client-edit UX contract).
db_rows=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM food_logs WHERE log_date = CURRENT_DATE")
[ "$db_rows" = "0" ] && pass "preview mode: no DB writes yet" || fail "unexpected $db_rows rows"

# 4. Each returned item has required fields for the UI to render.
missing=$(echo "$res" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const r=JSON.parse(d);
  const required=['name','portion_grams','calories','protein_g','carbs_g','fat_g','is_veg'];
  const bad=[];
  for(const f of r.result.foods){for(const k of required){if(f[k]===undefined||f[k]===null)bad.push(k)}}
  console.log(bad.length);
});")
[ "$missing" = "0" ] && pass "every item has required fields" || fail "$missing missing fields"

# 5. Simulate user editing: double the portion of each item then batch-save via
#    individual POST /api/food-logs (the path the React client uses).
items=$(echo "$res" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const r=JSON.parse(d).result;
  console.log(JSON.stringify(r.foods.map(f=>({
    foodName:f.name,
    portionG:f.portion_grams*2,
    calories:f.calories*2,
    proteinG:f.protein_g*2,
    carbsG:f.carbs_g*2,
    fatG:f.fat_g*2,
    mealType:'dinner'
  }))));
});")
count=$(echo "$items" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length))")
[ "$count" -ge 1 ] && pass "client built $count edited items" || fail "no items to save"

# Save each item sequentially (mirrors the client's saveAll loop).
saved=0
echo "$items" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).map(i=>JSON.stringify(i)).join('\n'))})
" > /tmp/items.ndjson
while read -r item; do
  [ -z "$item" ] && continue
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs" -b "$JAR" \
    -H 'Content-Type: application/json' -d "$item")
  [ "$code" = "201" ] || fail "save failed ($code) for $item"
  saved=$((saved+1))
done < /tmp/items.ndjson
[ "$saved" = "$count" ] && pass "batch-save POST'd $saved food_logs" || fail "saved $saved/$count"

# 6. Dashboard reflects the saved items.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
items_logged=$(jq_get "$dash" consumed.itemsLogged)
[ "$items_logged" = "$count" ] && pass "dashboard itemsLogged=$items_logged" || fail "got $items_logged"
dash_cal=$(jq_get "$dash" consumed.calories)
[ "$dash_cal" != "0" ] && pass "dashboard calories=$dash_cal (non-zero)" || fail "dashboard still 0"

# 7. Discard flow — preview then abandon. No DB writes.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null
curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-meal.jpg" -F "preview=1" > /dev/null
db_rows=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM food_logs WHERE log_date = CURRENT_DATE")
[ "$db_rows" = "0" ] && pass "discard flow: preview then no save → 0 rows" || fail "got $db_rows"

# 8. A real save without preview flag persists directly (legacy path).
res=$(curl -s -X POST "$BASE/api/food-logs/photo" -b "$JAR" \
  -F "image=@/tmp/fit-meal.jpg")
direct_logs=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logIds.length))")
[ "$direct_logs" -ge 1 ] && pass "non-preview POST persists $direct_logs rows" || fail "direct=$direct_logs"

echo
echo "✅ Phase 6 integration test passed."
