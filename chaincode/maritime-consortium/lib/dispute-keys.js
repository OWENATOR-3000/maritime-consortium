'use strict';

// State-key schema for disputes. Keyed by shipmentId first, same rationale
// as compliance-keys.js — GetShipmentDisputes(shipmentId) is a single range
// query rather than a full-table scan with client-side filtering.

function disputeKey(shipmentId, disputeId) {
  return `DISPUTE_${shipmentId}_${disputeId}`;
}

module.exports = { disputeKey };
