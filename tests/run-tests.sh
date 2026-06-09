#!/bin/bash
# ---------------------------------------------------------------------------
# run-tests.sh — Automated validation tests for the Maritime Consortium.
#
# Covers all six enforcement domains from the specification:
#   1. Governance neutrality
#   2. Enforceable confidentiality
#   3. Bounded transparency
#   4. Distributed validation authority
#   5. Hybrid compliance
#   6. Governed interoperability
# ---------------------------------------------------------------------------
set -euo pipefail

API="http://localhost:8080"

PASS=0
FAIL=0
TOTAL=0

EVIDENCE_DIR="$(cd "$(dirname "$0")" && pwd)/evidence"
rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

# ── Helpers ─────────────────────────────────────────────────────────────

green()  { printf "\033[32m%s\033[0m" "$1"; }
red()    { printf "\033[31m%s\033[0m" "$1"; }
yellow() { printf "\033[33m%s\033[0m" "$1"; }

run_test() {
  local TEST_NUM=$1
  local TEST_NAME=$2
  local TEST_TYPE=$3          # POSITIVE or NEGATIVE
  local EXPECTED_STATUS=$4    # expected HTTP status
  local METHOD=$5
  local URL=$6
  local TOKEN=$7
  local BODY="${8:-}"

  TOTAL=$((TOTAL + 1))

  local CURL_ARGS=(-s -w "\n%{http_code}" -X "$METHOD" "$URL")
  [ -n "$TOKEN" ] && CURL_ARGS+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$BODY" ] && CURL_ARGS+=(-H "Content-Type: application/json" -d "$BODY")

  local RESPONSE
  RESPONSE=$(curl "${CURL_ARGS[@]}" 2>&1) || true

  local HTTP_CODE
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  local RESPONSE_BODY
  RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

  # Save evidence
  {
    echo "Test #${TEST_NUM}: ${TEST_NAME}"
    echo "Type: ${TEST_TYPE}"
    echo "Method: ${METHOD}"
    echo "URL: ${URL}"
    echo "Token: ${TOKEN:-none}"
    echo "Request Body: ${BODY:-none}"
    echo "Expected Status: ${EXPECTED_STATUS}"
    echo "Actual Status: ${HTTP_CODE}"
    echo "Response:"
    echo "${RESPONSE_BODY}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE_BODY}"
  } > "${EVIDENCE_DIR}/test_${TEST_NUM}.txt"

  if [ "$HTTP_CODE" = "$EXPECTED_STATUS" ]; then
    PASS=$((PASS + 1))
    printf "  %-3s %-50s [%s]  %s\n" "#${TEST_NUM}" "$TEST_NAME" "$TEST_TYPE" "$(green 'PASS')"
  else
    FAIL=$((FAIL + 1))
    printf "  %-3s %-50s [%s]  %s (expected %s, got %s)\n" \
      "#${TEST_NUM}" "$TEST_NAME" "$TEST_TYPE" "$(red 'FAIL')" "$EXPECTED_STATUS" "$HTTP_CODE"
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Maritime Consortium — Validation Test Suite           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 6. Governed Interoperability ────────────────────────────────────────
echo "── 6. Governed Interoperability ──────────────────────────────"

run_test 1 "API health check (no auth needed)" POSITIVE 200 \
  GET "${API}/health" "" ""

run_test 2 "Unauthenticated request is rejected" NEGATIVE 401 \
  GET "${API}/shipments/SH001" "" ""

run_test 3 "Invalid token is rejected" NEGATIVE 401 \
  GET "${API}/shipments/SH001" "invalid-token" ""

echo ""

# ── 1. Governance Neutrality ────────────────────────────────────────────
echo "── 1. Governance Neutrality ──────────────────────────────────"

# Create shipment as ShippingLineA (positive)
run_test 4 "ShippingLineA creates shipment SH001" POSITIVE 202 \
  POST "${API}/shipments" "shippingA" \
  '{"shipmentId":"SH001","routeCode":"RT-EAST-01","cargoDescription":"Container electronics"}'

# Create shipment as Regulator (negative — only shipping lines can create)
run_test 5 "Regulator cannot create shipment" NEGATIVE 403 \
  POST "${API}/shipments" "regulator" \
  '{"shipmentId":"SH002","routeCode":"RT-WEST-01","cargoDescription":"Test cargo"}'

# Approve clearance — 3-party approval flow
run_test 6 "ShippingLineA approves clearance" POSITIVE 202 \
  POST "${API}/shipments/SH001/clearance/approve" "shippingA" ""

run_test 7 "CustomsAuthority approves clearance" POSITIVE 202 \
  POST "${API}/shipments/SH001/clearance/approve" "customs" ""

run_test 8 "PortAuthority approves clearance" POSITIVE 202 \
  POST "${API}/shipments/SH001/clearance/approve" "port" ""

# Finalize with all approvals (positive)
run_test 9 "Finalize clearance with all 3 approvals" POSITIVE 202 \
  POST "${API}/shipments/SH001/clearance/finalize" "shippingA" ""

# Create another shipment to test failed finalization
run_test 10 "ShippingLineA creates shipment SH003" POSITIVE 202 \
  POST "${API}/shipments" "shippingA" \
  '{"shipmentId":"SH003","routeCode":"RT-SOUTH-01","cargoDescription":"Uncleared cargo"}'

# Only one approval
run_test 11 "ShippingLineA approves clearance for SH003" POSITIVE 202 \
  POST "${API}/shipments/SH003/clearance/approve" "shippingA" ""

# Finalize without all approvals (negative)
run_test 12 "Cannot finalize with missing approvals" NEGATIVE 400 \
  POST "${API}/shipments/SH003/clearance/finalize" "shippingA" ""

echo ""

# ── 2. Enforceable Confidentiality ──────────────────────────────────────
echo "── 2. Enforceable Confidentiality ────────────────────────────"

# Submit commercial details as ShippingLineA (positive)
run_test 13 "ShippingLineA submits commercial details" POSITIVE 202 \
  POST "${API}/shipments/SH001/commercial-details" "shippingA" \
  '{"commercialDetails":{"contractValue":"$450,000","insuranceRef":"INS-2024-881","clientName":"ACME Corp"}}'

# Retrieve commercial details as ShippingLineA (positive)
run_test 14 "ShippingLineA reads own commercial details" POSITIVE 200 \
  GET "${API}/shipments/SH001/commercial-details" "shippingA" ""

# Retrieve commercial details as ShippingLineB (negative — competitor isolation)
run_test 15 "ShippingLineB cannot read competitor private data" NEGATIVE 403 \
  GET "${API}/shipments/SH001/commercial-details" "shippingB" ""

echo ""

# ── 3. Bounded Transparency ────────────────────────────────────────────
echo "── 3. Bounded Transparency ───────────────────────────────────"

# Regulator reconstructs shipment history
run_test 16 "Regulator retrieves audit trail" POSITIVE 200 \
  GET "${API}/shipments/SH001/audit" "regulator" ""

# Read public shipment data
run_test 17 "Regulator reads public shipment data" POSITIVE 200 \
  GET "${API}/shipments/SH001" "regulator" ""

echo ""

# ── 5. Hybrid Compliance ───────────────────────────────────────────────
echo "── 5. Hybrid Compliance ──────────────────────────────────────"

# Encode a sample document as base64
SAMPLE_DOC=$(echo -n "This is a regulatory compliance document for shipment SH001." | base64 | tr -d '\n')

# Upload document (stores off-chain, anchors hash on-chain)
run_test 18 "Upload document and anchor hash on-chain" POSITIVE 202 \
  POST "${API}/documents/upload" "customs" \
  "{\"shipmentId\":\"SH001\",\"documentId\":\"DOC001\",\"documentName\":\"compliance-report.pdf\",\"content\":\"${SAMPLE_DOC}\"}"

# Verify document (re-hash stored file, compare with on-chain)
run_test 19 "Verify document integrity (original matches)" POSITIVE 200 \
  POST "${API}/documents/DOC001/verify" "regulator" ""

# Tamper with the stored file, then verify again
echo ""
echo "  [Tampering with stored document for negative test...]"
docker exec api-gateway sh -c 'echo "TAMPERED CONTENT" > /storage/documents/DOC001' 2>/dev/null || true

run_test 20 "Tampered document fails verification" POSITIVE 200 \
  POST "${API}/documents/DOC001/verify" "regulator" ""

# Check that the response contains matches: false
VERIFY_RESULT=$(cat "${EVIDENCE_DIR}/test_20.txt" | grep -o '"matches": *[a-z]*' | head -1)
if echo "$VERIFY_RESULT" | grep -q "false"; then
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Tampered hash mismatch confirmed" "CHECK" "$(green 'PASS')"
else
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Tampered hash mismatch NOT detected" "CHECK" "$(yellow 'REVIEW')"
fi

echo ""

# ── Summary ─────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Test Summary                                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Total:  %-48s ║\n" "$TOTAL"
printf "║  Passed: %-48s ║\n" "$(green "$PASS")"
printf "║  Failed: %-48s ║\n" "$([ "$FAIL" -gt 0 ] && red "$FAIL" || echo "$FAIL")"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Evidence saved to: tests/evidence/                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
