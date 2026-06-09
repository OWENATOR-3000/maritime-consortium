#!/bin/bash
# ---------------------------------------------------------------------------
# start.sh — Master script to bring up the Maritime Consortium prototype.
#
# Usage:  bash start.sh
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="${ROOT_DIR}/network"
DOCKER_DIR="${NETWORK_DIR}/docker"
FABRIC_TOOLS_IMAGE="hyperledger/fabric-tools:2.5"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Maritime Consortium Blockchain Prototype            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Generate crypto material ─────────────────────────────────

echo "──────────────────────────────────────────────────────────────"
echo " Step 1: Generating crypto material and genesis block"
echo "──────────────────────────────────────────────────────────────"

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${NETWORK_DIR}:/config" \
  -w /config \
  "${FABRIC_TOOLS_IMAGE}" \
  bash /config/scripts/generate.sh

echo ""

# ── Step 2: Start Docker network ────────────────────────────────────

echo "──────────────────────────────────────────────────────────────"
echo " Step 2: Starting Docker containers"
echo "──────────────────────────────────────────────────────────────"

docker compose -f "${DOCKER_DIR}/docker-compose.yaml" up -d

echo "  Waiting 10s for containers to initialize..."
sleep 10
echo ""

# ── Step 3: Create channel and join peers ────────────────────────────

echo "──────────────────────────────────────────────────────────────"
echo " Step 3: Setting up channel"
echo "──────────────────────────────────────────────────────────────"

docker exec cli bash scripts/setup-channel.sh
echo ""

# ── Step 4: Deploy chaincode ────────────────────────────────────────

echo "──────────────────────────────────────────────────────────────"
echo " Step 4: Deploying chaincode"
echo "──────────────────────────────────────────────────────────────"

docker exec cli bash scripts/deploy-chaincode.sh
echo ""

# ── Step 5: Wait for API ────────────────────────────────────────────

echo "──────────────────────────────────────────────────────────────"
echo " Step 5: Waiting for API gateway"
echo "──────────────────────────────────────────────────────────────"

for i in $(seq 1 30); do
  if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "  ✓ API gateway is ready at http://localhost:8080"
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 2
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Prototype is running!                                      ║"
echo "║                                                             ║"
echo "║  API Gateway:  http://localhost:8080                        ║"
echo "║  Health Check: http://localhost:8080/health                 ║"
echo "║                                                             ║"
echo "║  Run tests:    bash tests/run-tests.sh                     ║"
echo "║  Stop:         bash stop.sh                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
