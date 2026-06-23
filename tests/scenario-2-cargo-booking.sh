#!/bin/bash
# =============================================================================
# scenario-2-cargo-booking.sh
# Chapter 6 — Section 6.3.2: Cargo Booking and Shipment Coordination
#
# Demonstrates: freight forwarder/shipping line initiates cargo booking,
# smart contract validates, customs + port + shipping line all approve,
# regulator finalizes. Distributed audit trail generated automatically.
# Negative: finalization blocked until all required approvals are present.
# =============================================================================
set -euo pipefail

API="http://localhost:8080"
TS=$(date +%s)
SHIP_ID="S2-CARGO-${TS}"
DOC_ID="S2-DOC-${TS}"

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
    printf "  #%-2s %-55s [%s]  %s\n" "$NUM" "$NAME" "$TYPE" "$(green PASS)"
  else
    FAIL=$((FAIL+1))
    printf "  #%-2s %-55s [%s]  %s (expected %s got %s)\n" \
      "$NUM" "$NAME" "$TYPE" "$(red FAIL)" "$EXPECTED" "$CODE"
  fi
  echo "      $BODY_OUT"
}

check_field() {
  local LABEL=$1 PATTERN=$2 TEXT=$3
  if echo "$TEXT" | grep -q "$PATTERN"; then
    printf "       ✓  %s\n" "$LABEL"
  else
    printf "       ✗  %s  $(red '— NOT FOUND')\n" "$LABEL"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Chapter 6 — Scenario 6.3.2: Cargo Booking and Coordination    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo "  Shipment ID: ${SHIP_ID}"
echo "  Document ID: ${DOC_ID}"
echo ""

# ── Step 1: Freight forwarder initiates cargo booking ─────────────────────
echo "── Step 1: Cargo booking initiated ──"

run_test 1 "ShippingLineA initiates cargo booking" POSITIVE 202 \
  POST "${API}/shipments" "shippingA" \
  "{\"shipmentId\":\"${SHIP_ID}\",\"routeCode\":\"RT-DEMO-EAST\",\"cargoDescription\":\"Electronic components — 40ft container\"}"

# Regulator cannot create (role restriction)
run_test 2 "Regulator cannot initiate a booking (role restriction)" NEGATIVE 403 \
  POST "${API}/shipments" "regulator" \
  "{\"shipmentId\":\"${SHIP_ID}-BLOCKED\",\"routeCode\":\"RT-X\",\"cargoDescription\":\"should fail\"}"

echo ""

# ── Step 2: Submit cargo document (off-chain storage, on-chain hash) ───────
echo "── Step 2: Document submitted — hash anchored on-chain ──"

SAMPLE_DOC=$(echo -n "Cargo manifest for ${SHIP_ID}: 450 units electronic components, weight 12,400kg, origin Shenzhen CN." | base64 | tr -d '\n')

run_test 3 "Upload cargo manifest and anchor SHA-256 hash on-chain" POSITIVE 202 \
  POST "${API}/documents/upload" "customs" \
  "{\"shipmentId\":\"${SHIP_ID}\",\"documentId\":\"${DOC_ID}\",\"documentName\":\"cargo-manifest.pdf\",\"content\":\"${SAMPLE_DOC}\"}"

echo ""

# ── Step 3: Multi-organisation clearance approvals ────────────────────────
echo "── Step 3: Multi-organisation clearance approval workflow ──"

run_test 4 "CustomsAuthority approves clearance  (1 of 3)" POSITIVE 202 \
  POST "${API}/shipments/${SHIP_ID}/clearance/approve" "customs" ""

run_test 5 "PortAuthority approves clearance  (2 of 3)" POSITIVE 202 \
  POST "${API}/shipments/${SHIP_ID}/clearance/approve" "port" ""

# Negative: attempt to finalize with only 2 of 3 approvals — must fail
run_test 6 "Cannot finalize with only 2 of 3 approvals  [NEGATIVE]" NEGATIVE 400 \
  POST "${API}/shipments/${SHIP_ID}/clearance/finalize" "shippingA" ""

run_test 7 "ShippingLineA approves clearance  (3 of 3)" POSITIVE 202 \
  POST "${API}/shipments/${SHIP_ID}/clearance/approve" "shippingA" ""

echo ""

# ── Step 4: Finalize clearance ────────────────────────────────────────────
echo "── Step 4: Shipment finalized ──"

run_test 8 "Regulator finalizes clearance — shipment CLEARED" POSITIVE 202 \
  POST "${API}/shipments/${SHIP_ID}/clearance/finalize" "regulator" ""

echo ""

# ── Step 5: Verify final state ────────────────────────────────────────────
echo "── Step 5: Verify shipment state and audit trail ──"

SHIP_STATE=$(curl -s -X GET "${API}/shipments/${SHIP_ID}" \
  -H "Authorization: Bearer regulator" 2>&1) || true

printf "  #9  %-55s [POSITIVE]  " "Shipment status is CLEARED"
if echo "$SHIP_STATE" | grep -q "CLEARED"; then
  PASS=$((PASS+1))
  echo "$(green PASS)"
else
  FAIL=$((FAIL+1))
  echo "$(red FAIL) — status not CLEARED"
fi
echo "      $SHIP_STATE"
echo ""
check_field "status: CLEARED" "CLEARED" "$SHIP_STATE"
check_field "shipmentId present" "$SHIP_ID" "$SHIP_STATE"

echo ""

# ── Step 6: Retrieve distributed audit trail ──────────────────────────────
echo "── Step 6: Distributed audit trail generated ──"

AUDIT=$(curl -s -X GET "${API}/shipments/${SHIP_ID}/audit" \
  -H "Authorization: Bearer regulator" 2>&1) || true

printf "  #10 %-55s [POSITIVE]  " "Audit trail retrieved"
if echo "$AUDIT" | grep -q "CREATED\|APPROVED\|CLEARED\|eventType"; then
  PASS=$((PASS+1))
  echo "$(green PASS)"
else
  FAIL=$((FAIL+1))
  echo "$(red FAIL) — no audit events found"
fi
echo "      Audit trail (excerpt):"
echo "$AUDIT" | python3 -m json.tool 2>/dev/null | head -40 || echo "$AUDIT"

echo ""

# ── Summary ───────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo "╔══════════════════════════════════════════════════════════════════╗"
printf "║  Scenario 6.3.2 Results:  %d/%d passed" "$PASS" "$TOTAL"
if [ "$FAIL" -eq 0 ]; then
  printf "  $(green 'ALL PASS')"
else
  printf "  $(red "${FAIL} FAILED")"
fi
echo ""
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
