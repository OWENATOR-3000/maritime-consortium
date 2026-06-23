#!/bin/bash
# ---------------------------------------------------------------------------
# fault-tolerance-test.sh — Proves RAFT orderer resilience under node failure.
#
# 3-orderer RAFT cluster (Port Authority, Customs Authority, Regulator):
# quorum is a majority of the configured cluster size (3), i.e. 2 alive nodes.
#
#   - Stop 1 orderer  -> 2/3 alive -> quorum intact -> writes MUST still succeed
#   - Stop 2 orderers -> 1/3 alive -> quorum lost   -> writes MUST fail/hang
#   - Restart both    -> 3/3 alive -> quorum restored -> writes succeed again
#
# Run against a live system (bash start.sh first). Evidence for each step is
# saved to tests/evidence/fault-tolerance/.
# ---------------------------------------------------------------------------
set -uo pipefail   # no -e: some curl calls are expected to fail on purpose

API="http://localhost:8080"
EVIDENCE_DIR="$(cd "$(dirname "$0")" && pwd)/evidence/fault-tolerance"
rm -rf "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

ORDERER_REGULATOR="orderer0.regulator.example.com"
ORDERER_CUSTOMS="orderer0.customs-authority.example.com"
# orderer0.port-authority.example.com is left running throughout

PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }

# submit_test NAME EXPECT(success|failure) SHIPMENT_ID
submit_test() {
  local NAME="$1" EXPECT="$2" SID="$3"
  local RESP CODE GOT

  RESP=$(curl -s --max-time 25 -w '\n%{http_code}' -X POST "$API/shipments" \
    -H "Authorization: Bearer shippingA" -H "Content-Type: application/json" \
    -d "{\"shipmentId\":\"$SID\",\"routeCode\":\"RT-FT\",\"cargoDescription\":\"fault tolerance test\"}" 2>&1)
  CODE=$(echo "$RESP" | tail -1)
  echo "$RESP" > "${EVIDENCE_DIR}/${SID}.txt"

  GOT="failure"
  [ "$CODE" = "202" ] && GOT="success"

  if [ "$GOT" = "$EXPECT" ]; then
    PASS=$((PASS + 1))
    printf "  %-60s %s (http=%s)\n" "$NAME" "$(green PASS)" "${CODE:-none}"
  else
    FAIL=$((FAIL + 1))
    printf "  %-60s %s (expected %s, http=%s)\n" "$NAME" "$(red FAIL)" "$EXPECT" "${CODE:-none}"
  fi
}

wait_for_settle() {
  echo "  Waiting ${1}s for RAFT cluster state to settle..."
  sleep "$1"
}

echo ""
echo "── Fault-Tolerance Test: 3-Orderer RAFT Cluster ───────────────────"
echo ""

echo "Step 0 — Baseline (all 3 orderers up)"
submit_test "Baseline transaction succeeds with full cluster" success "SH-FT-BASELINE"
echo ""

echo "Step 1 — Stop 1 of 3 orderers (${ORDERER_REGULATOR}) — quorum (2/3) intact"
docker stop "$ORDERER_REGULATOR" > /dev/null 2>&1
wait_for_settle 15
submit_test "Transaction succeeds with 2/3 orderers (quorum held)" success "SH-FT-2OF3"
echo ""

echo "Step 2 — Stop a 2nd orderer (${ORDERER_CUSTOMS}) — quorum (1/3) lost"
docker stop "$ORDERER_CUSTOMS" > /dev/null 2>&1
wait_for_settle 15
submit_test "Transaction fails with 1/3 orderers (no quorum)" failure "SH-FT-1OF3"
echo ""

echo "Step 3 — Restart both stopped orderers — quorum restored"
docker start "$ORDERER_REGULATOR" > /dev/null 2>&1
docker start "$ORDERER_CUSTOMS" > /dev/null 2>&1
wait_for_settle 20
submit_test "Transaction succeeds again after recovery (3/3 orderers)" success "SH-FT-RECOVERED"
echo ""

echo "── Summary ─────────────────────────────────────────────────────────"
echo "  Passed: $(green "$PASS")   Failed: $([ "$FAIL" -gt 0 ] && red "$FAIL" || echo "$FAIL")"
echo "  Evidence saved to: tests/evidence/fault-tolerance/"
echo ""

[ "$FAIL" -eq 0 ]
