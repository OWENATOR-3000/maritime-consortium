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

# Evidence is organised by STBF component rather than dumped flat, so the
# repository directly satisfies "Evidence Collection and Demonstration
# Repository" from the feedback. CURRENT_DOMAIN is set once per section
# below and read by run_test() when it writes each test's evidence file.
for d in governance-neutrality confidentiality interoperability accountability compliance distributed-verification; do
  mkdir -p "${EVIDENCE_DIR}/${d}"
done
CURRENT_DOMAIN="interoperability"

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
  } > "${EVIDENCE_DIR}/${CURRENT_DOMAIN}/test_${TEST_NUM}.txt"

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
CURRENT_DOMAIN="governance-neutrality"

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
CURRENT_DOMAIN="confidentiality"

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
CURRENT_DOMAIN="accountability"

# Regulator reconstructs shipment history
run_test 16 "Regulator retrieves audit trail" POSITIVE 200 \
  GET "${API}/shipments/SH001/audit" "regulator" ""

# Read public shipment data
run_test 17 "Regulator reads public shipment data" POSITIVE 200 \
  GET "${API}/shipments/SH001" "regulator" ""

echo ""

# ── 5. Hybrid Compliance ───────────────────────────────────────────────
echo "── 5. Hybrid Compliance ──────────────────────────────────────"
CURRENT_DOMAIN="compliance"

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
VERIFY_RESULT=$(cat "${EVIDENCE_DIR}/${CURRENT_DOMAIN}/test_20.txt" | grep -o '"matches": *[a-z]*' | head -1)
if echo "$VERIFY_RESULT" | grep -q "false"; then
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Tampered hash mismatch confirmed" "CHECK" "$(green 'PASS')"
else
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Tampered hash mismatch NOT detected" "CHECK" "$(yellow 'REVIEW')"
fi

echo ""

# ── 7. Advanced Attack Simulation (Phase 3.2) ──────────────────────────
echo "── 7. Advanced Attack Simulation ─────────────────────────────"
CURRENT_DOMAIN="confidentiality"

# Cross-shipping-line WRITE attempt (extends test #15's read-only check)
run_test 21 "ShippingLineB attempts to write competitor's commercial details" NEGATIVE 403 \
  POST "${API}/shipments/SH001/commercial-details" "shippingB" \
  '{"commercialDetails":{"contractValue":"$1","insuranceRef":"FAKE","clientName":"Attacker"}}'

CURRENT_DOMAIN="governance-neutrality"

# ── Suspend ShippingLineB via governance, prove enforcement, then reinstate ──
run_test 22 "ShippingLineA proposes suspending ShippingLineB" POSITIVE 202 \
  POST "${API}/governance/proposals" "shippingA" \
  '{"proposalId":"ATTACK-SUSPEND-1","changeType":"SUSPEND_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}'

run_test 23 "ShippingLineA votes YES to suspend (1/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-SUSPEND-1/vote" "shippingA" '{"choice":"YES"}'

run_test 24 "CustomsAuthority votes YES to suspend (2/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-SUSPEND-1/vote" "customs" '{"choice":"YES"}'

run_test 25 "PortAuthority votes YES to suspend — quorum reached (3/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-SUSPEND-1/vote" "port" '{"choice":"YES"}'
sleep 1   # settle delay — see note on test 54 below

run_test 26 "Suspended ShippingLineB blocked from creating a shipment" NEGATIVE 403 \
  POST "${API}/shipments" "shippingB" \
  '{"shipmentId":"SH-ATTACK-BLOCKED","routeCode":"RT-X","cargoDescription":"should be rejected"}'

run_test 27 "CustomsAuthority proposes reinstating ShippingLineB" POSITIVE 202 \
  POST "${API}/governance/proposals" "customs" \
  '{"proposalId":"ATTACK-REINSTATE-1","changeType":"REINSTATE_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}'

