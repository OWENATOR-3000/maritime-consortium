'use strict';

const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { channelName, chaincodeName, cryptoPath, orgConfig } = require('./config');

class FabricClient {
  /**
   * Submit a transaction (write to ledger).
   */
  async submitTransaction(identity, fn, ...args) {
    const { gateway, contract } = await this._connectGateway(identity);
    try {
      const resultBytes = await contract.submitTransaction(fn, ...args);
      return this._decode(resultBytes);
    } finally {
      gateway.close();
    }
  }

  /**
   * Submit a transaction with transient data (for private data collections).
   *
   * We restrict endorsement to the caller's own organisation so that the
   * private data preimage is stored on that org's peer.  Without this pin the
   * Fabric Gateway service may endorse on any peer satisfying the OR policy;
   * if it picks a non-collection-member or a peer from a different org, that
   * peer stores the preimage and the caller's peer never receives the private
   * data — causing subsequent getPrivateData() calls to return empty.
   */
  async submitWithTransient(identity, fn, args, transientData) {
    const { gateway, contract } = await this._connectGateway(identity);
    try {
      const proposal = contract.newProposal(fn, {
        arguments: args,
        transientData,
        endorsingOrganizations: [identity.org]
      });
      const txn = await proposal.endorse();
      const committed = await txn.submit();
      // CRITICAL: wait for block commit before returning.
      // txn.submit() only delivers to the orderer; the private data is not
      // written to pvtdataStore until the block actually commits on the peer.
      // Without this, subsequent reads race against an uncommitted block.
      const status = await committed.getStatus();
      if (!status.successful) {
        throw new Error(
          `Transaction ${committed.getTransactionId()} failed to commit with status: ${status.code}`
        );
      }
      return this._decode(committed.getResult());
    } finally {
      gateway.close();
    }
  }

  /**
   * Evaluate a transaction (read-only query).
   */
  /**
   * Evaluate a transaction (read-only query).
   *
   * The Fabric Gateway service's Evaluate RPC uses service discovery to route
   * queries to ANY peer satisfying the chaincode's OR endorsement policy.
   * For private-data reads this is fatal: a non-collection-member peer (e.g.
   * ShippingLineB) has no copy of the private data and getPrivateData() returns
   * empty, causing the chaincode to throw "No commercial details exist".
   *
   * Workaround: build the proposal with endorsingOrganizations restricted to
   * the caller's own org, then call endorse() — which DOES honour that hint —
   * and extract the chaincode result from the endorsed (but never submitted)
   * transaction.  This pins execution to the caller's peer without writing
   * anything to the orderer or ledger.
   */
  async evaluateTransaction(identity, fn, ...args) {
    const { gateway, contract } = await this._connectGateway(identity);
    try {
      const proposal = contract.newProposal(fn, {
        arguments: args,
        endorsingOrganizations: [identity.org]
      });
      // endorse() honours endorsingOrganizations; evaluate() does not.
      // We read getResult() from the endorsed transaction and discard it
      // (never call submit()) so nothing is written to the ledger.
      const transaction = await proposal.endorse();
      return this._decode(transaction.getResult());
    } finally {
      gateway.close();
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────

  async _connectGateway(identity) {
    const org = orgConfig[identity.org];
    if (!org) {
      throw new Error(`Unknown organization: ${identity.org}`);
    }

    // Load TLS CA certificate for the peer
    const tlsCertPath = path.join(
      cryptoPath,
      'peerOrganizations', org.domain,
      'peers', org.peerHostAlias,
      'tls', 'ca.crt'
    );
    const tlsRootCert = fs.readFileSync(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

    // Create gRPC client
    const grpcClient = new grpc.Client(org.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': org.peerHostAlias
    });

    // Load user signing identity
    const userDir = path.join(
      cryptoPath,
      'peerOrganizations', org.domain,
      'users', `User1@${org.domain}`
    );

    // Certificate
    const certDir = path.join(userDir, 'msp', 'signcerts');
    const certFile = fs.readdirSync(certDir)[0];
    const certificate = fs.readFileSync(path.join(certDir, certFile));

    // Private key
    const keyDir = path.join(userDir, 'msp', 'keystore');
    const keyFile = fs.readdirSync(keyDir)[0];
    const privateKey = crypto.createPrivateKey(
      fs.readFileSync(path.join(keyDir, keyFile))
    );

    // Connect to gateway
    const gateway = connect({
      client: grpcClient,
      identity: {
        mspId: identity.org,
        credentials: certificate
      },
      signer: signers.newPrivateKeySigner(privateKey),
      evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 10000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 120000 })
    });

    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    return { gateway, contract };
  }

  _decode(bytes) {
    const str = Buffer.from(bytes).toString('utf8');
    if (!str) return {};
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }
}

module.exports = FabricClient;
