'use strict';
const { MaritimeBase } = require('./base');

class CreateShipmentWorkload extends MaritimeBase {
  async submitTransaction() {
    const id = this.nextShipmentId();
    await this.sutAdapter.sendRequests({
      contractId: 'maritime-consortium',
      contractFunction: 'CreateShipment',
      contractArguments: [id, 'WVB-RTM', 'Benchmark cargo'],
      invokerIdentity: 'UserA',
      invokerMspId: 'ShippingLineAMSP',
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new CreateShipmentWorkload();