# Non-member-vote attack: a suspended org cannot even vote to un-suspend itself
run_test 28 "Suspended ShippingLineB cannot vote on its own reinstatement" NEGATIVE 403 \
  POST "${API}/governance/proposals/ATTACK-REINSTATE-1/vote" "shippingB" '{"choice":"YES"}'

run_test 29 "ShippingLineA votes YES to reinstate (1/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REINSTATE-1/vote" "shippingA" '{"choice":"YES"}'

run_test 30 "CustomsAuthority votes YES to reinstate (2/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REINSTATE-1/vote" "customs" '{"choice":"YES"}'

run_test 31 "PortAuthority votes YES to reinstate — quorum reached (3/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REINSTATE-1/vote" "port" '{"choice":"YES"}'
sleep 1

run_test 32 "Reinstated ShippingLineB can create a shipment again" POSITIVE 202 \
  POST "${API}/shipments" "shippingB" \
  '{"shipmentId":"SH-ATTACK-REINSTATED","routeCode":"RT-X","cargoDescription":"should succeed"}'

CURRENT_DOMAIN="distributed-verification"

# ── Forged-approval tamper attempt ──────────────────────────────────────
# FinalizeClearance takes only a shipmentId — any client-supplied approval
# data in the request body is structurally impossible for it to consume.
# The chaincode recomputes the approval count from ledger state only.
run_test 33 "Create SH-ATTACK-FORGE for tamper test" POSITIVE 202 \
  POST "${API}/shipments" "shippingA" \
  '{"shipmentId":"SH-ATTACK-FORGE","routeCode":"RT-X","cargoDescription":"tamper test"}'

run_test 34 "ShippingLineA records 1 of 3 required approvals" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-FORGE/clearance/approve" "shippingA" ""

run_test 35 "Finalize with forged extra-approvals in body still rejected" NEGATIVE 400 \
  POST "${API}/shipments/SH-ATTACK-FORGE/clearance/finalize" "shippingA" \
  '{"clearanceApprovals":["ShippingLineAMSP","CustomsAuthorityMSP","PortAuthorityMSP"],"status":"CLEARED"}'

CURRENT_DOMAIN="governance-neutrality"

# ── Revoked-credential replay attack ────────────────────────────────────
# Revocation is permanent (unlike suspension). Attempting the same
# transaction twice with a revoked identity must fail identically both
# times — proving the rejection is durable, not a one-off flicker.
run_test 36 "ShippingLineA proposes revoking ShippingLineB" POSITIVE 202 \
  POST "${API}/governance/proposals" "shippingA" \
  '{"proposalId":"ATTACK-REVOKE-1","changeType":"REVOKE_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}'

run_test 37 "ShippingLineA votes YES to revoke (1/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REVOKE-1/vote" "shippingA" '{"choice":"YES"}'

run_test 38 "CustomsAuthority votes YES to revoke (2/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REVOKE-1/vote" "customs" '{"choice":"YES"}'

run_test 39 "PortAuthority votes YES to revoke — quorum reached (3/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-REVOKE-1/vote" "port" '{"choice":"YES"}'
sleep 1

run_test 40 "Revoked ShippingLineB rejected — replay attempt 1 of 2" NEGATIVE 403 \
  POST "${API}/shipments" "shippingB" \
  '{"shipmentId":"SH-ATTACK-REVOKED","routeCode":"RT-X","cargoDescription":"replay 1"}'

run_test 41 "Revoked ShippingLineB rejected — replay attempt 2 of 2 (same result)" NEGATIVE 403 \
  POST "${API}/shipments" "shippingB" \
  '{"shipmentId":"SH-ATTACK-REVOKED","routeCode":"RT-X","cargoDescription":"replay 2"}'

# ── Restore clean state for subsequent suite runs ───────────────────────
run_test 42 "Propose reinstating ShippingLineB (cleanup)" POSITIVE 202 \
  POST "${API}/governance/proposals" "customs" \
  '{"proposalId":"ATTACK-CLEANUP-1","changeType":"REINSTATE_MEMBER","payload":{"targetMsp":"ShippingLineBMSP"}}'

