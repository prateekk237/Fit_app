#!/usr/bin/env bash
# Phase 7 meal-plan screen test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 7 meal-plan test against $BASE"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. 401 without cookie
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/meals/plan?day=1")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. Swipe Mon → Sun: different meals each day.
prev=""
seen_days=0
for d in 1 2 3 4 5 6 7; do
  plan=$(curl -s "$BASE/api/meals/plan?day=$d" -b "$JAR")
  day=$(jq_get "$plan" dayOfWeek)
  meals_count=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).meals.length))")
  [ "$day" = "$d" ] && [ "$meals_count" -gt 0 ] || fail "day=$d meals=$meals_count"
  # Compare meal names across days to ensure they differ.
  names=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;console.log(r.map(m=>m.name).sort().join('|'))})")
  [ "$names" != "$prev" ] && seen_days=$((seen_days+1))
  prev="$names"
done
[ "$seen_days" -ge 7 ] && pass "all 7 days show distinct meals" || fail "only $seen_days distinct"

# 3. Veg filter excludes non-veg meals.
plan=$(curl -s "$BASE/api/meals/plan?day=1&veg=true" -b "$JAR")
nonveg_hits=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;console.log(r.filter(m=>!m.isVegOption).length)})")
[ "$nonveg_hits" = "0" ] && pass "veg=true hides non-veg meals" || fail "leaked $nonveg_hits"

# 4. Non-veg filter only shows non-veg.
plan=$(curl -s "$BASE/api/meals/plan?day=1&veg=false" -b "$JAR")
veg_hits=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;console.log(r.filter(m=>m.isVegOption).length)})")
[ "$veg_hits" = "0" ] && pass "veg=false hides veg meals" || fail "leaked $veg_hits"

# 5. Resolved foods: every meal has per-food macros (not all zero).
plan=$(curl -s "$BASE/api/meals/plan?day=1&veg=true" -b "$JAR")
has_macros=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;const any=r.every(m=>m.totals.calories>0);console.log(any)})")
[ "$has_macros" = "true" ] && pass "every meal has non-zero computed macros" || fail "some meals have 0 macros"

# 6. Pick a specific meal: Monday veg breakfast ("Oats + milk + almonds") and log it.
meal_id=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;const hit=r.find(m=>m.mealType==='breakfast');console.log(hit?hit.id:'')})")
[ -n "$meal_id" ] && pass "resolved Monday veg breakfast id=$meal_id" || fail "no breakfast"

expected_cal=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;const hit=r.find(m=>m.mealType==='breakfast');console.log(hit.totals.calories)})")
expected_count=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).meals;const hit=r.find(m=>m.mealType==='breakfast');console.log(hit.foods.filter(f=>!f.missing).length)})")

log_res=$(curl -s -X POST "$BASE/api/meals/$meal_id/log" -b "$JAR")
log_ids_len=$(echo "$log_res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logIds.length))")
unresolved=$(echo "$log_res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).unresolved.length))")
[ "$log_ids_len" = "$expected_count" ] && pass "logged $log_ids_len rows (= resolvable foods)" || fail "logged $log_ids_len, expected $expected_count"
[ "$unresolved" = "0" ] && pass "no unresolved foods" || fail "unresolved=$unresolved"

# 7. Transactional integrity: food_logs source=meal_plan exists for each log_id.
plan_rows=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM food_logs WHERE source='meal_plan' AND log_date=CURRENT_DATE")
[ "$plan_rows" = "$expected_count" ] && pass "DB has $plan_rows rows with source=meal_plan" || fail "got $plan_rows"

# 8. Dashboard reflects the logged meal.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
dash_items=$(jq_get "$dash" consumed.itemsLogged)
dash_cal_int=$(jq_get "$dash" consumed.calories | cut -d. -f1)
[ "$dash_items" = "$expected_count" ] && pass "dashboard itemsLogged=$dash_items" || fail "items=$dash_items"
tol=$((expected_cal / 50 + 5))
cal_diff=$(( dash_cal_int - expected_cal ))
cal_diff=${cal_diff#-}
[ "$cal_diff" -lt "$tol" ] && pass "dashboard calories ≈ expected ($dash_cal_int vs $expected_cal)" || fail "dash_cal=$dash_cal_int expected~$expected_cal"

# 9. Logging the same meal again inserts fresh rows (no dedupe at API level).
log_res2=$(curl -s -X POST "$BASE/api/meals/$meal_id/log" -b "$JAR")
logs2=$(echo "$log_res2" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logIds.length))")
[ "$logs2" = "$expected_count" ] && pass "second log returns $logs2 more rows" || fail "got $logs2"

# 10. Invalid id.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/meals/999999/log" -b "$JAR")
[ "$code" = "404" ] && pass "unknown meal id → 404" || fail "got $code"

# 11. /meals page renders.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/meals" -b "$JAR")
[ "$code" = "200" ] && pass "/meals renders 200" || fail "got $code"

# 12. Veg filter day=1 returns 6 rows per the Phase 1 spec.
plan=$(curl -s "$BASE/api/meals/plan?day=1&veg=true" -b "$JAR")
veg_day1=$(echo "$plan" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).meals.length))")
[ "$veg_day1" = "6" ] && pass "Day 1 veg = 6 meals (matches spec)" || fail "got $veg_day1"

# Cleanup
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE" >/dev/null

echo
echo "✅ Phase 7 integration test passed."
