'use strict';

// Single place responsible for participant membership state — who is
// ACTIVE, PENDING, SUSPENDED, or REVOKED. Nothing in this file knows about
// proposals, voting, or shipment business rules — it only knows how to
// read/write membership records and answer "is this org allowed to act
// right now". governance-service.js calls into this module to apply the
// outcome of an approved proposal; the contract layer calls into this
// module to enforce membership status as a guard before any transaction.

const { memberKey } = require('./governance-keys');
const { MSP } = require('./msp-roles');

const MEMBER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED'
};

// The organisations the network physically launched with. If no MEMBER_
// record exists yet for one of these, they default to ACTIVE so existing
// shipment functionality keeps working without a chaincode Init step or a
// data migration. Once any governance action touches a founding member
// (e.g. a SUSPEND_MEMBER proposal passes), an explicit on-chain record is
// written and takes precedence over this default from then on.
const FOUNDING_MEMBERS = Object.values(MSP);

class MembershipService {
  static async getMemberRecord(ctx, mspId) {
    const buffer = await ctx.stub.getState(memberKey(mspId));
    if (buffer && buffer.length > 0) {
      return JSON.parse(buffer.toString('utf8'));
    }
    if (FOUNDING_MEMBERS.includes(mspId)) {
      return { mspId, organisationName: mspId, status: MEMBER_STATUS.ACTIVE, founding: true };
    }
    return null;
  }

  static async isActive(ctx, mspId) {
    const record = await MembershipService.getMemberRecord(ctx, mspId);
    return !!record && record.status === MEMBER_STATUS.ACTIVE;
  }

  static async assertActive(ctx, mspId) {
    const active = await MembershipService.isActive(ctx, mspId);
    if (!active) {
      throw new Error(
        `Organization ${mspId} is not an active consortium member and may not submit this transaction.`
      );
    }
  }

  static async putMemberRecord(ctx, record) {
    await ctx.stub.putState(memberKey(record.mspId), Buffer.from(JSON.stringify(record)));
  }

  static async requestMembership(ctx, candidateMsp, organisationName) {
    const existing = await MembershipService.getMemberRecord(ctx, candidateMsp);
    if (existing && existing.status !== MEMBER_STATUS.REVOKED) {
      throw new Error(
        `A membership record already exists for ${candidateMsp} with status ${existing.status}.`
      );
    }

    const record = {
      mspId: candidateMsp,
      organisationName,
      status: MEMBER_STATUS.PENDING,
      requestedAt: ctx.stub.getTxTimestamp().seconds.low
    };
    await MembershipService.putMemberRecord(ctx, record);
    return record;
  }

  static async getAllMembers(ctx) {
    const merged = new Map();

    const iterator = await ctx.stub.getStateByRange('MEMBER_', 'MEMBER_~');
    while (true) {
      const result = await iterator.next();
      if (result.value && result.value.value) {
        const record = JSON.parse(result.value.value.toString('utf8'));
        merged.set(record.mspId, record);
      }
      if (result.done) {
        await iterator.close();
        break;
      }
    }

    for (const mspId of FOUNDING_MEMBERS) {
      if (!merged.has(mspId)) {
        merged.set(mspId, { mspId, organisationName: mspId, status: MEMBER_STATUS.ACTIVE, founding: true });
      }
    }

    return Array.from(merged.values());
  }

  static async getActiveMembers(ctx) {
    const all = await MembershipService.getAllMembers(ctx);
    return all.filter((m) => m.status === MEMBER_STATUS.ACTIVE);
  }

  // Applies the outcome of an approved governance proposal. Only ever
  // called from governance-service.js once quorum is reached — never
  // exposed directly as a transaction function, so membership cannot
  // change except through the propose-and-vote workflow.
  static async applyMembershipChange(ctx, changeType, targetMsp, organisationName) {
    let record = await MembershipService.getMemberRecord(ctx, targetMsp);
    if (!record) {
      record = { mspId: targetMsp, organisationName: organisationName || targetMsp, founding: false };
    }

    const now = ctx.stub.getTxTimestamp().seconds.low;

    switch (changeType) {
      case 'ADD_MEMBER':
        record.status = MEMBER_STATUS.ACTIVE;
        record.activatedAt = now;
        break;
      case 'SUSPEND_MEMBER':
        record.status = MEMBER_STATUS.SUSPENDED;
        record.suspendedAt = now;
        break;
      case 'REVOKE_MEMBER':
        record.status = MEMBER_STATUS.REVOKED;
        record.revokedAt = now;
        break;
      case 'REINSTATE_MEMBER':
        record.status = MEMBER_STATUS.ACTIVE;
        record.reinstatedAt = now;
        break;
      default:
        throw new Error(`Unknown membership change type: ${changeType}`);
    }

    await MembershipService.putMemberRecord(ctx, record);
    return record;
  }
}

module.exports = { MembershipService, MEMBER_STATUS, FOUNDING_MEMBERS };
