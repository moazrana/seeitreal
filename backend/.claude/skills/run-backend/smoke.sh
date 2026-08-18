#!/usr/bin/env bash
# Driver for the AR Menu SaaS backend (NestJS API). Brings up MySQL, builds
# the workspace, launches the API, and drives a real request flow through
# curl. Verified end-to-end from a cold `docker compose down` state.
#
# Usage:
#   .claude/skills/run-backend/smoke.sh            # full build + launch + smoke test
#   .claude/skills/run-backend/smoke.sh --no-build  # skip install/build, just launch + test
#   .claude/skills/run-backend/smoke.sh --stop      # tear down the server + MySQL container
#
# Run from anywhere; the script locates backend/ from its own path.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
PORT="${PORT:-4001}"
PID_FILE="/tmp/ar-menu-backend.pid"
LOG_FILE="/tmp/ar-menu-backend.log"

if [[ "${1:-}" == "--stop" ]]; then
  echo "Stopping backend (port $PORT) and MySQL container..."
  lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 || true
  rm -f "$PID_FILE"
  (cd "$REPO_ROOT" && docker compose down)
  echo "Stopped."
  exit 0
fi

echo "== 1/6: MySQL (docker compose) =="
cd "$REPO_ROOT"
docker compose up -d
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' ar-project-mysql-1 2>/dev/null || echo "")
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
if [[ "$status" != "healthy" ]]; then
  echo "MySQL did not become healthy in time" >&2
  exit 1
fi
echo "MySQL healthy."

if [[ "${1:-}" != "--no-build" ]]; then
  echo "== 2/6: npm install (root, no-audit for speed) =="
  npm install --no-audit --no-fund --prefer-offline

  echo "== 3/6: backend/.env =="
  cd "$BACKEND_DIR"
  if [[ ! -f .env ]]; then
    cp .env.example .env
    sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '\n')|" .env
    sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')|" .env
    sed -i "s|^IP_HASH_SALT=.*|IP_HASH_SALT=$(openssl rand -hex 32)|" .env
    echo ".env created with generated secrets."
  else
    echo ".env already present, leaving as-is."
  fi

  echo "== 4/6: Prisma migrate (idempotent) =="
  npx prisma migrate deploy

  echo "== 5/6: Build (shared, then backend) =="
  (cd "$REPO_ROOT" && npm run build -w shared)
  npx nest build
else
  cd "$BACKEND_DIR"
fi

echo "== 6/6: launch + smoke test =="
lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 || true
PORT="$PORT" node dist/main.js > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

ready=0
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Server did not become ready. Last 40 log lines:" >&2
  tail -40 "$LOG_FILE" >&2
  exit 1
fi

BASE="http://localhost:$PORT/api"
EMAIL="smoke-$(date +%s)@example.com"
PASS="CorrectHorse123"

echo "-- health --"
curl -sf "$BASE/health"; echo

