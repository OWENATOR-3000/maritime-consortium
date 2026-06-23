'use strict';

// Single place responsible for compliance violation records. Nothing in
// this file knows about HTTP routes or role checks beyond membership —
// the "Regulator only" rule is enforced by the contract layer before
// calling in here, consistent with how every other role-gated transaction
// in maritime-consortium-contract.js is structured.

const { violationKey } = require('./compliance-keys');
const AuditService = require('./audit-service');

const VIOLATION_STATUS = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED'
};

class ComplianceService {
  static async flagViolation(ctx, shipmentId, violationId, violationType, details, flaggedByMsp) {
    const existing = await ctx.stub.getState(violationKey(shipmentId, violationId));
    if (existing && existing.length > 0) {
      throw new Error(`Violation ${violationId} already exists for shipment ${shipmentId}.`);
    }

    const record = {
      violationId,
      shipmentId,
      violationType,
      details,
      flaggedBy: flaggedByMsp,
      status: VIOLATION_STATUS.OPEN,
      flaggedAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(violationKey(shipmentId, violationId), Buffer.from(JSON.stringify(record)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'COMPLIANCE_VIOLATION_FLAGGED', flaggedByMsp, {
      violationId,
      violationType
    });

    return record;
  }

  static async getViolations(ctx, shipmentId) {
    const iterator = await ctx.stub.getStateByRange(`VIOLATION_${shipmentId}_`, `VIOLATION_${shipmentId}_~`);
    const violations = [];
    while (true) {
      const result = await iterator.next();
      if (result.value && result.value.value) {
        violations.push(JSON.parse(result.value.value.toString('utf8')));
      }
      if (result.done) {
        await iterator.close();
        break;
      }
    }
    return violations;
  }

  static async resolveViolation(ctx, shipmentId, violationId, resolutionNotes, resolvedByMsp) {
    const buffer = await ctx.stub.getState(violationKey(shipmentId, violationId));
    if (!buffer || buffer.length === 0) {
      throw new Error(`Violation ${violationId} does not exist for shipment ${shipmentId}.`);
    }

    const record = JSON.parse(buffer.toString('utf8'));
    if (record.status === VIOLATION_STATUS.RESOLVED) {
      throw new Error(`Violation ${violationId} is already resolved.`);
    }

    record.status = VIOLATION_STATUS.RESOLVED;
    record.resolutionNotes = resolutionNotes;
    record.resolvedBy = resolvedByMsp;
    record.resolvedAt = ctx.stub.getTxTimestamp().seconds.low;

    await ctx.stub.putState(violationKey(shipmentId, violationId), Buffer.from(JSON.stringify(record)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'COMPLIANCE_VIOLATION_RESOLVED', resolvedByMsp, {
      violationId,
      resolutionNotes
    });

    return record;
  }
}

module.exports = { ComplianceService, VIOLATION_STATUS };
