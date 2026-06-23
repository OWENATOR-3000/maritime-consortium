'use strict';
const { MaritimeBase } = require('./base');

/** Pre-creates shipments; each tx is one approval (rotating authorised org) on its own shipment to avoid MVCC conflicts. */
class ApproveClearanceWorkload extends MaritimeBase {
  async initializeWorkloadModule(...args) {
    await super.initializeWorkloadModule(...args);
    this.approvers = [
      ['UserA', 'ShippingLineAMSP'],
      ['UserCustoms', 'CustomsAuthorityMSP'],
      ['UserPort', 'PortAuthorityMSP']
    ];
    for (let i = 1; i <= this.roundArguments.preCreate; i++) {
      await this.createShipment(`BENCH_${this.prefix}_${i}`);
    }
  }

  async submitTransaction() {
    const id = this.nextShipmentId();
    const [identity, msp] = this.approvers[this.txCounter % 3];
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'ApproveClearance',
      contractArguments: [id],
      invokerIdentity: identity,
      invokerMspId: msp,
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new ApproveClearanceWorkload();
