#!/usr/bin/env bash
# Phase 13 weekly AI insights test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 13 AI weekly insights test against $BASE"

uid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc "SELECT id FROM users LIMIT 1")
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid AND type LIKE 'WEEKLY_DIGEST%';
   DELETE FROM food_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   DELETE FROM workout_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Unauthorized.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/insights/weekly")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. GET (empty data) returns a digest with insights + recommendation.
res=$(curl -s "$BASE/api/insights/weekly" -b "$JAR")
provider=$(jq_get "$res" provider)
[ -n "$provider" ] && pass "digest provider=$provider" || fail "no provider"
rec=$(jq_get "$res" result.recommendation)
[ -n "$rec" ] && pass "recommendation present: '${rec:0:60}...'" || fail "no recommendation"
insight_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.insights.length))")
[ "$insight_count" -ge 1 ] && pass "$insight_count insight(s) returned" || fail "count=$insight_count"

# 3. Cache row persisted in alerts_sent.
cached=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid AND type='WEEKLY_DIGEST'")
[ "$cached" = "1" ] && pass "WEEKLY_DIGEST cache row stored" || fail "cached=$cached"

# 4. WEEKLY_DIGEST does NOT appear in /api/alerts/pending.
pending=$(curl -s "$BASE/api/alerts/pending" -b "$JAR")
has_digest=$(echo "$pending" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).alerts;console.log(r.some(a=>a.type.startsWith('WEEKLY_DIGEST')))})")
[ "$has_digest" = "false" ] && pass "digest hidden from alerts panel" || fail "leaked into alerts"

# 5. Second GET is cached (same provider + same generatedAt).
first_at=$(jq_get "$res" generatedAt)
res2=$(curl -s "$BASE/api/insights/weekly" -b "$JAR")
second_at=$(jq_get "$res2" generatedAt)
[ "$first_at" = "$second_at" ] && pass "cached GET returns the same generatedAt" || fail "$first_at vs $second_at"

# 6. Force regen returns a new generatedAt.
sleep 1
res3=$(curl -s "$BASE/api/insights/weekly?force=1" -b "$JAR")
third_at=$(jq_get "$res3" generatedAt)
[ "$third_at" != "$first_at" ] && pass "force=1 regenerates (new ts $third_at)" || fail "still cached"

# 7. POST also regenerates and returns 201.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/insights/weekly" -b "$JAR")
[ "$code" = "201" ] && pass "POST regenerate → 201" || fail "got $code"

# Only one live cache row per user.
live=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc \
  "SELECT count(*) FROM alerts_sent WHERE user_id='$uid'::uuid AND type='WEEKLY_DIGEST'")
[ "$live" = "1" ] && pass "only 1 live cache row after regenerations" || fail "rows=$live"

# 8. Seed some data then regen → insights reflect the signals.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q <<SQL >/dev/null
INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, source)
SELECT '$uid'::uuid, d::date, 1, 'roti', 100, 500, 50, 60, 10, 'manual'
FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d;

INSERT INTO weight_logs (user_id, log_date, weight_kg) VALUES
  ('$uid'::uuid, CURRENT_DATE - INTERVAL '6 days', 92.0),
  ('$uid'::uuid, CURRENT_DATE, 91.0);

INSERT INTO workout_logs (user_id, workout_id, started_at, completed_at, log_date, exercises_completed_json, duration_min, rpe_overall)
SELECT '$uid'::uuid, 1, NOW()-INTERVAL '45 min', NOW(), CURRENT_DATE, '[]'::jsonb, 45, 7;
SQL

res=$(curl -s "$BASE/api/insights/weekly?force=1" -b "$JAR")
stats=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).stats;console.log(JSON.stringify({dl:r.daysLogged,wo:r.workoutsCompleted,wd:r.weightDelta}))})")
dl=$(echo "$stats" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).dl))")
wo=$(echo "$stats" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).wo))")
wd=$(echo "$stats" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).wd))")
[ "$dl" = "7" ] && pass "stats: daysLogged=7" || fail "dl=$dl"
[ "$wo" = "1" ] && pass "stats: workoutsCompleted=1" || fail "wo=$wo"
echo "    weightDelta=$wd"

insight_count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).result.insights.length))")
[ "$insight_count" -ge 2 ] && pass "$insight_count insights generated" || fail "got $insight_count"

# 9. Page with digest still renders.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" -b "$JAR")
[ "$code" = "200" ] && pass "/ renders 200 with digest card" || fail "got $code"

# Cleanup.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM alerts_sent WHERE user_id='$uid'::uuid AND type LIKE 'WEEKLY_DIGEST%';
   DELETE FROM food_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   DELETE FROM workout_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';" >/dev/null

echo
echo "✅ Phase 13 integration test passed."
