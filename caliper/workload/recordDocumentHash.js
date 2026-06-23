'use strict';
const { MaritimeBase } = require('./base');

/** Pre-creates shipments; each tx anchors a fresh SHA-256 document hash. */
class RecordDocumentHashWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    for (let i = 1; i <= this.roundArguments.preCreate; i++) {
      await this.createShipment(`BENCH_${this.prefix}_${i}`);
    }
  }

  async submitTransaction() {
    const id = this.nextShipmentId();
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'RecordDocumentHash',
      contractArguments: [id, `DOC_${id}`, 'bill-of-lading.pdf', this.randomHash()],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new RecordDocumentHashWorkload();
