'use strict';
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

/**
 * Shared base for all maritime workloads.
 * Provides unique shipment IDs per worker/round and helpers for
 * pre-creating shipments during initialization.
 */
class MaritimeBase extends WorkloadModuleBase {
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.txCounter = 0;
    // Timestamp makes IDs unique across benchmark runs (chaincode rejects duplicate shipment IDs)
    this.prefix = `R${roundIndex}W${workerIndex}_${Date.now().toString(36)}`;
  }

  nextShipmentId() {
    this.txCounter += 1;
    return `BENCH_${this.prefix}_${this.txCounter}`;
  }

  currentShipmentId() {
    return `BENCH_${this.prefix}_${this.txCounter}`;
  }

  async createShipment(shipmentId) {
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'CreateShipment',
      contractArguments: [shipmentId, 'WVB-RTM', 'Benchmark cargo'],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }

  async approveAll(shipmentId) {
    const approvers = [
      ['UserA', 'ShippingLineAMSP'],
      ['UserCustoms', 'CustomsAuthorityMSP'],
      ['UserPort', 'PortAuthorityMSP']
    ];
    for (const [identity, msp] of approvers) {
      await this.sutAdapter.sendRequests({
        contractId: 'maritime-consortium',
        contractFunction: 'ApproveClearance',
        contractArguments: [shipmentId],
        invokerIdentity: identity,
        invokerMspId: msp,
        readOnly: false
      });
    }
  }

  randomHash() {
    return crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
  }
}
module.exports.MaritimeBase = MaritimeBase;
