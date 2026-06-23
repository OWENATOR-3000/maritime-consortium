#!/bin/bash
# =============================================================================
# scenario-4-interoperability.sh
# Chapter 6 — Section 6.3.4: Interoperability and Legacy System Integration
#
# Demonstrates: three external non-blockchain systems (an ERP, a Customs
# declaration system, and a Port Terminal Operating System) integrate through
# the existing API gateway with no special access path — the same bearer
# token / REST interface used by all other participants.
#
# All cross-system synchronisation is validated end-to-end.
# =============================================================================
set -euo pipefail

API="http://localhost:8080"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }
yellow(){ printf "\033[33m%s\033[0m" "$1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Chapter 6 — Scenario 6.3.4: Interoperability and Legacy       ║"
echo "║  System Integration                                             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  External systems simulated:"
echo "    1. ERP System         — initiates cargo booking"
echo "    2. Customs System     — submits customs declaration, approves clearance"
echo "    3. Port TOS           — approves berth/terminal scheduling"
echo ""
echo "  All systems use the same REST API gateway — no special blockchain"
echo "  access path. Integration is standards-based (HTTP/JSON)."
echo ""

# ── Pre-check: API must be reachable ─────────────────────────────────────
echo "── Pre-check: API gateway reachable ──"

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${API}/health" 2>&1) || true
if [ "$HEALTH" = "200" ]; then
  printf "  API health check  %s\n\n" "$(green PASS)"
else
  printf "  API health check  %s (got %s — is the network running?)\n\n" "$(red FAIL)" "$HEALTH"
  echo "  Start the network first: bash start.sh"
  exit 1
fi

# ── Run the external systems simulation ───────────────────────────────────
echo "── Running external systems simulation ──"
echo ""

if ! command -v node &> /dev/null; then
  echo "$(red 'ERROR: node not found') — Node.js is required to run this scenario."
  exit 1
fi

node "${SCRIPT_DIR}/external-systems-simulation.js"
SIM_EXIT=$?

echo ""

# ── Result ────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════════════╗"
if [ "$SIM_EXIT" -eq 0 ]; then
  echo "║  Scenario 6.3.4 Result:  $(green 'ALL PASS')"
  echo "║"
  echo "║  Cross-system synchronisation validated:"
  echo "║    ✓  ERP submitted cargo booking → blockchain accepted"
  echo "║    ✓  Customs system submitted declaration → clearance approved"
  echo "║    ✓  Port TOS submitted approval → terminal scheduling recorded"
  echo "║    ✓  Full shipment lifecycle completed end-to-end"
  echo "║    ✓  All systems used standard HTTP/JSON — no special access path"
else
  echo "║  Scenario 6.3.4 Result:  $(red 'FAILED') (exit code: ${SIM_EXIT})"
  echo "║  Check that the network is running: bash start.sh"
fi
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
