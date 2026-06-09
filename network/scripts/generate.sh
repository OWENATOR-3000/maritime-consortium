#!/bin/bash
# ---------------------------------------------------------------------------
# generate.sh — Generate crypto material and channel genesis block.
# Run OUTSIDE Docker (invoked by start.sh using fabric-tools image).
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================================"
echo " Generating crypto material"
echo "============================================================"

# Clean previous artifacts
rm -rf "${NETWORK_DIR}/organizations"
rm -rf "${NETWORK_DIR}/channel-artifacts"
mkdir -p "${NETWORK_DIR}/channel-artifacts"

# Generate crypto material with cryptogen
cryptogen generate \
  --config="${NETWORK_DIR}/crypto-config.yaml" \
  --output="${NETWORK_DIR}/organizations"

echo "  ✓ Crypto material generated"

echo "============================================================"
echo " Generating channel genesis block"
echo "============================================================"

# Generate the application channel genesis block
configtxgen \
  -profile OperationsChannel \
  -outputBlock "${NETWORK_DIR}/channel-artifacts/operations.block" \
  -channelID operations \
  -configPath "${NETWORK_DIR}"

echo "  ✓ Channel genesis block created"
echo "============================================================"
echo " Generation complete"
echo "============================================================"
