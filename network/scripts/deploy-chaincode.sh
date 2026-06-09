#!/bin/bash
# ---------------------------------------------------------------------------
# deploy-chaincode.sh — Package, install, approve, and commit chaincode.
# Runs inside the CLI container.
# ---------------------------------------------------------------------------
set -euo pipefail

. scripts/env.sh

CHANNEL_NAME=operations
CC_NAME=maritime-consortium
CC_VERSION=1.0
CC_SEQUENCE=1
CC_SRC_PATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/chaincode/maritime-consortium
CC_LABEL="${CC_NAME}_${CC_VERSION}"
COLLECTIONS_CONFIG=collections/shipping-line-a-private-details.json
CC_ENDORSEMENT_POLICY="OR('ShippingLineAMSP.peer','ShippingLineBMSP.peer','PortAuthorityMSP.peer','CustomsAuthorityMSP.peer','RegulatorMSP.peer')"

echo "============================================================"
echo " Packaging chaincode: ${CC_LABEL}"
echo "============================================================"

peer lifecycle chaincode package "${CC_LABEL}.tar.gz" \
  --path "${CC_SRC_PATH}" \
  --lang node \
  --label "${CC_LABEL}"

echo "  ✓ Chaincode packaged"

echo "============================================================"
echo " Installing chaincode on all peers"
echo "============================================================"

for ORG in $ORGS; do
  setGlobals "$ORG"
  echo "  → Installing on ${ORG} ..."
  set +e
  INSTALL_OUTPUT=$(peer lifecycle chaincode install "${CC_LABEL}.tar.gz" 2>&1)
  INSTALL_RC=$?
  set -e
  if [ $INSTALL_RC -ne 0 ]; then
    if echo "$INSTALL_OUTPUT" | grep -q "already successfully installed"; then
      echo "    ✓ ${ORG} already installed (skipped)"
    else
      echo "$INSTALL_OUTPUT"
      exit 1
    fi
  else
    echo "    ✓ ${ORG} installed"
  fi
done

echo "============================================================"
echo " Querying installed chaincode (getting package ID)"
echo "============================================================"

setGlobals ShippingLineA
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled --output json | \
  tr -d '\n\t ' | grep -o '"package_id":"[^"]*"' | head -1 | sed 's/"package_id":"//;s/"//')

if [ -z "$PACKAGE_ID" ]; then
  echo "ERROR: Could not find package ID for label ${CC_LABEL}"
  exit 1
fi

echo "  Package ID: ${PACKAGE_ID}"

echo "============================================================"
echo " Approving chaincode for each organization"
echo "============================================================"

for ORG in $ORGS; do
  setGlobals "$ORG"
  echo "  → Approving for ${ORG} ..."

  peer lifecycle chaincode approveformyorg \
    -o "${ORDERER_ENDPOINT}" \
    --tls \
    --cafile "${ORDERER_CA_PORT_AUTHORITY}" \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --package-id "${PACKAGE_ID}" \
    --sequence "${CC_SEQUENCE}" \
    --collections-config "${COLLECTIONS_CONFIG}" \
    --signature-policy "${CC_ENDORSEMENT_POLICY}"

  echo "    ✓ ${ORG} approved"
done

echo "============================================================"
echo " Checking commit readiness"
echo "============================================================"

setGlobals ShippingLineA
peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence "${CC_SEQUENCE}" \
  --collections-config "${COLLECTIONS_CONFIG}" \
  --signature-policy "${CC_ENDORSEMENT_POLICY}" \
  --output json

echo ""
echo "============================================================"
echo " Committing chaincode definition"
echo "============================================================"

# Build --peerAddresses and --tlsRootCertFiles for all peers
PEER_CONN_PARAMS=""
for ORG in $ORGS; do
  setGlobals "$ORG"
  PEER_CONN_PARAMS="${PEER_CONN_PARAMS} --peerAddresses ${CORE_PEER_ADDRESS}"
  PEER_CONN_PARAMS="${PEER_CONN_PARAMS} --tlsRootCertFiles ${CORE_PEER_TLS_ROOTCERT_FILE}"
done

setGlobals ShippingLineA
peer lifecycle chaincode commit \
  -o "${ORDERER_ENDPOINT}" \
  --tls \
  --cafile "${ORDERER_CA_PORT_AUTHORITY}" \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence "${CC_SEQUENCE}" \
  --collections-config "${COLLECTIONS_CONFIG}" \
  --signature-policy "${CC_ENDORSEMENT_POLICY}" \
  ${PEER_CONN_PARAMS}

echo "  ✓ Chaincode committed"

echo ""
echo "============================================================"
echo " Verifying deployment"
echo "============================================================"

peer lifecycle chaincode querycommitted \
  --channelID "${CHANNEL_NAME}" \
  --name "${CC_NAME}" \
  --output json

echo ""
echo "============================================================"
echo " Chaincode deployment complete!"
echo "============================================================"
