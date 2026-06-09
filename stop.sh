#!/bin/bash
# ---------------------------------------------------------------------------
# stop.sh — Tear down the Maritime Consortium prototype.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="${ROOT_DIR}/network/docker"

echo ""
echo "──────────────────────────────────────────────────────────────"
echo " Stopping Maritime Consortium prototype"
echo "──────────────────────────────────────────────────────────────"

# Stop and remove containers, volumes
docker compose -f "${DOCKER_DIR}/docker-compose.yaml" down -v 2>/dev/null || true

# Remove any chaincode containers
docker ps -aq --filter "name=dev-peer" 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true

# Remove any chaincode images
docker images -q "dev-peer*" 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true

# Clean generated crypto material and artifacts
rm -rf "${ROOT_DIR}/network/organizations"
rm -rf "${ROOT_DIR}/network/channel-artifacts"

echo "  ✓ All containers, volumes, and generated material removed"
echo ""