echo "-- signup --"
SIGNUP=$(curl -sf -X POST "$BASE/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$SIGNUP" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
[[ -n "$TOKEN" ]] || { echo "signup did not return a token" >&2; exit 1; }
echo "signup OK, got access token"

echo "-- create restaurant --"
SLUG="smoke-$(date +%s)"
RESTAURANT=$(curl -sf -X POST "$BASE/restaurants" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"name\":\"Smoke Diner\",\"slug\":\"$SLUG\"}")
RID=$(echo "$RESTAURANT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")
[[ -n "$RID" ]] || { echo "restaurant creation failed: $RESTAURANT" >&2; exit 1; }
echo "restaurant OK, id=$RID"

echo "-- add menu item --"
ITEM_CODE=$(curl -sf -o /tmp/item.json -w '%{http_code}' -X POST "$BASE/restaurants/$RID/items" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Burger","price":8.5}')
[[ "$ITEM_CODE" == "201" ]] || { echo "item creation failed, http $ITEM_CODE: $(cat /tmp/item.json)" >&2; exit 1; }
ITEM_ID=$(node -e "process.stdout.write(String(require('/tmp/item.json').id))")
echo "item OK, id=$ITEM_ID"

echo "-- security: no token => 401 --"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/restaurants")
[[ "$CODE" == "401" ]] || { echo "expected 401, got $CODE" >&2; exit 1; }
echo "401 OK"

echo "-- security: cross-tenant access => 404 --"
EMAIL2="smoke-intruder-$(date +%s)@example.com"
SIGNUP2=$(curl -sf -X POST "$BASE/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL2\",\"password\":\"$PASS\"}")
TOKEN2=$(echo "$SIGNUP2" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/restaurants/$RID" -H "Authorization: Bearer $TOKEN2")
[[ "$CODE" == "404" ]] || { echo "expected 404, got $CODE" >&2; exit 1; }
echo "404 OK"

echo "-- upload: real image round trip (§7.5) --"
node -e "
require('sharp')({ create: { width: 120, height: 90, channels: 3, background: { r: 20, g: 120, b: 200 } } })
  .jpeg().toFile('/tmp/ar-menu-smoke-dish.jpg').then(() => {});
"
UPLOAD=$(curl -sf -X POST "$BASE/restaurants/$RID/items/$ITEM_ID/photo" \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/ar-menu-smoke-dish.jpg;type=image/jpeg")
PHOTO_URL=$(echo "$UPLOAD" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).photoUrl))")
[[ -n "$PHOTO_URL" ]] || { echo "upload did not return a photoUrl: $UPLOAD" >&2; exit 1; }
SERVED_HEADERS=$(curl -s -D - -o /tmp/ar-menu-smoke-served.webp -w '%{http_code}' "$PHOTO_URL")
SERVED_CODE=$(echo "$SERVED_HEADERS" | tail -1)
[[ "$SERVED_CODE" == "200" ]] || { echo "serving the uploaded photo back failed: HTTP $SERVED_CODE" >&2; exit 1; }
file /tmp/ar-menu-smoke-served.webp | grep -q "Web/P image" || { echo "served file is not a valid webp image" >&2; exit 1; }
# curl doesn't enforce this header the way a browser does — a stricter-than-
# intended value here passes every curl check yet silently breaks <img>/
# <model-viewer> loading the dashboard/AR-viewer will do cross-origin. Caught
# live in Chrome once, not by curl — see SKILL.md Gotchas.
echo "$SERVED_HEADERS" | grep -qi "^Cross-Origin-Resource-Policy: cross-origin" \
  || { echo "uploads response is missing Cross-Origin-Resource-Policy: cross-origin — cross-origin <img>/<model-viewer> loads will silently fail" >&2; exit 1; }
echo "upload + serve-back OK ($PHOTO_URL)"

echo "-- admin: role guard + QA approve/reject --"
ADMIN_EMAIL="smoke-admin@example.com"
ADMIN_PASSWORD="CorrectHorse123"
(cd "$BACKEND_DIR" && ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run seed:admin >/dev/null 2>&1)
ADMIN_TOKEN=$(curl -sf -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/qa-queue" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "403" ]] || { echo "expected owner->403 on admin route, got $CODE" >&2; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/qa-queue" -H "Authorization: Bearer $ADMIN_TOKEN")
[[ "$CODE" == "200" ]] || { echo "expected admin->200 on admin route, got $CODE" >&2; exit 1; }
echo "role guard OK (owner=403, admin=200)"

echo "-- diner AR viewer: public page + self-hosted script (structural only — see Gotchas) --"
ITEM_SLUG=$(node -e "process.stdout.write(require('/tmp/item.json').publicSlug)")
PAGE_CODE=$(curl -s -o /tmp/ar-menu-smoke-page.html -w '%{http_code}' "$BASE/m/$ITEM_SLUG")
[[ "$PAGE_CODE" == "200" ]] || { echo "AR viewer page failed: HTTP $PAGE_CODE" >&2; exit 1; }
grep -q "Smoke Burger" /tmp/ar-menu-smoke-page.html || { echo "AR viewer page missing item name" >&2; exit 1; }
NOT_FOUND_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/no-such-slug-smoke-test")
[[ "$NOT_FOUND_CODE" == "404" ]] || { echo "expected 404 for unknown slug, got $NOT_FOUND_CODE" >&2; exit 1; }
SCRIPT_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/vendor/model-viewer.min.js")
[[ "$SCRIPT_CODE" == "200" ]] || { echo "self-hosted model-viewer script failed: HTTP $SCRIPT_CODE" >&2; exit 1; }
echo "AR viewer page OK (structural checks only — curl can't see CSP/WASM/render bugs)"

echo
echo "ALL SMOKE CHECKS PASSED"
echo "Server is running: pid=$(cat "$PID_FILE"), port=$PORT, log=$LOG_FILE"
echo "Stop with: $SKILL_DIR/smoke.sh --stop"
