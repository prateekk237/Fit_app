#!/usr/bin/env bash
# Phase 3 end-to-end dashboard test. Requires `pnpm dev` running.
# Usage: ./scripts/phase3-integration-test.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const keys=process.argv[1].split('.');let v=o;for(const k of keys){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':JSON.stringify(v))}catch(e){console.log('')}})" "$2"; }

echo "Phase 3 dashboard test against $BASE"

# 1. Login (from a fresh IP so rate limiter isn't triggered by reuse).
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 10.0.0.101' \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login was $code"

# 2. Dashboard without any data (reset by running SQL below).
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM water_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM workout_logs WHERE log_date = CURRENT_DATE;" >/dev/null

dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
cals=$(jq_get "$dash" "consumed.calories")
proteinG=$(jq_get "$dash" "consumed.proteinG")
water=$(jq_get "$dash" "water.consumedMl")
target_cals=$(jq_get "$dash" "targets.calories")
streak=$(jq_get "$dash" "streakDays")
workout_day=$(jq_get "$dash" "todayWorkout.dayNumber")
[ "$cals" = "0" ] && pass "empty state: 0 kcal consumed" || fail "cals=$cals"
[ "$water" = "0" ] && pass "empty state: 0 ml water" || fail "water=$water"
[ "$target_cals" = "1900" ] && pass "target 1900 kcal" || fail "target=$target_cals"
[ "$streak" = "0" ] && pass "empty state: streak 0" || fail "streak=$streak"
[ "$workout_day" != "" ] && pass "todayWorkout populated (day $workout_day)" || fail "no workout"

# 3. Insert food logs directly via DB (log endpoints are Phase 4).
uid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT id FROM users LIMIT 1")
[ -n "$uid" ] && pass "user id resolved" || fail "no user"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q <<SQL >/dev/null
INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, fiber_g, source, meal_type)
SELECT '$uid'::uuid, CURRENT_DATE, id, name, 150, 150*calories_per_100g/100, 150*protein_g/100, 150*carbs_g/100, 150*fat_g/100, 150*COALESCE(fiber_g,0)/100, 'manual','lunch'
FROM foods WHERE name='paneer low-fat';

INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, fiber_g, source, meal_type)
SELECT '$uid'::uuid, CURRENT_DATE, id, name, 150, 150*calories_per_100g/100, 150*protein_g/100, 150*carbs_g/100, 150*fat_g/100, 150*COALESCE(fiber_g,0)/100, 'manual','dinner'
FROM foods WHERE name='rajma cooked';

INSERT INTO water_logs (user_id, log_date, amount_ml) VALUES ('$uid'::uuid, CURRENT_DATE, 500), ('$uid'::uuid, CURRENT_DATE, 750);
SQL

dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
cals=$(jq_get "$dash" "consumed.calories")
proteinG=$(jq_get "$dash" "consumed.proteinG")
water=$(jq_get "$dash" "water.consumedMl")
items=$(jq_get "$dash" "consumed.itemsLogged")
[ "$items" = "2" ] && pass "populated: 2 items logged" || fail "items=$items"
# paneer low-fat (160/22/4/6 per 100g) × 150g = 240/33/6/9 + rajma (127/8.7/22.8/0.5) × 150g = 190.5/13.05/34.2/0.75
# total ≈ 430.5 cal, 46.05g P
cal_int="${cals%.*}"
[ "$cal_int" -gt 400 ] && [ "$cal_int" -lt 450 ] && pass "calories ≈ 430 ($cals)" || fail "cals=$cals"
protein_int="${proteinG%.*}"
[ "$protein_int" -ge 45 ] && [ "$protein_int" -le 47 ] && pass "protein ≈ 46g ($proteinG)" || fail "protein=$proteinG"
[ "$water" = "1250" ] && pass "water 1250 ml" || fail "water=$water"

streak=$(jq_get "$dash" "streakDays")
[ "$streak" = "1" ] && pass "streak 1 (first log today)" || fail "streak=$streak"

# 4. Complete a workout.
wid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT id FROM workouts ORDER BY day_number LIMIT 1")
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "INSERT INTO workout_logs (user_id, workout_id, started_at, completed_at, log_date, exercises_completed_json, duration_min, rpe_overall)
   VALUES ('$uid'::uuid, $wid, NOW()-INTERVAL '45 min', NOW(), CURRENT_DATE, '[]'::jsonb, 45, 7)" >/dev/null
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
completed=$(jq_get "$dash" "todayWorkout.completedToday")
[ "$completed" = "true" ] && pass "todayWorkout.completedToday = true" || fail "completed=$completed"

# 5. Add a weight log → verify trend.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM weight_logs WHERE log_date IN (CURRENT_DATE, CURRENT_DATE-1);
   INSERT INTO weight_logs (user_id, log_date, weight_kg) VALUES
     ('$uid'::uuid, CURRENT_DATE - 1, 92.0),
     ('$uid'::uuid, CURRENT_DATE, 91.5);" >/dev/null
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
current=$(jq_get "$dash" "weight.currentKg")
spark_len=$(echo "$dash" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).weight.sparkline.length))")
[ "$current" = "91.5" ] && pass "weight.currentKg = 91.5 from latest log" || fail "current=$current"
[ "$spark_len" = "2" ] && pass "sparkline has 2 points" || fail "sparkline=$spark_len"

# 6. HTML root returns 200 with Hi in body (client-side render so we just confirm 200).
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" -b "$JAR")
[ "$code" = "200" ] && pass "GET / authenticated → 200" || fail "/ was $code"

# 7. Cleanup test data.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE user_id='$uid'::uuid;
   DELETE FROM water_logs WHERE user_id='$uid'::uuid;
   DELETE FROM weight_logs WHERE user_id='$uid'::uuid;
   DELETE FROM workout_logs WHERE user_id='$uid'::uuid;" >/dev/null
pass "cleanup done"

echo
echo "✅ Phase 3 integration test passed."
