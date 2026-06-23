'use strict';
const { MaritimeBase } = require('./base');

/** Pre-creates fully-approved shipments (create + 3 approvals each), then finalizes one per tx. */
class FinalizeClearanceWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    for (let i = 1; i <= this.roundArguments.preCreate; i++) {
      const id = `BENCH_${this.prefix}_${i}`;
      await this.createShipment(id);
      await this.approveAll(id);
    }
  }

  async submitTransaction() {
    const id = this.nextShipmentId();
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'FinalizeClearance',
      contractArguments: [id],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new FinalizeClearanceWorkload();
