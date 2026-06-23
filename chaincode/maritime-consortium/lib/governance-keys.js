'use strict';

// State-key schema for everything governance-related. Kept separate from
// state-keys.js (shipment/document/audit keys) so the two key schemas can
// evolve independently without touching unrelated code.

function proposalKey(proposalId) {
  return `PROPOSAL_${proposalId}`;
}

function voteKey(proposalId, mspId) {
  return `VOTE_${proposalId}_${mspId}`;
}

function memberKey(mspId) {
  return `MEMBER_${mspId}`;
}

function ruleKey(ruleName) {
  return `RULE_${ruleName}`;
}

function govAuditKey(eventId) {
  return `GOVAUDIT_${eventId}`;
}

module.exports = {
  proposalKey,
  voteKey,
  memberKey,
  ruleKey,
  govAuditKey
};
