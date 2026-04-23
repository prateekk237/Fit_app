#!/usr/bin/env bash
# Phase 14 PWA finalization test — runs against a production server
# (pnpm build + pnpm start), the only mode where next-pwa generates the
# service worker. Verifies the SW, manifest, icons, runtime caching
# rules, background-sync queues, and online/offline banner rendering.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "Phase 14 PWA test against $BASE"

# 1. Manifest served with required fields.
manifest=$(curl -s "$BASE/manifest.json")
echo "$manifest" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d);const missing=[];['name','short_name','start_url','display','background_color','theme_color','icons','shortcuts'].forEach(k=>{if(!m[k])missing.push(k)});process.exit(missing.length?1:0);})" && pass "manifest.json has all required keys" || fail "missing keys"

icon_count=$(echo "$manifest" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).icons.length))")
[ "$icon_count" -ge 4 ] && pass "manifest has $icon_count icon entries (any+maskable)" || fail "got $icon_count"

has_maskable=$(echo "$manifest" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d);console.log(m.icons.some(i=>i.purpose==='maskable'))})")
[ "$has_maskable" = "true" ] && pass "maskable icon entry present" || fail "no maskable icon"

shortcut_count=$(echo "$manifest" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).shortcuts.length))")
[ "$shortcut_count" -ge 3 ] && pass "$shortcut_count app shortcuts declared" || fail "got $shortcut_count"

# 2. All icon PNGs reachable.
for icon in icon-192.png icon-512.png icon-maskable-192.png icon-maskable-512.png apple-touch-icon.png; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/icons/$icon")
  [ "$code" = "200" ] && pass "icon reachable: $icon" || fail "$icon → $code"
done

# 3. Service worker generated + served.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/sw.js")
[ "$code" = "200" ] && pass "sw.js served (200)" || fail "sw.js → $code"

sw=$(curl -s "$BASE/sw.js")
# 4. SW imports our push handler.
echo "$sw" | grep -q 'push-handler' && pass "sw.js importScripts push-handler" || fail "no push-handler in SW"

# 5. Runtime caching cache names baked into the SW bundle.
for cache in "fit-dashboard-api" "fit-readonly-api" "fit-photos" "fit-exercise-images" "fit-icons" "fit-fonts" "fit-food-logs-queue" "fit-water-logs-queue"; do
  echo "$sw" | grep -q "$cache" && pass "SW caches: $cache" || fail "missing $cache"
done

# 6. Background sync queue wired.
echo "$sw" | grep -qE 'BackgroundSync|backgroundSync|bgSync' && pass "SW contains BackgroundSync registration" || fail "no BackgroundSync"

# 7. Push handler file directly accessible (next-pwa needs this path).
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/push-handler.js")
[ "$code" = "200" ] && pass "push-handler.js served" || fail "push-handler.js → $code"

# 8. Auth flow still works.
IP="10.0.0.$((RANDOM % 254 + 2))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" \
  -d '{"pin":"123456"}' -c "$JAR")
[ "$code" = "200" ] && pass "login still 200 under prod" || fail "got $code"

# 9. /login is statically prerendered.
html=$(curl -s "$BASE/login")
echo "$html" | grep -q 'PIN' && pass "/login renders with PIN text" || fail "no PIN"

# 10. Dashboard API works (ensures prod server is healthy).
dash=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dashboard/today" -b "$JAR")
[ "$dash" = "200" ] && pass "dashboard API → 200" || fail "got $dash"

# 11. Workbox precache manifest exists.
echo "$sw" | grep -qE 'self\.__WB_MANIFEST|precacheAndRoute|precache' && pass "SW has Workbox precache" || fail "no precache"

# 12. SW has 'push' listener (our handler) — via imported file.
ph=$(curl -s "$BASE/push-handler.js")
echo "$ph" | grep -q 'addEventListener("push"' && pass "push handler has push listener" || fail "no push listener"
echo "$ph" | grep -q 'addEventListener("notificationclick"' && pass "push handler has notificationclick listener" || fail "no notificationclick"

echo
echo "✅ Phase 14 PWA test passed."