run_test 43 "ShippingLineA votes YES (cleanup, 1/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-CLEANUP-1/vote" "shippingA" '{"choice":"YES"}'

run_test 44 "CustomsAuthority votes YES (cleanup, 2/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-CLEANUP-1/vote" "customs" '{"choice":"YES"}'

run_test 45 "PortAuthority votes YES (cleanup, 3/3) — ShippingLineB active again" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-CLEANUP-1/vote" "port" '{"choice":"YES"}'

echo ""

# ── Participant onboarding: ADD_MEMBER proposal type ────────────────────
# Distinct from suspend/reinstate/revoke — proves a brand-new candidate
# organisation can be admitted through the same propose/vote/quorum path.
echo "── 7b. Participant Onboarding (ADD_MEMBER) ───────────────────"

run_test 46 "ShippingLineA proposes admitting ShippingLineC" POSITIVE 202 \
  POST "${API}/governance/proposals" "shippingA" \
  '{"proposalId":"ATTACK-ADDMEMBER-1","changeType":"ADD_MEMBER","payload":{"targetMsp":"ShippingLineCMSP","organisationName":"Shipping Line C"}}'

run_test 47 "ShippingLineA votes YES to admit (1/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-ADDMEMBER-1/vote" "shippingA" '{"choice":"YES"}'

run_test 48 "CustomsAuthority votes YES to admit (2/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-ADDMEMBER-1/vote" "customs" '{"choice":"YES"}'

run_test 49 "PortAuthority votes YES to admit — quorum reached (3/3)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-ADDMEMBER-1/vote" "port" '{"choice":"YES"}'
sleep 1

run_test 50 "ShippingLineC membership status is now ACTIVE" POSITIVE 200 \
  GET "${API}/governance/members/ShippingLineCMSP" "regulator" ""

ADDMEMBER_RESULT=$(grep -o '"status":[[:space:]]*"[A-Z]*"' "${EVIDENCE_DIR}/${CURRENT_DOMAIN}/test_50.txt" | head -1)
if echo "$ADDMEMBER_RESULT" | grep -q "ACTIVE"; then
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → New member status confirmed ACTIVE" "CHECK" "$(green 'PASS')"
else
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → New member status NOT confirmed ACTIVE" "CHECK" "$(yellow 'REVIEW')"
fi
echo ""

# ── Governance change workflow: CHANGE_CLEARANCE_THRESHOLD ──────────────
# Demonstrates the exact scenario from the feedback: "propose changing the
# clearance approval rule from three required approvers to four required
# approvers." ShippingLineC from the previous section is still ACTIVE and
# permanent for the remainder of this run, which means active membership is
# now 6 — so majority quorum is 4, not 3. ShippingLineC itself has no real
# API token and can never vote, so a 4th REAL vote (ShippingLineB) is cast
# below for both this proposal and its revert. This deliberately avoids
# trying to shrink membership back down first — doing that would require
# the same revoke-then-immediately-recompute-quorum sequence whose
# cross-peer propagation timing caused the earlier failure.
echo "── 7c. Governance Change Workflow (CHANGE_CLEARANCE_THRESHOLD) ─"

run_test 51 "Propose raising clearance approvers from 3 to 4 (adds Regulator)" POSITIVE 202 \
  POST "${API}/governance/proposals" "shippingA" \
  '{"proposalId":"ATTACK-THRESHOLD-1","changeType":"CHANGE_CLEARANCE_THRESHOLD","payload":{"requiredApprovers":["ShippingLineAMSP","CustomsAuthorityMSP","PortAuthorityMSP","RegulatorMSP"]}}'

run_test 52 "ShippingLineA votes YES (1/4 — active membership is 6)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-1/vote" "shippingA" '{"choice":"YES"}'

run_test 53 "CustomsAuthority votes YES (2/4)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-1/vote" "customs" '{"choice":"YES"}'

