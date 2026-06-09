#!/bin/bash
# ---------------------------------------------------------------------------
# env.sh — helper functions for switching peer / orderer context
# Source this file: . /opt/.../scripts/env.sh
# ---------------------------------------------------------------------------

ORDERER_CA_PORT_AUTHORITY=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/port-authority.example.com/orderers/orderer0.port-authority.example.com/msp/tlscacerts/tlsca.port-authority.example.com-cert.pem
ORDERER_CA_CUSTOMS_AUTHORITY=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/customs-authority.example.com/orderers/orderer0.customs-authority.example.com/msp/tlscacerts/tlsca.customs-authority.example.com-cert.pem

ORDERER_ENDPOINT=orderer0.port-authority.example.com:7050

PEER_BASE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations
ORDERER_BASE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations

setGlobals() {
  local ORG=$1
  case $ORG in
    ShippingLineA)
      export CORE_PEER_LOCALMSPID="ShippingLineAMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE=${PEER_BASE}/shipping-line-a.example.com/peers/peer0.shipping-line-a.example.com/tls/ca.crt
      export CORE_PEER_MSPCONFIGPATH=${PEER_BASE}/shipping-line-a.example.com/users/Admin@shipping-line-a.example.com/msp
      export CORE_PEER_ADDRESS=peer0.shipping-line-a.example.com:7051
      ;;
    ShippingLineB)
      export CORE_PEER_LOCALMSPID="ShippingLineBMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE=${PEER_BASE}/shipping-line-b.example.com/peers/peer0.shipping-line-b.example.com/tls/ca.crt
      export CORE_PEER_MSPCONFIGPATH=${PEER_BASE}/shipping-line-b.example.com/users/Admin@shipping-line-b.example.com/msp
      export CORE_PEER_ADDRESS=peer0.shipping-line-b.example.com:7051
      ;;
    PortAuthority)
      export CORE_PEER_LOCALMSPID="PortAuthorityMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE=${PEER_BASE}/port-authority.example.com/peers/peer0.port-authority.example.com/tls/ca.crt
      export CORE_PEER_MSPCONFIGPATH=${PEER_BASE}/port-authority.example.com/users/Admin@port-authority.example.com/msp
      export CORE_PEER_ADDRESS=peer0.port-authority.example.com:7051
      ;;
    CustomsAuthority)
      export CORE_PEER_LOCALMSPID="CustomsAuthorityMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE=${PEER_BASE}/customs-authority.example.com/peers/peer0.customs-authority.example.com/tls/ca.crt
      export CORE_PEER_MSPCONFIGPATH=${PEER_BASE}/customs-authority.example.com/users/Admin@customs-authority.example.com/msp
      export CORE_PEER_ADDRESS=peer0.customs-authority.example.com:7051
      ;;
    Regulator)
      export CORE_PEER_LOCALMSPID="RegulatorMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE=${PEER_BASE}/regulator.example.com/peers/peer0.regulator.example.com/tls/ca.crt
      export CORE_PEER_MSPCONFIGPATH=${PEER_BASE}/regulator.example.com/users/Admin@regulator.example.com/msp
      export CORE_PEER_ADDRESS=peer0.regulator.example.com:7051
      ;;
    *)
      echo "Unknown org: $ORG"
      exit 1
      ;;
  esac
}

ORGS="ShippingLineA ShippingLineB PortAuthority CustomsAuthority Regulator"
