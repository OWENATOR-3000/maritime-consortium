#!/bin/bash
# ---------------------------------------------------------------------------
# setup-channel.sh — Join orderers and peers to the operations channel.
# Runs inside the CLI container.
# ---------------------------------------------------------------------------
set -euo pipefail

. scripts/env.sh

CHANNEL_NAME=operations
BLOCK_FILE=channel-artifacts/operations.block

echo "============================================================"
echo " Joining orderers to channel: ${CHANNEL_NAME}"
echo "============================================================"

join_orderer() {
  local ORDERER_HOST=$1
  local ORDERER_ADMIN_PORT=$2
  local ORDERER_DOMAIN=$3

  local ADMIN_TLS_CERT=${ORDERER_BASE}/${ORDERER_DOMAIN}/users/Admin@${ORDERER_DOMAIN}/tls/client.crt
  local ADMIN_TLS_KEY=${ORDERER_BASE}/${ORDERER_DOMAIN}/users/Admin@${ORDERER_DOMAIN}/tls/client.key
  # Use the org-level MSP tlscacerts path — same certificate, but cryptogen
  # always generates this path reliably (tls/ca.crt can be absent on some runs).
  local ORDERER_TLS_CA=${ORDERER_BASE}/${ORDERER_DOMAIN}/orderers/${ORDERER_HOST}/msp/tlscacerts/tlsca.${ORDERER_DOMAIN}-cert.pem

  echo "  → Joining ${ORDERER_HOST} ..."

  osnadmin channel join \
    --channelID "${CHANNEL_NAME}" \
    --config-block "${BLOCK_FILE}" \
    -o "${ORDERER_HOST}:${ORDERER_ADMIN_PORT}" \
    --ca-file "${ORDERER_TLS_CA}" \
    --client-cert "${ADMIN_TLS_CERT}" \
    --client-key "${ADMIN_TLS_KEY}"

  echo "    ✓ ${ORDERER_HOST} joined"
}

join_orderer orderer0.port-authority.example.com     7053 port-authority.example.com
join_orderer orderer0.customs-authority.example.com  7053 customs-authority.example.com
join_orderer orderer0.regulator.example.com          7053 regulator.example.com

echo ""
echo "============================================================"
echo " Joining peers to channel: ${CHANNEL_NAME}"
echo "============================================================"

# Wait a moment for RAFT leader election
sleep 3

for ORG in $ORGS; do
  setGlobals "$ORG"
  echo "  → Joining peer as ${ORG} ..."

  peer channel join \
    -b "${BLOCK_FILE}" \
    -o "${ORDERER_ENDPOINT}" \
    --tls \
    --cafile "${ORDERER_CA_PORT_AUTHORITY}"

  echo "    ✓ ${ORG} peer joined"
done

echo ""
echo "============================================================"
echo " Channel setup complete"
echo "============================================================"

# Verify — list channels on each peer
for ORG in $ORGS; do
  setGlobals "$ORG"
  echo "  ${ORG} channels:"
  peer channel list
done