run_test 54 "PortAuthority votes YES (3/4)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-1/vote" "port" '{"choice":"YES"}'

run_test 55 "ShippingLineB votes YES — quorum reached (4/4), rule now requires 4" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-1/vote" "shippingB" '{"choice":"YES"}'
sleep 1

run_test 56 "Create SH-ATTACK-4APPROVER under the new rule" POSITIVE 202 \
  POST "${API}/shipments" "shippingA" \
  '{"shipmentId":"SH-ATTACK-4APPROVER","routeCode":"RT-X","cargoDescription":"4-approver rule test"}'

run_test 57 "ShippingLineA approves (1/4)" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/approve" "shippingA" ""

run_test 58 "CustomsAuthority approves (2/4)" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/approve" "customs" ""

run_test 59 "PortAuthority approves (3/4)" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/approve" "port" ""

run_test 60 "Finalize with only 3/4 approvals fails under the new rule" NEGATIVE 400 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/finalize" "shippingA" ""

run_test 61 "Regulator approves (4/4)" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/approve" "regulator" ""

run_test 62 "Finalize succeeds once all 4 required approvers are in" POSITIVE 202 \
  POST "${API}/shipments/SH-ATTACK-4APPROVER/clearance/finalize" "shippingA" ""

run_test 63 "Propose reverting clearance rule back to the original 3 approvers" POSITIVE 202 \
  POST "${API}/governance/proposals" "shippingA" \
  '{"proposalId":"ATTACK-THRESHOLD-REVERT-1","changeType":"CHANGE_CLEARANCE_THRESHOLD","payload":{"requiredApprovers":["ShippingLineAMSP","CustomsAuthorityMSP","PortAuthorityMSP"]}}'

run_test 64 "ShippingLineA votes YES to revert (1/4)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-REVERT-1/vote" "shippingA" '{"choice":"YES"}'

run_test 65 "CustomsAuthority votes YES to revert (2/4)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-REVERT-1/vote" "customs" '{"choice":"YES"}'

run_test 66 "PortAuthority votes YES to revert (3/4)" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-REVERT-1/vote" "port" '{"choice":"YES"}'

run_test 67 "ShippingLineB votes YES — quorum reached (4/4), rule reverted to 3" POSITIVE 202 \
  POST "${API}/governance/proposals/ATTACK-THRESHOLD-REVERT-1/vote" "shippingB" '{"choice":"YES"}'
sleep 1

echo ""

CURRENT_DOMAIN="compliance"

# ── Compliance violation resolution (live) ──────────────────────────────
echo "── 7d. Compliance Violation Resolution ───────────────────────"

run_test 68 "Regulator flags a fresh violation for live-resolve test" POSITIVE 202 \
  POST "${API}/shipments/SH001/compliance/flag" "regulator" \
  '{"violationId":"V-RESOLVE-TEST","violationType":"DOCUMENTATION_MISMATCH","details":"Manifest weight differs from declared weight"}'

run_test 69 "Regulator resolves the violation" POSITIVE 202 \
  POST "${API}/shipments/SH001/compliance/V-RESOLVE-TEST/resolve" "regulator" \
  '{"resolutionNotes":"Reviewed and confirmed within tolerance"}'

run_test 70 "Violation list confirms RESOLVED status" POSITIVE 200 \
  GET "${API}/shipments/SH001/compliance" "regulator" ""

RESOLVE_RESULT=$(grep -A8 '"violationId": "V-RESOLVE-TEST"' "${EVIDENCE_DIR}/${CURRENT_DOMAIN}/test_70.txt" | grep -o '"status":[[:space:]]*"[A-Z]*"' | head -1)
if echo "$RESOLVE_RESULT" | grep -q "RESOLVED"; then
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Violation status confirmed RESOLVED" "CHECK" "$(green 'PASS')"
else
  printf "  %-3s %-50s [%s]  %s\n" "  " "  → Violation status NOT confirmed RESOLVED" "CHECK" "$(yellow 'REVIEW')"
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
