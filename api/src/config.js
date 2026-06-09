'use strict';

module.exports = {
  port: process.env.PORT || 8080,
  channelName: process.env.FABRIC_CHANNEL || 'operations',
  chaincodeName: process.env.FABRIC_CHAINCODE || 'maritime-consortium',
  cryptoPath: process.env.CRYPTO_PATH || '/crypto',
  storagePath: process.env.STORAGE_PATH || '/storage',

  // Organisation → peer endpoint and domain mapping
  orgConfig: {
    ShippingLineAMSP: {
      peerEndpoint: 'peer0.shipping-line-a.example.com:7051',
      peerHostAlias: 'peer0.shipping-line-a.example.com',
      domain: 'shipping-line-a.example.com'
    },
    ShippingLineBMSP: {
      peerEndpoint: 'peer0.shipping-line-b.example.com:7051',
      peerHostAlias: 'peer0.shipping-line-b.example.com',
      domain: 'shipping-line-b.example.com'
    },
    PortAuthorityMSP: {
      peerEndpoint: 'peer0.port-authority.example.com:7051',
      peerHostAlias: 'peer0.port-authority.example.com',
      domain: 'port-authority.example.com'
    },
    CustomsAuthorityMSP: {
      peerEndpoint: 'peer0.customs-authority.example.com:7051',
      peerHostAlias: 'peer0.customs-authority.example.com',
      domain: 'customs-authority.example.com'
    },
    RegulatorMSP: {
      peerEndpoint: 'peer0.regulator.example.com:7051',
      peerHostAlias: 'peer0.regulator.example.com',
      domain: 'regulator.example.com'
    }
  }
};
