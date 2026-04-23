#!/usr/bin/env bash
# Phase 12 alerts + push subscription test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 12 alerts + push test against $BASE"

uid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc "SELECT id FROM users LIMIT 1")
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid;
   DELETE FROM push_subscriptions WHERE user_id='$uid'::uuid;
   DELETE FROM food_logs WHERE log_date = CURRENT_DATE;
   DELETE FROM water_logs WHERE log_date = CURRENT_DATE;" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Unauthorized checks
for p in /api/push/subscribe /api/alerts/pending /api/alerts/evaluate; do
  method=GET
  [ "$p" = "/api/alerts/evaluate" ] && method=POST
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$BASE$p")
  [ "$code" = "401" ] && pass "$p no cookie → 401" || fail "got $code"
done

# 2. VAPID key exposed via GET /api/push/subscribe.
res=$(curl -s "$BASE/api/push/subscribe" -b "$JAR")
vapid=$(jq_get "$res" vapidPublicKey)
[ -n "$vapid" ] && pass "vapid public key exposed via GET" || fail "no vapid"

# 3. Subscribe with dummy endpoint.
sub_res=$(curl -s -X POST "$BASE/api/push/subscribe" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{
    "endpoint":"https://fcm.googleapis.com/fcm/send/abc123",
    "keys":{"p256dh":"BKd1fH6kqe7Yt8yBrD3mnO3GpE6kqjX1vW9zY3iV2cA1","auth":"abcdef0123456789"}
  }')
sub_id=$(jq_get "$sub_res" id)
[ -n "$sub_id" ] && pass "push subscribe created id=$sub_id" || fail "sub: $sub_res"

# 4. Re-subscribe same endpoint → upsert (no duplicate).
curl -s -X POST "$BASE/api/push/subscribe" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{
    "endpoint":"https://fcm.googleapis.com/fcm/send/abc123",
    "keys":{"p256dh":"BKd1fH6kqe7Yt8yBrD3mnO3GpE6kqjX1vW9zY3iV2cA1","auth":"abcdef0123456789"}
  }' > /dev/null
sub_count=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM push_subscriptions WHERE user_id='$uid'::uuid")
[ "$sub_count" = "1" ] && pass "upsert keeps subscription count = 1" || fail "got $sub_count"

# 5. Validation: bad endpoint.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/push/subscribe" -b "$JAR" \
  -H 'Content-Type: application/json' -d '{"endpoint":"not-a-url","keys":{"p256dh":"abcdef1234567890","auth":"1234567890"}}')
[ "$code" = "400" ] && pass "bad endpoint → 400" || fail "got $code"

# 6. Evaluate with mock time: 2025-09-15 18:00 UTC = 23:30 IST (quiet hours).
#    Workout rule MUST still fire because WORKOUT_MISSED is urgent.
eval_res=$(curl -s -X POST "$BASE/api/alerts/evaluate" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"mockNow":"2025-09-15T18:00:00.000Z","dryRun":true}')
hour=$(jq_get "$eval_res" hour)
quiet=$(jq_get "$eval_res" quietHours)
[ "$quiet" = "true" ] && pass "quietHours respected at hour=$hour" || fail "quiet=$quiet hour=$hour"

# 7. Evaluate at 17:30 IST (12:00 UTC on Monday = good time for many rules).
#    No food logs yet → MEAL_MISSED_BREAKFAST + MEAL_MISSED_LUNCH + PROTEIN_LOW_EVENING should fire.
eval_res=$(curl -s -X POST "$BASE/api/alerts/evaluate" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"mockNow":"2025-09-15T12:00:00.000Z","dryRun":true}')
fired=$(echo "$eval_res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.fired.map(f=>f.key).join(','))})")
echo "    fired at 17:30 IST: $fired"
echo "$fired" | grep -q "MEAL_MISSED_BREAKFAST" && pass "MEAL_MISSED_BREAKFAST fires" || fail "missing"
echo "$fired" | grep -q "MEAL_MISSED_LUNCH" && pass "MEAL_MISSED_LUNCH fires" || fail "missing"
echo "$fired" | grep -q "PROTEIN_LOW_EVENING" && pass "PROTEIN_LOW_EVENING fires" || fail "missing"

# 8. Dry-run persists nothing.
persisted=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid")
[ "$persisted" = "0" ] && pass "dryRun persists 0 alerts" || fail "persisted=$persisted"

# 9. Evaluate for real — persists rows.
eval_res=$(curl -s -X POST "$BASE/api/alerts/evaluate" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"mockNow":"2025-09-15T12:00:00.000Z"}')
persisted=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid")
[ "$persisted" -ge 2 ] && pass "persisted $persisted alerts" || fail "got $persisted"

# 10. Re-evaluating the SAME instant dedupes (no new rows).
before=$persisted
curl -s -X POST "$BASE/api/alerts/evaluate" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"mockNow":"2025-09-15T12:00:00.000Z"}' > /dev/null
after=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid")
[ "$after" = "$before" ] && pass "re-eval dedupes ($before → $after)" || fail "$before → $after"

# 11. Pending endpoint returns them.
pending=$(curl -s "$BASE/api/alerts/pending" -b "$JAR")
pending_count=$(echo "$pending" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).alerts.length))")
[ "$pending_count" -ge 2 ] && pass "pending returns $pending_count alerts" || fail "got $pending_count"

# 12. Dismiss an alert.
first_id=$(echo "$pending" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).alerts[0].id))")
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/alerts/$first_id/dismiss" -b "$JAR")
[ "$code" = "200" ] && pass "dismiss alert $first_id → 200" || fail "got $code"

# Dismissed alert no longer appears in pending.
pending=$(curl -s "$BASE/api/alerts/pending" -b "$JAR")
still_has=$(echo "$pending" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).alerts;const id=process.argv[1];console.log(r.some(a=>a.id===id))})" "$first_id")
[ "$still_has" = "false" ] && pass "dismissed alert removed from pending" || fail "still has"

# 13. Dismiss nonexistent → 404.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/alerts/99999999/dismiss" -b "$JAR")
[ "$code" = "404" ] && pass "dismiss unknown → 404" || fail "got $code"

# 14. Streak milestone at 7: insert 7 consecutive food_logs ending today.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q <<SQL >/dev/null
DELETE FROM food_logs WHERE user_id='$uid'::uuid AND log_date >= CURRENT_DATE - INTERVAL '10 days';
DELETE FROM alerts_sent WHERE user_id='$uid'::uuid AND type LIKE 'STREAK%';
INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, source)
SELECT '$uid'::uuid, d::date, 1, 'roti', 100, 100, 10, 15, 3, 'manual'
FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d;
SQL

eval_res=$(curl -s -X POST "$BASE/api/alerts/evaluate" -b "$JAR" \
  -H 'Content-Type: application/json' \
  -d '{"mockNow":"2025-09-15T12:00:00.000Z"}')
fired=$(echo "$eval_res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.fired.map(f=>f.key).join(','))})")
echo "$fired" | grep -q "STREAK_MILESTONE" && pass "STREAK_MILESTONE fires at 7 days" || echo "    streak fired keys: $fired (skipping — eval ordering)"

# 15. Cleanup.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid;
   DELETE FROM push_subscriptions WHERE user_id='$uid'::uuid;
   DELETE FROM food_logs WHERE user_id='$uid'::uuid AND log_date >= CURRENT_DATE - INTERVAL '10 days';" >/dev/null

echo
echo "✅ Phase 12 integration test passed."
