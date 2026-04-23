#!/usr/bin/env bash
# Phase 9 exercise library test.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
jq_get() { echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);const ks=process.argv[1].split('.');let v=o;for(const k of ks){v=v==null?null:v[k]}console.log(v===null||v===undefined?'':Array.isArray(v)||typeof v==='object'?JSON.stringify(v):String(v))}catch{console.log('')}})" "$2"; }

echo "Phase 9 exercise library test against $BASE"

IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login 200" || fail "login=$code"

# 1. Unauthorized
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/exercises")
[ "$code" = "401" ] && pass "no cookie → 401" || fail "got $code"

# 2. Full list returns all 50 exercises with facets.
all=$(curl -s "$BASE/api/exercises" -b "$JAR")
total=$(jq_get "$all" total)
[ "$total" = "50" ] && pass "list returns all 50" || fail "got $total"
cat_count=$(echo "$all" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).facets.categories.length))")
[ "$cat_count" -ge 5 ] && pass "facets.categories has $cat_count entries" || fail "cats=$cat_count"
muscle_count=$(echo "$all" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).facets.muscles.length))")
[ "$muscle_count" -ge 8 ] && pass "facets.muscles has $muscle_count entries" || fail "muscles=$muscle_count"

# 3. Search "push" finds all push-up variations.
push=$(curl -s "$BASE/api/exercises?q=push" -b "$JAR")
push_count=$(jq_get "$push" total)
push_up_variants=$(echo "$push" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).exercises;console.log(r.filter(e=>/push/i.test(e.name)).length)})")
[ "$push_up_variants" -ge 5 ] && pass "search 'push' → $push_up_variants push-related exercises" || fail "got $push_up_variants"

# 4. Muscle filter: chest alone returns ≥ 5 exercises.
chest_only=$(curl -s "$BASE/api/exercises?muscle=chest" -b "$JAR")
chest_total=$(jq_get "$chest_only" total)
[ "$chest_total" -ge 5 ] && pass "muscle=chest → $chest_total matches" || fail "got $chest_total"

# 4b. Combined AND filter (chest + dumbbell) still works and narrows the list.
combo=$(curl -s "$BASE/api/exercises?muscle=chest&equipment=dumbbell" -b "$JAR")
combo_total=$(jq_get "$combo" total)
[ "$combo_total" -ge 1 ] && [ "$combo_total" -lt "$chest_total" ] \
  && pass "chest + dumbbell narrows to $combo_total (< $chest_total chest-only)" \
  || fail "got combo=$combo_total chest=$chest_total"

# 5. Category filter.
push_cat=$(curl -s "$BASE/api/exercises?category=push" -b "$JAR")
push_cat_count=$(jq_get "$push_cat" total)
[ "$push_cat_count" -ge 10 ] && pass "category=push → $push_cat_count push exercises" || fail "got $push_cat_count"

# 6. Multi-category filter.
multi=$(curl -s "$BASE/api/exercises?category=push&category=pull" -b "$JAR")
multi_total=$(jq_get "$multi" total)
[ "$multi_total" -ge 20 ] && pass "category=push OR pull → $multi_total" || fail "got $multi_total"

# 7. Detail endpoint returns a known exercise.
det=$(curl -s "$BASE/api/exercises/db-bench-press" -b "$JAR")
name=$(jq_get "$det" exercise.name)
[ "$name" = "Dumbbell bench press" ] && pass "detail: db-bench-press resolved" || fail "got $name"

# Chest in muscle groups so BodyHighlighter can light it up.
has_chest=$(echo "$det" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d).exercise.muscleGroups;console.log(m.includes('chest'))})")
[ "$has_chest" = "true" ] && pass "db-bench-press muscle_groups includes chest" || fail "no chest"

related_count=$(echo "$det" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).related.length))")
[ "$related_count" -ge 1 ] && pass "related exercises: $related_count" || fail "related=$related_count"

# 8. Unknown slug → 404
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/exercises/does-not-exist" -b "$JAR")
[ "$code" = "404" ] && pass "unknown slug → 404" || fail "got $code"

# 9. Pages render.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/exercises" -b "$JAR")
[ "$code" = "200" ] && pass "/exercises → 200" || fail "got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/exercises/db-bench-press" -b "$JAR")
[ "$code" = "200" ] && pass "/exercises/db-bench-press → 200" || fail "got $code"

# 10. Difficulty filter.
beginner=$(curl -s "$BASE/api/exercises?difficulty=beginner" -b "$JAR")
beginner_count=$(jq_get "$beginner" total)
[ "$beginner_count" -ge 1 ] && pass "difficulty=beginner → $beginner_count" || fail "got $beginner_count"

echo
echo "✅ Phase 9 integration test passed."
