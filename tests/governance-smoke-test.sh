#!/bin/bash
# ---------------------------------------------------------------------------
# governance-smoke-test.sh — End-to-end verification of Phase 1 governance:
# propose -> vote -> quorum -> suspend enforcement -> reinstate.
#
# Run once against a freshly started system (bash stop.sh && bash start.sh),
# since proposal IDs here are fixed and will collide on a second run against
# the same ledger state.
# ---------------------------------------------------------------------------
set -euo pipefail

API="http://localhost:8080"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }

check() {
  local NAME="$1" EXPECTED="$2" ACTUAL="$3" BODY="$4"
  if [ "$EXPECTED" = "$ACTUAL" ]; then
    PASS=$((PASS+1))
    printf "  %-65s %s\n" "$NAME" "$(green PASS)"
  else
    FAIL=$((FAIL+1))
    printf "  %-65s %s (expected %s, got %s)\n" "$NAME" "$(red FAIL)" "$EXPECTED" "$ACTUAL"
    echo "    Response: $BODY"
  fi
}

# Same as check(), but for substring assertions against a response body
# (pretty-printed JSON, so patterns must tolerate ": " spacing).
check_contains() {
  local NAME="$1" PATTERN="$2" BODY="$3"
  if echo "$BODY" | grep -qE "$PATTERN"; then
    PASS=$((PASS+1))
    printf "  %-65s %s\n" "$NAME" "$(green PASS)"
  else
    FAIL=$((FAIL+1))
    printf "  %-65s %s\n" "$NAME" "$(red FAIL)"
    echo "    Response: $BODY"
  fi
}

call() {
  local METHOD="$1" TOKEN="$2" URL="$3" BODY="${4:-}"
  local ARGS=(-s -w '\n%{http_code}' -X "$METHOD" "$URL" -H "Authorization: Bearer $TOKEN")
  [ -n "$BODY" ] && ARGS+=(-H "Content-Type: application/json" -d "$BODY")
  curl "${ARGS[@]}"
}

echo ""
echo "── Phase 1 Governance Smoke Test ──────────────────────────────"
echo ""

# ── 1. Propose suspending Shipping Line B ──────────────────────────────
RESP=$(call POST shippingA "$API/governance/proposals" \
  '{"proposalId":"GOV-TEST-SUSPEND-1","changeType":"SUSPEND_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "ShippingLineA proposes suspending ShippingLineB" 202 "$CODE" "$BODY"

# ── 2. Cast 3 votes to reach majority of 5 (need 3 YES) ────────────────
RESP=$(call POST shippingA "$API/governance/proposals/GOV-TEST-SUSPEND-1/vote" '{"choice":"YES"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "ShippingLineA votes YES (1/3)" 202 "$CODE" "$BODY"

RESP=$(call POST customs "$API/governance/proposals/GOV-TEST-SUSPEND-1/vote" '{"choice":"YES"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "CustomsAuthority votes YES (2/3)" 202 "$CODE" "$BODY"

RESP=$(call POST port "$API/governance/proposals/GOV-TEST-SUSPEND-1/vote" '{"choice":"YES"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "PortAuthority votes YES (3/3 — quorum reached)" 202 "$CODE" "$BODY"
echo "    Response: $BODY"

# ── 3. Confirm proposal is APPROVED ─────────────────────────────────────
RESP=$(call GET regulator "$API/governance/proposals/GOV-TEST-SUSPEND-1")
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "Proposal is now APPROVED" 200 "$CODE" "$BODY"
check_contains "Proposal status field reads APPROVED" '"status":[[:space:]]*"APPROVED"' "$BODY"

# ── 4. Confirm ShippingLineB is now SUSPENDED ───────────────────────────
RESP=$(call GET regulator "$API/governance/members/ShippingLineBMSP")
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "ShippingLineB membership record reachable" 200 "$CODE" "$BODY"
check_contains "ShippingLineB status reads SUSPENDED" '"status":[[:space:]]*"SUSPENDED"' "$BODY"

# ── 5. Suspended member is rejected by the chaincode itself ────────────
# Chaincode-level rejections that read as a permission/authorization issue
# (message contains "may not") are classified 403 by the API's error
# classifier — same convention as every other access-control rejection in
# this codebase (see tests/run-tests.sh #5, #15).
RESP=$(call POST shippingB "$API/shipments" \
  '{"shipmentId":"SH-GOV-TEST","routeCode":"RT-TEST","cargoDescription":"test"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "Suspended ShippingLineB blocked from creating a shipment" 403 "$CODE" "$BODY"

# ── 6. Governance audit trail captured everything ───────────────────────
RESP=$(call GET regulator "$API/governance/audit")
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "Governance audit trail is readable" 200 "$CODE" "$BODY"
check_contains "Audit trail contains PROPOSAL_APPROVED event" 'PROPOSAL_APPROVED' "$BODY"

# ── 7. Reinstate ShippingLineB (prove the reverse path also works) ─────
call POST shippingA "$API/governance/proposals" \
  '{"proposalId":"GOV-TEST-REINSTATE-1","changeType":"REINSTATE_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}' > /dev/null
call POST shippingA "$API/governance/proposals/GOV-TEST-REINSTATE-1/vote" '{"choice":"YES"}' > /dev/null
call POST customs   "$API/governance/proposals/GOV-TEST-REINSTATE-1/vote" '{"choice":"YES"}' > /dev/null
RESP=$(call POST port "$API/governance/proposals/GOV-TEST-REINSTATE-1/vote" '{"choice":"YES"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "Reinstate proposal reaches quorum" 202 "$CODE" "$BODY"

RESP=$(call POST shippingB "$API/shipments" \
  '{"shipmentId":"SH-GOV-TEST","routeCode":"RT-TEST","cargoDescription":"test"}')
CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
check "Reinstated ShippingLineB can create a shipment again" 202 "$CODE" "$BODY"

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "── Summary ─────────────────────────────────────────────────────"
echo "  Passed: $(green "$PASS")   Failed: $([ "$FAIL" -gt 0 ] && red "$FAIL" || echo "$FAIL")"
echo ""

[ "$FAIL" -eq 0 ]
