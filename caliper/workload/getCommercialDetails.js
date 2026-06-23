'use strict';
const { MaritimeBase } = require('./base');

/** Creates one shipment with private details, then repeatedly reads from the private data collection. */
class GetCommercialDetailsWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    this.queryId = `BENCH_${this.prefix}_PQ`;
    await this.createShipment(this.queryId);
    const payload = JSON.stringify({ contractValue: 99000, negotiatedRate: 'R1', consignee: 'X' });
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'SubmitCommercialDetails',
      contractArguments: [this.queryId],
      transientMap: { commercialDetails: Buffer.from(payload) },
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }

  async submitTransaction() {
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'GetCommercialDetails',
      contractArguments: [this.queryId],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: true
    });
  }
}
module.exports.createWorkloadModule = () => new GetCommercialDetailsWorkload();
