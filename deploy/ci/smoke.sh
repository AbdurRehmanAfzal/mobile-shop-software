#!/usr/bin/env bash
# CI smoke test against the real stack (PostgreSQL + backend + Caddy): health, the app page, and a
# small real flow through /api: open a shop, read the seeded catalogue, add a person, add a phone.
set -euo pipefail
B=http://localhost:8080
for _ in $(seq 1 60); do curl -fs "$B/health" >/dev/null && break; sleep 2; done
curl -fs "$B/health"; echo
curl -fs "$B/" | grep -q '<div id="root"' && echo "app page ok"
curl -fs "$B/stock/summary" | grep -q '<div id="root"' && echo "deep link ok"

PHONE="0399$(date +%s | tail -c 8)"
TOKEN=$(curl -fs -X POST "$B/api/v1/auth/signup" -H 'content-type: application/json' \
  -d "{\"shop_name\":\"CI Shop\",\"owner_name\":\"CI Owner\",\"phone\":\"$PHONE\",\"password\":\"ci-secret-1\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
H="Authorization: Bearer $TOKEN"
BRANDS=$(curl -fs "$B/api/v1/catalogue/brands" -H "$H" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')
echo "brands seeded: $BRANDS"; [ "$BRANDS" -gt 10 ]
curl -fs -X POST "$B/api/v1/parties" -H "$H" -H 'content-type: application/json' \
  -d '{"kind":"customer","name":"CI Customer","phone":"03001112233"}' >/dev/null && echo "party ok"
BRAND=$(curl -fs "$B/api/v1/catalogue/brands" -H "$H" | python3 -c 'import sys,json; print(next(b["id"] for b in json.load(sys.stdin) if b["name"]=="Nokia"))')
MODEL=$(curl -fs "$B/api/v1/catalogue/models?brand_id=$BRAND" -H "$H" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')
curl -fs -X POST "$B/api/v1/devices/opening-stock" -H "$H" -H 'content-type: application/json' \
  -d "{\"imei1\":\"490154203237518\",\"brand_id\":\"$BRAND\",\"model_id\":\"$MODEL\",\"condition\":\"used\",\"pta_status\":\"pta_approved\",\"cost_price\":8000,\"asking_price\":9500}" >/dev/null && echo "device ok"
curl -fs "$B/api/v1/reports/stock-summary" -H "$H" >/dev/null && echo "report ok"
echo "smoke ok"
