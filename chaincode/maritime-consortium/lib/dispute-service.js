'use strict';

// Single place responsible for dispute records. Status flow:
//   OPEN -> RESPONDED -> RESOLVED
// Resolution is restricted to the Regulator (neutral arbiter) — enforced by
// the contract layer before calling resolveDispute(), same convention as
// every other role-gated transaction in this codebase.

const { disputeKey } = require('./dispute-keys');
const AuditService = require('./audit-service');

const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  RESPONDED: 'RESPONDED',
  RESOLVED: 'RESOLVED'
};

class DisputeService {
  static async raiseDispute(ctx, shipmentId, disputeId, reason, raisedByMsp) {
    const existing = await ctx.stub.getState(disputeKey(shipmentId, disputeId));
    if (existing && existing.length > 0) {
      throw new Error(`Dispute ${disputeId} already exists for shipment ${shipmentId}.`);
    }

    const record = {
      disputeId,
      shipmentId,
      reason,
      raisedBy: raisedByMsp,
      status: DISPUTE_STATUS.OPEN,
      raisedAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(disputeKey(shipmentId, disputeId), Buffer.from(JSON.stringify(record)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'DISPUTE_RAISED', raisedByMsp, { disputeId, reason });

    return record;
  }

  static async respondToDispute(ctx, shipmentId, disputeId, response, responderMsp) {
    const record = await DisputeService._getDispute(ctx, shipmentId, disputeId);
    if (record.status !== DISPUTE_STATUS.OPEN) {
      throw new Error(`Dispute ${disputeId} is ${record.status} and cannot accept a new response.`);
    }

    record.status = DISPUTE_STATUS.RESPONDED;
    record.response = response;
    record.respondedBy = responderMsp;
    record.respondedAt = ctx.stub.getTxTimestamp().seconds.low;

    await ctx.stub.putState(disputeKey(shipmentId, disputeId), Buffer.from(JSON.stringify(record)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'DISPUTE_RESPONDED', responderMsp, { disputeId, response });

    return record;
  }

  static async resolveDispute(ctx, shipmentId, disputeId, resolution, resolvedByMsp) {
    const record = await DisputeService._getDispute(ctx, shipmentId, disputeId);
    if (record.status === DISPUTE_STATUS.RESOLVED) {
      throw new Error(`Dispute ${disputeId} is already resolved.`);
    }

    record.status = DISPUTE_STATUS.RESOLVED;
    record.resolution = resolution;
    record.resolvedBy = resolvedByMsp;
    record.resolvedAt = ctx.stub.getTxTimestamp().seconds.low;

    await ctx.stub.putState(disputeKey(shipmentId, disputeId), Buffer.from(JSON.stringify(record)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'DISPUTE_RESOLVED', resolvedByMsp, { disputeId, resolution });

    return record;
  }

  static async getShipmentDisputes(ctx, shipmentId) {
    const iterator = await ctx.stub.getStateByRange(`DISPUTE_${shipmentId}_`, `DISPUTE_${shipmentId}_~`);
    const disputes = [];
    while (true) {
      const result = await iterator.next();
      if (result.value && result.value.value) {
        disputes.push(JSON.parse(result.value.value.toString('utf8')));
      }
      if (result.done) {
        await iterator.close();
        break;
      }
    }
    return disputes;
  }

  static async _getDispute(ctx, shipmentId, disputeId) {
    const buffer = await ctx.stub.getState(disputeKey(shipmentId, disputeId));
    if (!buffer || buffer.length === 0) {
      throw new Error(`Dispute ${disputeId} does not exist for shipment ${shipmentId}.`);
    }
    return JSON.parse(buffer.toString('utf8'));
  }
}

module.exports = { DisputeService, DISPUTE_STATUS };
