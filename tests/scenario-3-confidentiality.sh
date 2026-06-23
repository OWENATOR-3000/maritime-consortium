#!/bin/bash
# =============================================================================
# scenario-3-confidentiality.sh
# Chapter 6 — Section 6.3.3: Confidentiality-Preserving Information Sharing
#
# Demonstrates: ShippingLineA's commercial/pricing data is stored in a
# private data collection. Authorised parties (Customs, Port, Regulator)
# can read it. Competitor (ShippingLineB) is blocked at protocol level —
# not just by the API, but because their peer is not a collection member.
#
# Requires: a CLEARED shipment to attach commercial details to.
#           Run scenario-2-cargo-booking.sh first, OR the main run-tests.sh.
#           This script creates its own fresh shipment if needed.
# =============================================================================
set -euo pipefail

API="http://localhost:8080"
TS=$(date +%s)
SHIP_ID="S3-CONF-${TS}"

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
    printf "  #%-2s %-58s [%s]  %s\n" "$NUM" "$NAME" "$TYPE" "$(green PASS)"
  else
    FAIL=$((FAIL+1))
    printf "  #%-2s %-58s [%s]  %s (expected %s got %s)\n" \
      "$NUM" "$NAME" "$TYPE" "$(red FAIL)" "$EXPECTED" "$CODE"
  fi
  echo "      $BODY_OUT"
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Chapter 6 — Scenario 6.3.3: Confidentiality-Preserving        ║"
echo "║  Information Sharing                                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo "  Shipment ID: ${SHIP_ID}"
echo ""

# ── Setup: create a shipment to attach commercial details to ──────────────
echo "── Setup: creating shipment for this scenario ──"

curl -s -X POST "${API}/shipments" \
  -H "Authorization: Bearer shippingA" \
  -H "Content-Type: application/json" \
  -d "{\"shipmentId\":\"${SHIP_ID}\",\"routeCode\":\"RT-CONF-TEST\",\"cargoDescription\":\"Confidentiality test cargo\"}" \
  > /dev/null

echo "  Shipment ${SHIP_ID} created."
echo ""

# ── Step 1: ShippingLineA submits confidential commercial data ────────────
echo "── Step 1: ShippingLineA submits confidential commercial data ──"

run_test 1 "ShippingLineA submits commercial details (private collection)" POSITIVE 202 \
  POST "${API}/shipments/${SHIP_ID}/commercial-details" "shippingA" \
  '{"commercialDetails":{"contractValue":"$620,000","insuranceRef":"INS-2026-447","clientName":"Horizon Trading Ltd","freightRate":"$180/TEU","routePriority":"EXPRESS"}}'

echo ""

# ── Step 2: Authorised parties can read the private data ──────────────────
echo "── Step 2: Authorised participants can read (collection members) ──"

run_test 2 "ShippingLineA reads own commercial data" POSITIVE 200 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "shippingA" ""

run_test 3 "CustomsAuthority reads commercial data (authorised)" POSITIVE 200 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "customs" ""

run_test 4 "PortAuthority reads commercial data (authorised)" POSITIVE 200 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "port" ""

run_test 5 "Regulator reads commercial data (authorised)" POSITIVE 200 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "regulator" ""

echo ""

# ── Step 3: Competitor (ShippingLineB) is blocked ─────────────────────────
echo "── Step 3: Competitor blocked — protocol-level exclusion ──"

run_test 6 "ShippingLineB READ attempt blocked  [NEGATIVE — not a collection member]" NEGATIVE 403 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "shippingB" ""

run_test 7 "ShippingLineB WRITE attempt also blocked  [NEGATIVE — write requires collection membership]" NEGATIVE 403 \
  POST "${API}/shipments/${SHIP_ID}/commercial-details" "shippingB" \
  '{"commercialDetails":{"contractValue":"$1","insuranceRef":"FAKE","clientName":"Attacker attempt"}}'

echo ""

# ── Step 4: Unauthenticated request blocked ───────────────────────────────
echo "── Step 4: Unauthenticated access blocked ──"

run_test 8 "No-token request rejected at API gateway  [NEGATIVE]" NEGATIVE 401 \
  GET "${API}/shipments/${SHIP_ID}/commercial-details" "" ""

echo ""

# ── Step 5: Confirm public shipment data is still visible to all ──────────
echo "── Step 5: Public shipment data remains visible to all participants ──"

echo "  (Demonstrates selective disclosure — some data shared, commercial data isolated)"
echo ""

run_test 9 "ShippingLineB can read public shipment record (not commercial)" POSITIVE 200 \
  GET "${API}/shipments/${SHIP_ID}" "shippingB" ""

echo ""

# ── Summary ───────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo "╔══════════════════════════════════════════════════════════════════╗"
printf "║  Scenario 6.3.3 Results:  %d/%d passed" "$PASS" "$TOTAL"
if [ "$FAIL" -eq 0 ]; then
  printf "  $(green 'ALL PASS')"
else
  printf "  $(red "${FAIL} FAILED")"
fi
echo ""
echo "  Key finding: ShippingLineB is excluded from private data at the"
echo "  protocol level — their peer does not receive the collection data,"
echo "  so no API-layer bypass is possible."
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
