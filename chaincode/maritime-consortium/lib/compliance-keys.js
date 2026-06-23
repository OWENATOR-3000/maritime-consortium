'use strict';

// State-key schema for compliance violations. Keyed by shipmentId first so
// GetComplianceViolations(shipmentId) is a single efficient range query,
// mirroring the existing AUDIT_<shipmentId>_<eventId> pattern.

function violationKey(shipmentId, violationId) {
  return `VIOLATION_${shipmentId}_${violationId}`;
}

module.exports = { violationKey };
