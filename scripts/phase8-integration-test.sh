#!/usr/bin/env bash
# Phase 8 workouts-with-tracker test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 8 workouts test against $BASE"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM workout_logs WHERE log_date = CURRENT_DATE" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Unauthenticated access
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/workouts")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. /api/workouts lists all 7 days with today flagged.
list=$(curl -s "$BASE/api/workouts" -b "$JAR")
count=$(echo "$list" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).workouts.length))")
today=$(jq_get "$list" today)
[ "$count" = "7" ] && pass "list returns 7 workouts" || fail "got $count"
[ "$today" -ge 1 ] && [ "$today" -le 7 ] && pass "today=$today" || fail "today=$today"

# 3. /api/workouts/today returns today's workout.
t=$(curl -s "$BASE/api/workouts/today" -b "$JAR")
t_day=$(jq_get "$t" dayOfWeek)
t_id=$(jq_get "$t" workout.id)
[ "$t_day" = "$today" ] && pass "today endpoint matches list today" || fail "$t_day vs $today"
[ -n "$t_id" ] && pass "today workout id=$t_id" || fail "no workout id"

# 4. /api/workouts/[id] returns joined exercises.
push_id=$(echo "$list" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).workouts;const p=r.find(w=>w.category==='push');console.log(p?p.id:'')})")
[ -n "$push_id" ] && pass "push workout id=$push_id" || fail "no push"
detail=$(curl -s "$BASE/api/workouts/$push_id" -b "$JAR")
ex_count=$(echo "$detail" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).exercises.length))")
[ "$ex_count" -ge 3 ] && pass "push workout has $ex_count exercises" || fail "ex_count=$ex_count"

has_meta=$(echo "$detail" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const e=JSON.parse(d).exercises;const ok=e.every(x=>x.exercise && x.exercise.instructions);console.log(ok)})")
[ "$has_meta" = "true" ] && pass "every exercise has instructions joined" || fail "missing instructions"

# 5. Post a workout_log with reps/weights/RPE.
started=$(date -u -d '45 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)
completed=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
body=$(cat <<JSON
{
  "workoutId": $push_id,
  "startedAt": "$started",
  "completedAt": "$completed",
  "durationMin": 45,
  "rpeOverall": 7,
  "exercises": [
    { "slug": "push-up-incline", "sets": [
        { "reps": 12, "weightKg": 0, "completed": true },
        { "reps": 11, "weightKg": 0, "completed": true },
        { "reps": 10, "weightKg": 0, "completed": true },
        { "reps": 9, "weightKg": 0, "completed": true }
      ]
    },
    { "slug": "db-bench-press", "sets": [
        { "reps": 10, "weightKg": 10, "completed": true },
        { "reps": 10, "weightKg": 10, "completed": true },
        { "reps": 8, "weightKg": 10, "completed": true }
      ]
    }
  ]
}
JSON
)
log=$(curl -s -X POST "$BASE/api/workout-logs" -b "$JAR" \
  -H 'Content-Type: application/json' -d "$body")
log_id=$(jq_get "$log" id)
[ -n "$log_id" ] && pass "workout_log created id=$log_id" || fail "log: $log"

# 6. DB row reflects values.
row=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT workout_id||':'||duration_min||':'||rpe_overall||':'||jsonb_array_length(exercises_completed_json) FROM workout_logs WHERE id='$log_id'")
[ "$row" = "$push_id:45:7:2" ] && pass "DB row = $row" || fail "got $row"

# 7. list endpoint now marks push as completedToday.
list=$(curl -s "$BASE/api/workouts" -b "$JAR")
push_done=$(echo "$list" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).workouts;const p=r.find(w=>w.id===$push_id);console.log(p.completedToday)})")
[ "$push_done" = "true" ] && pass "list shows push.completedToday=true" || fail "got $push_done"

# 8. Dashboard todayWorkout reflects completion (if push is today's).
dash=$(curl -s "$BASE/api/dashboard/today" -b "$JAR")
dash_day=$(jq_get "$dash" dayOfWeek)
if [ "$dash_day" = "$today" ]; then
  dash_done=$(jq_get "$dash" todayWorkout.completedToday)
  echo "    dashboard todayWorkout.completedToday=$dash_done (today=$today, push_day=?)"
fi
pass "dashboard query ok"

# 9. Validation: rpe 11 rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/workout-logs" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"startedAt\":\"$started\",\"rpeOverall\":11,\"exercises\":[]}")
[ "$code" = "400" ] && pass "rpe=11 → 400" || fail "got $code"

# 10. Unknown workout id → 404.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/workouts/99999" -b "$JAR")
[ "$code" = "404" ] && pass "unknown workout id → 404" || fail "got $code"

# 11. GET /api/workout-logs returns history.
hist=$(curl -s "$BASE/api/workout-logs" -b "$JAR")
hist_count=$(echo "$hist" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).logs.length))")
[ "$hist_count" -ge 1 ] && pass "workout-logs history returns $hist_count entries" || fail "history=$hist_count"

# 12. Page rendering.
for path in /workout "/workout/$push_id"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path" -b "$JAR")
  [ "$code" = "200" ] && pass "$path → 200" || fail "$path = $code"
done

# Cleanup.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM workout_logs WHERE log_date = CURRENT_DATE" >/dev/null

echo
echo "✅ Phase 8 integration test passed."
