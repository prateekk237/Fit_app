#!/usr/bin/env bash
# Phase 4 end-to-end test for manual food logging.
# Requires pnpm dev running on $BASE and Postgres reachable.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 4 food-logging test against $BASE"

# Fresh IP so rate limiter doesn't trip.
IP="10.0.0.$((RANDOM % 254 + 2))"

# Ensure a clean log_date slate.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

# 0. Login
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login was $code"

# 1. Search: paneer — 3+ results
res=$(curl -s "$BASE/api/foods/search?q=paneer" -b "$JAR")
paneer_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).foods.length))")
[ "$paneer_count" -ge 3 ] && pass "search 'paneer' → $paneer_count results (≥3)" || fail "got $paneer_count"

# 2. Typo tolerance: panner finds paneer
res=$(curl -s "$BASE/api/foods/search?q=panner" -b "$JAR")
has_paneer=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).foods;console.log(r.some(f=>/paneer/i.test(f.name)))})")
[ "$has_paneer" = "true" ] && pass "typo 'panner' → paneer matched" || fail "no paneer in typo search"

# 3. Hindi search (url-encoded)
res=$(curl -s --get --data-urlencode "q=दाल" "$BASE/api/foods/search" -b "$JAR")
hindi_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).foods.length)}catch{console.log('0')}})")
[ "$hindi_count" -ge 1 ] && pass "hindi 'दाल' matches ($hindi_count hits)" || fail "hindi search empty (got: $res)"

# 4. Veg filter
res=$(curl -s "$BASE/api/foods/search?q=chicken&veg=true" -b "$JAR")
veg_chicken=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).foods.length))")
[ "$veg_chicken" = "0" ] && pass "veg filter excludes chicken" || fail "veg filter leaked $veg_chicken chicken"

# 5. Get paneer low-fat id (primary food we'll log against)
paneer_id=$(curl -s "$BASE/api/foods/search?q=paneer%20low" -b "$JAR" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).foods;console.log(r[0]?r[0].id:'')})")
[ -n "$paneer_id" ] && pass "resolved paneer low-fat id=$paneer_id" || fail "no paneer id"

# 6. Create a log (100g paneer low-fat → 160 kcal, 22g P)
create=$(curl -s -X POST "$BASE/api/food-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"foodId\":$paneer_id,\"portionG\":100,\"mealType\":\"lunch\"}")
log_id=$(jq_get "$create" id)
cal=$(jq_get "$create" calories)
prot=$(jq_get "$create" proteinG)
[ -n "$log_id" ] && pass "created log id=$log_id" || fail "create failed: $create"
[ "$cal" = "160" ] && pass "100g paneer low-fat → 160 kcal" || fail "cal=$cal"
[ "$prot" = "22" ] && pass "100g paneer low-fat → 22g protein" || fail "protein=$prot"

# 7. Dashboard reflects the new log.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
dash_cal=$(jq_get "$dash" consumed.calories)
items=$(jq_get "$dash" consumed.itemsLogged)
[ "$dash_cal" = "160" ] && pass "dashboard consumed.calories = 160" || fail "dash cal=$dash_cal"
[ "$items" = "1" ] && pass "dashboard itemsLogged = 1" || fail "items=$items"

# 8. Patch portion: 100g → 150g → should scale to 240 kcal.
patch=$(curl -s -X PATCH "$BASE/api/food-logs/$log_id" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"portionG":150}')
new_cal=$(jq_get "$patch" calories)
new_prot=$(jq_get "$patch" proteinG)
[ "$new_cal" = "240" ] && pass "patched portion 150g → 240 kcal" || fail "patched cal=$new_cal"
[ "$new_prot" = "33" ] && pass "patched portion 150g → 33g protein" || fail "prot=$new_prot"

# Patch validation: portion 9 should fail (min 10? actually 9 is below 1-range? schema is >0 ≤3000, so 9 is allowed…
# validate zero is rejected
code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/food-logs/$log_id" \
  -b "$JAR" -H 'Content-Type: application/json' -d '{"portionG":0}')
[ "$code" = "400" ] && pass "patch portionG=0 → 400" || fail "got $code"

# 9. GET today's logs.
logs=$(curl -s "$BASE/api/food-logs" -b "$JAR")
logs_count=$(echo "$logs" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logs.length))")
[ "$logs_count" = "1" ] && pass "GET /api/food-logs returns 1 entry" || fail "count=$logs_count"

# 10. Delete.
del=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/food-logs/$log_id" -b "$JAR")
[ "$del" = "200" ] && pass "DELETE log → 200" || fail "delete=$del"

# 11. Dashboard cal back to 0.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
after_cal=$(jq_get "$dash" consumed.calories)
[ "$after_cal" = "0" ] && pass "dashboard reverted to 0 kcal" || fail "after=$after_cal"

# 12. Unknown food_id rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/food-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"foodId":999999,"portionG":100,"mealType":"lunch"}')
[ "$code" = "404" ] && pass "POST unknown food_id → 404" || fail "got $code"

# 13. Free-form (no foodId) accepts macros
free=$(curl -s -X POST "$BASE/api/food-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"foodName":"homemade smoothie","portionG":300,"calories":220,"proteinG":12,"carbsG":28,"fatG":8}')
free_id=$(jq_get "$free" id)
[ -n "$free_id" ] && pass "free-form log created id=$free_id" || fail "free-form: $free"
curl -s -X DELETE "$BASE/api/food-logs/$free_id" -b "$JAR" > /dev/null

# 14. Unauthenticated is 401.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/food-logs")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 15. /log page renders for authenticated user
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/log" -b "$JAR")
[ "$code" = "200" ] && pass "/log renders 200" || fail "/log was $code"

echo
echo "✅ Phase 4 integration test passed."
