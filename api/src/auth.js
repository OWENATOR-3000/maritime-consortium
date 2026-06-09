'use strict';

const TOKENS = {
  shippingA: { org: 'ShippingLineAMSP', role: 'shipping-line' },
  shippingB: { org: 'ShippingLineBMSP', role: 'shipping-line' },
  port: { org: 'PortAuthorityMSP', role: 'authority' },
  customs: { org: 'CustomsAuthorityMSP', role: 'authority' },
  regulator: { org: 'RegulatorMSP', role: 'regulator' }
};

function authenticate(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  return token ? TOKENS[token] || null : null;
}

module.exports = {
  authenticate
};
