'use strict';
const { MaritimeBase } = require('./base');

/** Creates one shipment, then repeatedly queries it (world-state read). */
class GetShipmentWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    this.queryId = `BENCH_${this.prefix}_Q`;
    await this.createShipment(this.queryId);
  }

  async submitTransaction() {
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'GetShipment',
      contractArguments: [this.queryId],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: true
    });
  }
}
module.exports.createWorkloadModule = () => new GetShipmentWorkload();
