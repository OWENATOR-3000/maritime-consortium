'use strict';

const MSP = {
  SHIPPING_A: 'ShippingLineAMSP',
  SHIPPING_B: 'ShippingLineBMSP',
  PORT: 'PortAuthorityMSP',
  CUSTOMS: 'CustomsAuthorityMSP',
  REGULATOR: 'RegulatorMSP'
};

const PRIVATE_COLLECTIONS = {
  SHIPPING_A_COMMERCIAL: 'shippingLineAPrivateDetails'
};

module.exports = {
  MSP,
  PRIVATE_COLLECTIONS
};
