#!/usr/bin/env bash
# Phase 10 water + weight tracking test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 10 water/weight test against $BASE"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM water_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Unauthorized access
for p in /api/water-logs /api/weight-logs; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  [ "$code" = "401" ] && pass "$p no cookie → 401" || fail "got $code"
done

# --- Water ---
# 2. Empty state.
res=$(curl -s "$BASE/api/water-logs" -b "$JAR")
total=$(jq_get "$res" totalMl)
[ "$total" = "0" ] && pass "water empty state: 0 ml" || fail "got $total"
target=$(jq_get "$res" targetMl)
[ "$target" = "3750" ] && pass "water target 3750 ml" || fail "got $target"

# 3. Add 3 droplets of 250 ml each → 750 ml total.
id1=$(curl -s -X POST "$BASE/api/water-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"amountMl":250}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")
curl -s -X POST "$BASE/api/water-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"amountMl":250}' > /dev/null
id3=$(curl -s -X POST "$BASE/api/water-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"amountMl":250}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")

res=$(curl -s "$BASE/api/water-logs" -b "$JAR")
total=$(jq_get "$res" totalMl)
[ "$total" = "750" ] && pass "water after 3×250ml = 750 ml" || fail "got $total"
log_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logs.length))")
[ "$log_count" = "3" ] && pass "water logs count = 3" || fail "count=$log_count"

# 4. Dashboard reflects water.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
dash_water=$(jq_get "$dash" water.consumedMl)
[ "$dash_water" = "750" ] && pass "dashboard water.consumedMl = 750" || fail "got $dash_water"

# 5. Delete the latest (undo last) → 500 ml.
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/water-logs/$id3" -b "$JAR")
[ "$code" = "200" ] && pass "DELETE latest droplet → 200" || fail "got $code"
total=$(curl -s "$BASE/api/water-logs" -b "$JAR" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).totalMl))")
[ "$total" = "500" ] && pass "water after undo = 500 ml" || fail "got $total"

# 6. Validation: amountMl ≤ 0 rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/water-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"amountMl":0}')
[ "$code" = "400" ] && pass "amountMl=0 → 400" || fail "got $code"

# 7. DELETE nonexistent → 404.
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/water-logs/9999999999" -b "$JAR")
[ "$code" = "404" ] && pass "delete nonexistent water → 404" || fail "got $code"

# --- Weight ---
# 8. POST a weight log.
today=$(date -u +%Y-%m-%d)
yesterday=$(date -u -d 'yesterday' +%Y-%m-%d)

res=$(curl -s -X POST "$BASE/api/weight-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"weightKg\":91.8,\"waistCm\":102,\"chestCm\":108,\"notes\":\"first log\",\"logDate\":\"$yesterday\"}")
w1=$(jq_get "$res" weightKg)
[ "$w1" = "91.8" ] && pass "weight log created (91.8 kg)" || fail "got $w1"

# 9. POST a second log for today.
res=$(curl -s -X POST "$BASE/api/weight-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"weightKg\":91.5,\"waistCm\":101.5,\"chestCm\":107.5,\"logDate\":\"$today\"}")
w2=$(jq_get "$res" weightKg)
[ "$w2" = "91.5" ] && pass "weight log today (91.5 kg)" || fail "got $w2"

# 10. User.currentWeightKg updated to 91.5.
user_w=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT current_weight_kg FROM users LIMIT 1")
[ "$user_w" = "91.50" ] && pass "user.currentWeightKg synced to 91.5" || fail "got $user_w"

# 11. GET all logs returns 2 rows sorted asc.
res=$(curl -s "$BASE/api/weight-logs" -b "$JAR")
count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logs.length))")
[ "$count" = "2" ] && pass "weight-logs returns 2" || fail "got $count"
target=$(jq_get "$res" targetKg)
[ "$target" = "80" ] && pass "targetKg = 80 from profile" || fail "got $target"

# 12. Upsert same day.
curl -s -X POST "$BASE/api/weight-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"weightKg\":91.3,\"logDate\":\"$today\"}" > /dev/null
count=$(curl -s "$BASE/api/weight-logs" -b "$JAR" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logs.length))")
[ "$count" = "2" ] && pass "same-day upsert keeps count at 2" || fail "got $count"

# 13. Validation: weightKg 10 rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/weight-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"weightKg":10}')
[ "$code" = "400" ] && pass "weightKg=10 → 400 validation" || fail "got $code"

# 14. Dashboard weight.currentKg = 91.3.
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
current=$(jq_get "$dash" weight.currentKg)
[ "$current" = "91.3" ] && pass "dashboard weight.currentKg = 91.3" || fail "got $current"

# 15. Pages render.
for p in /water /weight; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p" -b "$JAR")
  [ "$code" = "200" ] && pass "$p → 200" || fail "got $code"
done

# Cleanup
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM water_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   UPDATE users SET current_weight_kg = 92 WHERE email='prateek@fit.local';" >/dev/null

echo
echo "✅ Phase 10 integration test passed."
