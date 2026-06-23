'use strict';

// Single place responsible for storing and reading governance rules — the
// values that used to be hardcoded constants (e.g. "clearance needs these
// 3 orgs") and are now on-chain state, changeable only by an approved
// governance proposal (see governance-service.js). Nothing in this file
// knows about proposals or voting — it only knows how rules are stored and
// how the quorum threshold is calculated from a member count.

const { ruleKey } = require('./governance-keys');

// Defaults used the first time a rule is read, before any proposal has ever
// changed it. Seeded lazily on read so no chaincode Init transaction or
// migration step is required.
const DEFAULT_RULES = {
  clearanceApprovers: ['ShippingLineAMSP', 'CustomsAuthorityMSP', 'PortAuthorityMSP'],
  // 'MAJORITY' | 'SUPERMAJORITY_TWO_THIRDS' | 'FIXED:<n>'
  quorumType: 'MAJORITY'
};

class GovernanceRules {
  static async getRule(ctx, ruleName) {
    const buffer = await ctx.stub.getState(ruleKey(ruleName));
    if (buffer && buffer.length > 0) {
      return JSON.parse(buffer.toString('utf8'));
    }
    if (Object.prototype.hasOwnProperty.call(DEFAULT_RULES, ruleName)) {
      return DEFAULT_RULES[ruleName];
    }
    throw new Error(`Unknown governance rule: ${ruleName}`);
  }

  static async setRule(ctx, ruleName, value) {
    await ctx.stub.putState(ruleKey(ruleName), Buffer.from(JSON.stringify(value)));
  }

  static async getClearanceApprovers(ctx) {
    return GovernanceRules.getRule(ctx, 'clearanceApprovers');
  }

  // Recalculated fresh every time it's called — never cached, never a fixed
  // number. If membership grows or shrinks, the required vote count moves
  // automatically with it. If the quorum *type* itself changes via a
  // CHANGE_QUORUM_TYPE-style proposal in the future, only setRule needs to
  // be called — this formula already supports MAJORITY, a two-thirds
  // supermajority, or a fixed absolute count.
  static async getRequiredVotes(ctx, activeMemberCount) {
    const quorumType = await GovernanceRules.getRule(ctx, 'quorumType');

    if (typeof quorumType === 'string' && quorumType.startsWith('FIXED:')) {
      return parseInt(quorumType.split(':')[1], 10);
    }
    if (quorumType === 'SUPERMAJORITY_TWO_THIRDS') {
      return Math.ceil((activeMemberCount * 2) / 3);
    }
    // Default: MAJORITY — strictly more than half of currently active members
    return Math.floor(activeMemberCount / 2) + 1;
  }
}

module.exports = { GovernanceRules, DEFAULT_RULES };
