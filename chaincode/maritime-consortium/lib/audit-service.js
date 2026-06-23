'use strict';

// Single place responsible for writing and reading immutable audit events.
// Two scopes are supported: per-shipment events (existing behaviour, used by
// the shipment lifecycle functions) and consortium-wide governance events
// (new — proposals, votes, outcomes, membership changes, rule changes).
// Nothing in this file knows about shipments or governance business rules —
// it only knows how to append and range-query timestamped event records.

const { auditKey } = require('./state-keys');
const { govAuditKey } = require('./governance-keys');

class AuditService {
  static async appendShipmentEvent(ctx, shipmentId, eventType, submittedBy, payload) {
    const txId = ctx.stub.getTxID();
    const event = {
      shipmentId,
      eventId: txId,
      eventType,
      submittedBy,
      timestamp: ctx.stub.getTxTimestamp().seconds.low,
      txId,
      payload
    };
    await ctx.stub.putState(auditKey(shipmentId, txId), Buffer.from(JSON.stringify(event)));
    return event;
  }

  static async appendGovernanceEvent(ctx, eventType, submittedBy, payload) {
    const txId = ctx.stub.getTxID();
    const event = {
      eventId: txId,
      eventType,
      submittedBy,
      timestamp: ctx.stub.getTxTimestamp().seconds.low,
      txId,
      payload
    };
    await ctx.stub.putState(govAuditKey(txId), Buffer.from(JSON.stringify(event)));
    return event;
  }

  static async getGovernanceAuditTrail(ctx) {
    const iterator = await ctx.stub.getStateByRange('GOVAUDIT_', 'GOVAUDIT_~');
    const events = [];
    while (true) {
      const result = await iterator.next();
      if (result.value && result.value.value) {
        events.push(JSON.parse(result.value.value.toString('utf8')));
      }
      if (result.done) {
        await iterator.close();
        break;
      }
    }
    return events;
  }
}

module.exports = AuditService;
