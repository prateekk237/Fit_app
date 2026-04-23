#!/usr/bin/env bash
# Phase 11 progress photos + adherence test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR" /tmp/fit-body.jpg /tmp/fit-face.jpg' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 11 progress + adherence test against $BASE"

PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days';
   DELETE FROM food_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';" >/dev/null

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# Craft sample body + face JPEGs.
node -e "
const sharp=require('sharp');
Promise.all([
  sharp({create:{width:300,height:400,channels:3,background:{r:220,g:160,b:140}}}).jpeg({quality:70}).toFile('/tmp/fit-body.jpg'),
  sharp({create:{width:300,height:300,channels:3,background:{r:250,g:200,b:180}}}).jpeg({quality:70}).toFile('/tmp/fit-face.jpg')
]).then(()=>console.log('ok'));
" > /dev/null
[ -s /tmp/fit-body.jpg ] && [ -s /tmp/fit-face.jpg ] && pass "sample JPEGs crafted" || fail "no samples"

# 1. Unauthorized
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/progress-photos")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. Empty state.
res=$(curl -s "$BASE/api/progress-photos" -b "$JAR")
count=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).photos.length))")
[ "$count" = "0" ] && pass "empty state: 0 photos" || fail "got $count"

# 3. Upload body for yesterday.
yesterday=$(date -u -d 'yesterday' +%Y-%m-%d)
today=$(date -u +%Y-%m-%d)
res=$(curl -s -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fit-body.jpg" -F "type=body" -F "date=$yesterday")
body_url=$(jq_get "$res" url)
echo "$body_url" | grep -q '^/api/photos/body-' && pass "body upload url=$body_url" || fail "url=$body_url"

# 4. Upload face for today.
res=$(curl -s -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fit-face.jpg" -F "type=face" -F "date=$today")
face_url=$(jq_get "$res" url)
echo "$face_url" | grep -q '^/api/photos/face-' && pass "face upload url=$face_url" || fail "url=$face_url"

# 5. GET returns both.
res=$(curl -s "$BASE/api/progress-photos" -b "$JAR")
total=$(echo "$res" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).photos.length))")
[ "$total" = "2" ] && pass "GET returns 2 photos" || fail "got $total"

# 6. Body photo served via /api/photos/:file (auth'd).
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$body_url" -b "$JAR")
[ "$code" = "200" ] && pass "serve body photo → 200" || fail "got $code"
# No cookie → 401 on the serve route
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$body_url")
[ "$code" = "401" ] && pass "serve photo no cookie → 401" || fail "got $code"

# 7. Path traversal rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/photos/..%2F..%2Fetc%2Fpasswd" -b "$JAR")
[ "$code" = "404" ] && pass "path traversal → 404" || fail "got $code"

# 8. Non-image rejected.
echo "not an image" > /tmp/fake.txt
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fake.txt;type=text/plain" -F "type=body")
[ "$code" = "415" ] && pass "non-image → 415" || fail "got $code"
rm -f /tmp/fake.txt

# 9. Bad type rejected.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fit-body.jpg" -F "type=wrong")
[ "$code" = "400" ] && pass "type=wrong → 400" || fail "got $code"

# 10. Upload replaces the photo for the same day+type.
curl -s -X POST "$BASE/api/progress-photos" -b "$JAR" \
  -F "image=@/tmp/fit-body.jpg" -F "type=body" -F "date=$yesterday" > /dev/null
count=$(curl -s "$BASE/api/progress-photos" -b "$JAR" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).photos.length))")
[ "$count" = "2" ] && pass "re-upload same day: still 2 weight_log rows" || fail "got $count"

# --- Adherence ---
# 11. Unauthorized
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/adherence?days=14")
[ "$code" = "401" ] && pass "adherence no cookie → 401" || fail "got $code"

# 12. Empty adherence: 14 days with zeros.
adh=$(curl -s "$BASE/api/adherence?days=14" -b "$JAR")
days=$(jq_get "$adh" days)
rows_len=$(echo "$adh" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).rows.length))")
[ "$days" = "14" ] && [ "$rows_len" = "14" ] && pass "adherence empty: 14 day rows" || fail "days=$days rows=$rows_len"

# 13. Insert some food logs across days to exercise adherence math.
uid=$(PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -tAc "SELECT id FROM users LIMIT 1")
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q <<SQL >/dev/null
INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, source)
SELECT '$uid'::uuid, CURRENT_DATE, id, name, 150, 150*calories_per_100g/100, 150*protein_g/100, 150*carbs_g/100, 150*fat_g/100, 'manual'
FROM foods WHERE name IN ('paneer low-fat','rajma cooked','brown rice cooked');
INSERT INTO food_logs (user_id, log_date, food_id, food_name, portion_g, calories, protein_g, carbs_g, fat_g, source)
SELECT '$uid'::uuid, CURRENT_DATE - INTERVAL '1 day', id, name, 100, calories_per_100g, protein_g, carbs_g, fat_g, 'manual'
FROM foods WHERE name = 'chicken breast grilled';
SQL

adh=$(curl -s "$BASE/api/adherence?days=14" -b "$JAR")
today_row=$(echo "$adh" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);const t=r.today;const row=r.rows.find(x=>x.date===t);console.log(JSON.stringify(row))})")
today_cal=$(echo "$today_row" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).calories))")
today_prot=$(echo "$today_row" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).proteinG))")
[ "$today_cal" -gt 0 ] && pass "today's adherence row calories=$today_cal" || fail "cal=$today_cal"
[ -n "$today_prot" ] && pass "today's protein logged=$today_prot" || fail "no protein"

logged_days=$(echo "$adh" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).rows;console.log(r.filter(x=>x.calories>0).length)})")
[ "$logged_days" = "2" ] && pass "2 days have food logs in window" || fail "got $logged_days"

# 14. Custom days param.
adh7=$(curl -s "$BASE/api/adherence?days=7" -b "$JAR")
rows7=$(echo "$adh7" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).rows.length))")
[ "$rows7" = "7" ] && pass "days=7 → 7 rows" || fail "got $rows7"
# 91 out of range → 400
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/adherence?days=91" -b "$JAR")
[ "$code" = "400" ] && pass "days=91 → 400" || fail "got $code"

# 15. Page renders.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/progress" -b "$JAR")
[ "$code" = "200" ] && pass "/progress → 200" || fail "got $code"

# Cleanup.
PGPASSWORD=fit psql -h 127.0.0.1 -U fit -d fit -q -c \
  "DELETE FROM food_logs WHERE log_date >= CURRENT_DATE - INTERVAL '14 days';
   DELETE FROM weight_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days';" >/dev/null

echo
echo "✅ Phase 11 integration test passed."
