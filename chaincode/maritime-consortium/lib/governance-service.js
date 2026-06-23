'use strict';

// Orchestrates the propose -> vote -> tally -> apply workflow. This is the
// only file that knows about *proposals*; it composes membership-service.js
// (who's allowed to vote, and applying the eventual change),
// governance-rules.js (how many votes are needed), and audit-service.js
// (recording every step immutably). Keeping orchestration separate from the
// three lower-level concerns means any one of them can be changed —
// e.g. swapping the quorum formula, or adding a new change type — without
// touching the others.

const { proposalKey, voteKey } = require('./governance-keys');
const { MembershipService } = require('./membership-service');
const { GovernanceRules } = require('./governance-rules');
const AuditService = require('./audit-service');

const PROPOSAL_STATUS = {
  OPEN: 'OPEN',
  APPROVED: 'APPROVED'
};

const CHANGE_TYPES = [
  'ADD_MEMBER',
  'SUSPEND_MEMBER',
  'REVOKE_MEMBER',
  'REINSTATE_MEMBER',
  'CHANGE_CLEARANCE_THRESHOLD'
];

class GovernanceService {
  static async proposeChange(ctx, proposalId, changeType, payload, proposerMsp) {
    if (!CHANGE_TYPES.includes(changeType)) {
      throw new Error(
        `Unknown governance change type: ${changeType}. Expected one of: ${CHANGE_TYPES.join(', ')}`
      );
    }

    await MembershipService.assertActive(ctx, proposerMsp);

    const existing = await ctx.stub.getState(proposalKey(proposalId));
    if (existing && existing.length > 0) {
      throw new Error(`Proposal ${proposalId} already exists.`);
    }

    const proposal = {
      proposalId,
      changeType,
      payload,
      proposedBy: proposerMsp,
      status: PROPOSAL_STATUS.OPEN,
      votes: {},
      createdAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(proposalKey(proposalId), Buffer.from(JSON.stringify(proposal)));
    await AuditService.appendGovernanceEvent(ctx, 'PROPOSAL_CREATED', proposerMsp, {
      proposalId,
      changeType,
      payload
    });

    return proposal;
  }

  static async getProposal(ctx, proposalId) {
    const buffer = await ctx.stub.getState(proposalKey(proposalId));
    if (!buffer || buffer.length === 0) {
      throw new Error(`Proposal ${proposalId} does not exist.`);
    }
    return JSON.parse(buffer.toString('utf8'));
  }

  static async getAllProposals(ctx) {
    const iterator = await ctx.stub.getStateByRange('PROPOSAL_', 'PROPOSAL_~');
    const proposals = [];
    while (true) {
      const result = await iterator.next();
      if (result.value && result.value.value) {
        proposals.push(JSON.parse(result.value.value.toString('utf8')));
      }
      if (result.done) {
        await iterator.close();
        break;
      }
    }
    return proposals;
  }

  static async vote(ctx, proposalId, choice, voterMsp) {
    if (choice !== 'YES' && choice !== 'NO') {
      throw new Error('Vote choice must be "YES" or "NO".');
    }

    await MembershipService.assertActive(ctx, voterMsp);

    const proposal = await GovernanceService.getProposal(ctx, proposalId);
    if (proposal.status !== PROPOSAL_STATUS.OPEN) {
      throw new Error(`Proposal ${proposalId} is already ${proposal.status} and can no longer be voted on.`);
    }

    const existingVote = await ctx.stub.getState(voteKey(proposalId, voterMsp));
    if (existingVote && existingVote.length > 0) {
      throw new Error(`${voterMsp} has already voted on proposal ${proposalId}.`);
    }

    const voteRecord = {
      proposalId,
      voterMsp,
      choice,
      castAt: ctx.stub.getTxTimestamp().seconds.low
    };
    await ctx.stub.putState(voteKey(proposalId, voterMsp), Buffer.from(JSON.stringify(voteRecord)));

    proposal.votes[voterMsp] = choice;
    await AuditService.appendGovernanceEvent(ctx, 'VOTE_CAST', voterMsp, { proposalId, choice });

    return GovernanceService._tally(ctx, proposal);
  }

  // Internal. Recomputes whether quorum has been reached and, if so, applies
  // the change and marks the proposal APPROVED. Only called from vote(), so
  // a proposal can never be finalized except as the direct result of an
  // actual vote being cast.
  static async _tally(ctx, proposal) {
    const activeMembers = await MembershipService.getActiveMembers(ctx);
    const requiredVotes = await GovernanceRules.getRequiredVotes(ctx, activeMembers.length);
    const yesVotes = Object.values(proposal.votes).filter((v) => v === 'YES').length;

    if (proposal.status === PROPOSAL_STATUS.OPEN && yesVotes >= requiredVotes) {
      proposal.status = PROPOSAL_STATUS.APPROVED;
      proposal.approvedAt = ctx.stub.getTxTimestamp().seconds.low;
      proposal.requiredVotes = requiredVotes;

      await GovernanceService._applyChange(ctx, proposal);

      await AuditService.appendGovernanceEvent(ctx, 'PROPOSAL_APPROVED', 'SYSTEM', {
        proposalId: proposal.proposalId,
        changeType: proposal.changeType,
        yesVotes,
        requiredVotes
      });
    }

    await ctx.stub.putState(proposalKey(proposal.proposalId), Buffer.from(JSON.stringify(proposal)));
    return proposal;
  }

  static async _applyChange(ctx, proposal) {
    const { changeType, payload } = proposal;

    if (changeType === 'CHANGE_CLEARANCE_THRESHOLD') {
      if (!Array.isArray(payload.requiredApprovers) || payload.requiredApprovers.length === 0) {
        throw new Error('CHANGE_CLEARANCE_THRESHOLD payload must include a non-empty requiredApprovers array.');
      }
      await GovernanceRules.setRule(ctx, 'clearanceApprovers', payload.requiredApprovers);
      return;
    }

    // ADD_MEMBER / SUSPEND_MEMBER / REVOKE_MEMBER / REINSTATE_MEMBER
    await MembershipService.applyMembershipChange(ctx, changeType, payload.targetMsp, payload.organisationName);
  }
}

module.exports = { GovernanceService, PROPOSAL_STATUS, CHANGE_TYPES };
