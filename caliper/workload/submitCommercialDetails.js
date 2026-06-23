'use strict';
const { MaritimeBase } = require('./base');

/** Pre-creates shipments, then submits private commercial details (transient data, PDC write). */
class SubmitCommercialDetailsWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    this.total = this.roundArguments.preCreate;
    for (let i = 1; i <= this.total; i++) {
      await this.createShipment(`BENCH_${this.prefix}_${i}`);
    }
  }

  async submitTransaction() {
    const id = this.nextShipmentId();
    const payload = JSON.stringify({
      contractValue: 125000,
      negotiatedRate: 'CONFIDENTIAL-RATE-7',
      consignee: 'Benchmark Importer Ltd'
    });
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'SubmitCommercialDetails',
      contractArguments: [id],
      transientMap: { commercialDetails: Buffer.from(payload) },
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new SubmitCommercialDetailsWorkload();
