#!/bin/bash
# =============================================================================
# scenario-1-stakeholder-onboarding.sh
# Chapter 6 — Section 6.3.1: Stakeholder Onboarding and Identity Verification
#
# Demonstrates: new organisation requests consortium participation,
# members collectively review and vote, quorum reached → member becomes
# ACTIVE and can transact. Duplicate vote is rejected.
# =============================================================================
set -euo pipefail

API="http://localhost:8080"
TS=$(date +%s)
PROP_ID="S1-ONBOARD-${TS}"
NEW_MSP="FreightCoMSP"
NEW_ORG="Freight Co Ltd"

PASS=0; FAIL=0

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }

run_test() {
  local NUM=$1 NAME=$2 TYPE=$3 EXPECTED=$4 METHOD=$5 URL=$6 TOKEN=$7 BODY="${8:-}"
  local ARGS=(-s -w "\n%{http_code}" -X "$METHOD" "$URL")
  [ -n "$TOKEN" ] && ARGS+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$BODY"  ] && ARGS+=(-H "Content-Type: application/json" -d "$BODY")
  local RESP; RESP=$(curl "${ARGS[@]}" 2>&1) || true
  local CODE; CODE=$(echo "$RESP" | tail -1)
  local BODY_OUT; BODY_OUT=$(echo "$RESP" | sed '$d')
  if [ "$CODE" = "$EXPECTED" ]; then
    PASS=$((PASS+1))
    printf "  #%-2s %-52s [%s]  %s\n" "$NUM" "$NAME" "$TYPE" "$(green PASS)"
  else
    FAIL=$((FAIL+1))
    printf "  #%-2s %-52s [%s]  %s (expected %s got %s)\n" \
      "$NUM" "$NAME" "$TYPE" "$(red FAIL)" "$EXPECTED" "$CODE"
  fi
  echo "$BODY_OUT"
}

check_contains() {
  local LABEL=$1 PATTERN=$2 TEXT=$3
  if echo "$TEXT" | grep -q "$PATTERN"; then
    printf "       ✓  %-50s  %s\n" "$LABEL" "$(green confirmed)"
  else
    printf "       ✗  %-50s  %s\n" "$LABEL" "$(red NOT FOUND)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Chapter 6 — Scenario 6.3.1: Stakeholder Onboarding            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo "  New org: ${NEW_ORG}  (MSP: ${NEW_MSP})"
echo "  Proposal ID: ${PROP_ID}"
echo ""

# ── Step 1: New stakeholder submits participation request ─────────────────
echo "── Step 1: Participation request submitted ──"

RESP1=$(curl -s -w "\n%{http_code}" -X POST "${API}/governance/proposals" \
  -H "Authorization: Bearer shippingA" \
  -H "Content-Type: application/json" \
  -d "{\"proposalId\":\"${PROP_ID}\",\"changeType\":\"ADD_MEMBER\",\"payload\":{\"targetMsp\":\"${NEW_MSP}\",\"organisationName\":\"${NEW_ORG}\"}}" 2>&1) || true

CODE1=$(echo "$RESP1" | tail -1)
BODY1=$(echo "$RESP1" | sed '$d')
if [ "$CODE1" = "202" ]; then
  PASS=$((PASS+1))
  printf "  #1  %-52s [POSITIVE]  %s\n" "ShippingLineA submits ADD_MEMBER proposal" "$(green PASS)"
else
  FAIL=$((FAIL+1))
  printf "  #1  %-52s [POSITIVE]  %s (got %s)\n" "ShippingLineA submits ADD_MEMBER proposal" "$(red FAIL)" "$CODE1"
fi
echo "      Response: $BODY1"
echo ""

# ── Step 2: Consortium governance review and vote ─────────────────────────
echo "── Step 2: Consortium members vote (quorum = 3 of 5 active members) ──"

run_test 2 "ShippingLineA votes YES  (1 of 3)" POSITIVE 202 \
  POST "${API}/governance/proposals/${PROP_ID}/vote" "shippingA" '{"choice":"YES"}'

run_test 3 "CustomsAuthority votes YES  (2 of 3)" POSITIVE 202 \
  POST "${API}/governance/proposals/${PROP_ID}/vote" "customs" '{"choice":"YES"}'

run_test 4 "PortAuthority votes YES — quorum reached  (3 of 3)" POSITIVE 202 \
  POST "${API}/governance/proposals/${PROP_ID}/vote" "port" '{"choice":"YES"}'

sleep 1   # allow ledger state to propagate across peers

echo ""

# ── Step 3: Verify membership is now ACTIVE ───────────────────────────────
echo "── Step 3: Verify new member is ACTIVE ──"

MEMBER_RESP=$(curl -s -X GET "${API}/governance/members/${NEW_MSP}" \
  -H "Authorization: Bearer regulator" 2>&1) || true

printf "  #5  %-52s [POSITIVE]  " "Regulator queries new member status"
if echo "$MEMBER_RESP" | grep -q "ACTIVE"; then
  PASS=$((PASS+1))
  echo "$(green PASS)"
else
  FAIL=$((FAIL+1))
  echo "$(red FAIL) — member not ACTIVE"
fi
echo "      Response: $MEMBER_RESP"
echo ""
check_contains "member status is ACTIVE" "ACTIVE" "$MEMBER_RESP"
check_contains "MSP ID matches" "$NEW_MSP" "$MEMBER_RESP"

echo ""

# ── Step 4: Active members list reflects new member ───────────────────────
echo "── Step 4: Active members list updated ──"

ALL_RESP=$(curl -s -X GET "${API}/governance/members" \
  -H "Authorization: Bearer regulator" 2>&1) || true

printf "  #6  %-52s [POSITIVE]  " "Active members list includes new org"
if echo "$ALL_RESP" | grep -q "$NEW_MSP"; then
  PASS=$((PASS+1))
  echo "$(green PASS)"
else
  FAIL=$((FAIL+1))
  echo "$(red FAIL) — new org not in member list"
fi
echo ""

# ── Step 5: Negative — duplicate vote from same org rejected ──────────────
echo "── Step 5: Duplicate vote rejected ──"

run_test 7 "ShippingLineA attempts second vote (duplicate)" NEGATIVE 400 \
  POST "${API}/governance/proposals/${PROP_ID}/vote" "shippingA" '{"choice":"YES"}'

echo ""

# ── Step 6: Governance audit trail records the onboarding event ───────────
echo "── Step 6: Governance audit trail ──"

GOV_AUDIT=$(curl -s -X GET "${API}/governance/audit" \
  -H "Authorization: Bearer regulator" 2>&1) || true

printf "  #8  %-52s [POSITIVE]  " "Governance audit trail contains onboarding event"
if echo "$GOV_AUDIT" | grep -q "ADD_MEMBER\|PROPOSAL_APPROVED"; then
  PASS=$((PASS+1))
  echo "$(green PASS)"
else
  FAIL=$((FAIL+1))
  echo "$(red FAIL) — ADD_MEMBER event not found in audit trail"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo "╔══════════════════════════════════════════════════════════════════╗"
printf "║  Scenario 6.3.1 Results:  %d/%d passed" "$PASS" "$TOTAL"
if [ "$FAIL" -eq 0 ]; then
  printf "  $(green 'ALL PASS')"
else
  printf "  $(red "${FAIL} FAILED")"
fi
echo ""
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
