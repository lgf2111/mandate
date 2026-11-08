#!/usr/bin/env bash
# End-to-end smoke test against a running Mandate server.
# Usage: ./scripts/smoke.sh [base-url]
set -euo pipefail

BASE="${1:-http://localhost:8787}"
PY="${PYTHON:-python3}"
pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

echo "smoke: $BASE"

curl -sf "$BASE/api/health" >/dev/null || fail "health endpoint"
pass "health"

curl -sf -X POST "$BASE/api/reset" >/dev/null || fail "reset"
pass "reset demo state"

MID=$(curl -sf "$BASE/api/mandates" | json "d['mandates'][0]['id']")
[ -n "$MID" ] || fail "no seeded mandate"
pass "seeded mandate $MID"

PROP=$(curl -sf -X POST "$BASE/api/proposals" -H 'content-type: application/json' \
  -d "{\"goal\":\"trail running shoes under the cap\",\"mandateId\":\"$MID\"}")
OUTCOME=$(echo "$PROP" | json "d['decision']['outcome']")
TOTAL=$(echo "$PROP" | json "d['decision']['totalCents']")
PID=$(echo "$PROP" | json "d['proposal']['id']")
[ "$OUTCOME" = "require_approval" ] || fail "expected require_approval, got $OUTCOME"
pass "proposal $OUTCOME at $TOTAL cents"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"proposalId\":\"$PID\",\"mandateId\":\"$MID\",\"approved\":false}")
[ "$CODE" = "409" ] || fail "checkout without approval should be 409, got $CODE"
pass "checkout without approval blocked (409)"

ORDER=$(curl -sf -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"proposalId\":\"$PID\",\"mandateId\":\"$MID\",\"approved\":true}")
STATUS=$(echo "$ORDER" | json "d['order']['status']")
CAPTURE=$(echo "$ORDER" | json "d['order']['captureId']")
[ "$STATUS" = "captured" ] || fail "expected captured, got $STATUS"
pass "captured $CAPTURE (demo)"

SPENT=$(curl -sf "$BASE/api/mandates" | json "[m for m in d['mandates'] if m['id']=='$MID'][0]['spentCents']")
[ "$SPENT" = "$TOTAL" ] || fail "spent $SPENT != total $TOTAL"
pass "budget decremented to $SPENT cents"

LEDGER=$(curl -sf "$BASE/api/ledger" | json "len(d['orders'])")
[ "$LEDGER" -ge 1 ] || fail "ledger empty"
pass "ledger has $LEDGER order(s)"

SECOND=$(curl -sf -X POST "$BASE/api/proposals" -H 'content-type: application/json' \
  -d "{\"goal\":\"trail running shoes under the cap\",\"mandateId\":\"$MID\"}")
SECOND_OUTCOME=$(echo "$SECOND" | json "d['decision']['outcome']")
[ "$SECOND_OUTCOME" = "deny" ] || fail "expected deny after spending, got $SECOND_OUTCOME"
pass "second identical request denied on remaining budget"

echo "smoke: all checks passed"
