'use strict';

const crypto = require('crypto');
const { Contract } = require('fabric-contract-api');
const { MSP, PRIVATE_COLLECTIONS } = require('./msp-roles');
const { shipmentKey, documentKey } = require('./state-keys');
const AuditService = require('./audit-service');
const { MembershipService } = require('./membership-service');
const { GovernanceRules } = require('./governance-rules');
const { GovernanceService } = require('./governance-service');
const { ComplianceService } = require('./compliance-service');
const { DisputeService } = require('./dispute-service');

class MaritimeConsortiumContract extends Contract {
  // ── Shipment Lifecycle ──────────────────────────────────────────────

  async CreateShipment(ctx, shipmentId, routeCode, cargoDescription) {
    await this.assertShipmentDoesNotExist(ctx, shipmentId);

    const creatorMsp = this.getClientMsp(ctx);
    if (creatorMsp !== MSP.SHIPPING_A && creatorMsp !== MSP.SHIPPING_B) {
      throw new Error('Only a shipping line can create a shipment.');
    }
    await MembershipService.assertActive(ctx, creatorMsp);

    const shipment = {
      shipmentId,
      routeCode,
      cargoDescription,
      createdBy: creatorMsp,
      status: 'CREATED',
      clearanceApprovals: [],
      documentHashes: [],
      createdAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'SHIPMENT_CREATED', creatorMsp, {
      routeCode,
      createdBy: creatorMsp
    });

    return JSON.stringify(shipment);
  }

  async SubmitCommercialDetails(ctx, shipmentId) {
    const creatorMsp = this.getClientMsp(ctx);
    if (creatorMsp !== MSP.SHIPPING_A) {
      throw new Error('Only Shipping Line A may store the protected commercial dataset in this prototype.');
    }
    await MembershipService.assertActive(ctx, creatorMsp);

    const shipment = await this.getShipmentRecord(ctx, shipmentId);
    const transientMap = ctx.stub.getTransient();
    const payloadBuffer = transientMap.get('commercialDetails');

    if (!payloadBuffer || payloadBuffer.length === 0) {
      throw new Error('Transient field "commercialDetails" is required.');
    }

    const privatePayload = JSON.parse(payloadBuffer.toString('utf8'));
    const privateRecord = {
      shipmentId,
      ownerMsp: creatorMsp,
      ...privatePayload
    };

    await ctx.stub.putPrivateData(
      PRIVATE_COLLECTIONS.SHIPPING_A_COMMERCIAL,
      shipmentId,
      Buffer.from(JSON.stringify(privateRecord))
    );

    const detailsHash = this.sha256(JSON.stringify(privateRecord));
    shipment.privateDataHash = detailsHash;

    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'COMMERCIAL_DETAILS_SUBMITTED', creatorMsp, {
      ownerMsp: creatorMsp,
      privateDataHash: detailsHash
    });

    return JSON.stringify({ shipmentId, privateDataHash: detailsHash });
  }

  async ApproveClearance(ctx, shipmentId) {
    const approverMsp = this.getClientMsp(ctx);

    // Required approvers now come from on-chain governance state rather
    // than a hardcoded list — changeable only via an approved
    // CHANGE_CLEARANCE_THRESHOLD governance proposal.
    const allowedApprovers = await GovernanceRules.getClearanceApprovers(ctx);
    if (!allowedApprovers.includes(approverMsp)) {
      throw new Error(`Only the following organisations may approve clearance: ${allowedApprovers.join(', ')}`);
    }
    await MembershipService.assertActive(ctx, approverMsp);

    const shipment = await this.getShipmentRecord(ctx, shipmentId);

    if (!shipment.clearanceApprovals.includes(approverMsp)) {
      shipment.clearanceApprovals.push(approverMsp);
    }

    const requiredCount = allowedApprovers.length;
    shipment.status =
      shipment.clearanceApprovals.length >= requiredCount ? 'READY_FOR_CLEARANCE' : 'PENDING_CLEARANCE_APPROVALS';
    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));

    await AuditService.appendShipmentEvent(ctx, shipmentId, 'CLEARANCE_APPROVED', approverMsp, {
      approverMsp,
      approvals: shipment.clearanceApprovals
    });

    return JSON.stringify(shipment);
  }

  async FinalizeClearance(ctx, shipmentId) {
    const finalizerMsp = this.getClientMsp(ctx);
    await MembershipService.assertActive(ctx, finalizerMsp);

    const shipment = await this.getShipmentRecord(ctx, shipmentId);
    const requiredApprovals = await GovernanceRules.getClearanceApprovers(ctx);
    const missingApprovals = requiredApprovals.filter((mspId) => !shipment.clearanceApprovals.includes(mspId));

    if (missingApprovals.length > 0) {
      throw new Error(`Shipment clearance cannot be finalized. Missing approvals: ${missingApprovals.join(', ')}`);
    }

    shipment.status = 'CLEARED';
    shipment.clearedAt = ctx.stub.getTxTimestamp().seconds.low;
    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));

    await AuditService.appendShipmentEvent(ctx, shipmentId, 'CLEARANCE_FINALIZED', finalizerMsp, {
      finalizedBy: finalizerMsp
    });

    return JSON.stringify(shipment);
  }

  async RecordDocumentHash(ctx, shipmentId, documentId, documentName, hashValue) {
    await this.getShipmentRecord(ctx, shipmentId);

    const clientMsp = this.getClientMsp(ctx);
    const allowed = [MSP.CUSTOMS, MSP.PORT, MSP.REGULATOR, MSP.SHIPPING_A];
    if (!allowed.includes(clientMsp)) {
      throw new Error('The submitting organization is not allowed to anchor a document hash.');
    }
    await MembershipService.assertActive(ctx, clientMsp);

    const documentRecord = {
      documentId,
      shipmentId,
      documentName,
      hashValue,
      anchoredBy: clientMsp,
      anchoredAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(documentKey(documentId), Buffer.from(JSON.stringify(documentRecord)));
    await AuditService.appendShipmentEvent(ctx, shipmentId, 'DOCUMENT_HASH_RECORDED', clientMsp, {
      documentId,
      hashValue,
      anchoredBy: clientMsp
    });

    return JSON.stringify(documentRecord);
  }

  async VerifyDocumentHash(ctx, documentId, proposedHash) {
    const documentBuffer = await ctx.stub.getState(documentKey(documentId));
    if (!documentBuffer || documentBuffer.length === 0) {
      throw new Error(`Document ${documentId} does not exist.`);
    }

    const documentRecord = JSON.parse(documentBuffer.toString('utf8'));
    return JSON.stringify({
      documentId,
      shipmentId: documentRecord.shipmentId,
      expectedHash: documentRecord.hashValue,
      providedHash: proposedHash,
      matches: documentRecord.hashValue === proposedHash
    });
  }

  async GetShipment(ctx, shipmentId) {
    const shipment = await this.getShipmentRecord(ctx, shipmentId);
    return JSON.stringify(shipment);
  }

  async GetCommercialDetails(ctx, shipmentId) {
    const requesterMsp = this.getClientMsp(ctx);
    const allowed = [MSP.SHIPPING_A, MSP.CUSTOMS, MSP.PORT, MSP.REGULATOR];

    if (!allowed.includes(requesterMsp)) {
      throw new Error(`Organization ${requesterMsp} is not authorized to access the protected commercial dataset.`);
    }
    await MembershipService.assertActive(ctx, requesterMsp);

    const buffer = await ctx.stub.getPrivateData(PRIVATE_COLLECTIONS.SHIPPING_A_COMMERCIAL, shipmentId);
    if (!buffer || buffer.length === 0) {
      throw new Error(`No commercial details exist for shipment ${shipmentId}.`);
    }

    return buffer.toString('utf8');
  }

  async GetShipmentAuditTrail(ctx, shipmentId) {
    await this.getShipmentRecord(ctx, shipmentId);

    const iterator = await ctx.stub.getStateByRange(`AUDIT_${shipmentId}_`, `AUDIT_${shipmentId}_~`);
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

    return JSON.stringify(events);
  }

  // ── Consortium Governance ───────────────────────────────────────────
  // Thin entry points only — all real logic lives in governance-service.js,
  // membership-service.js, and governance-rules.js. This class's job here
  // is just to pull the caller's MSP out of the Fabric context and hand off.

  async ProposeGovernanceChange(ctx, proposalId, changeType, payloadJson) {
    const proposerMsp = this.getClientMsp(ctx);
    const payload = JSON.parse(payloadJson);
    const proposal = await GovernanceService.proposeChange(ctx, proposalId, changeType, payload, proposerMsp);
    return JSON.stringify(proposal);
  }

  async VoteOnProposal(ctx, proposalId, choice) {
    const voterMsp = this.getClientMsp(ctx);
    const proposal = await GovernanceService.vote(ctx, proposalId, choice, voterMsp);
    return JSON.stringify(proposal);
  }

  async GetProposal(ctx, proposalId) {
    const proposal = await GovernanceService.getProposal(ctx, proposalId);
    return JSON.stringify(proposal);
  }

  async GetAllProposals(ctx) {
    const proposals = await GovernanceService.getAllProposals(ctx);
    return JSON.stringify(proposals);
  }

  async GetGovernanceAuditTrail(ctx) {
    const events = await AuditService.getGovernanceAuditTrail(ctx);
    return JSON.stringify(events);
  }

  async RequestMembership(ctx, candidateMsp, organisationName) {
    // Defense in depth: the API layer already restricts who can call this,
    // but the chaincode itself should never trust the calling layer alone —
    // the requesting caller must be an active member in good standing to
    // sponsor a candidate's application.
    const sponsorMsp = this.getClientMsp(ctx);
    await MembershipService.assertActive(ctx, sponsorMsp);

    const record = await MembershipService.requestMembership(ctx, candidateMsp, organisationName);
    await AuditService.appendGovernanceEvent(ctx, 'MEMBERSHIP_REQUESTED', sponsorMsp, {
      candidateMsp,
      organisationName
    });

    return JSON.stringify(record);
  }

  async GetActiveMembers(ctx) {
    const members = await MembershipService.getActiveMembers(ctx);
    return JSON.stringify(members);
  }

  async GetAllMembers(ctx) {
    const members = await MembershipService.getAllMembers(ctx);
    return JSON.stringify(members);
  }

  async GetMemberStatus(ctx, mspId) {
    const record = await MembershipService.getMemberRecord(ctx, mspId);
    if (!record) {
      throw new Error(`No membership record exists for ${mspId}.`);
    }
    return JSON.stringify(record);
  }

  // ── Compliance Enforcement ──────────────────────────────────────────
  // Regulator-only by role; thin entry points, real logic in compliance-service.js.

  async FlagComplianceViolation(ctx, shipmentId, violationId, violationType, details) {
    await this.getShipmentRecord(ctx, shipmentId);
    const callerMsp = this.getClientMsp(ctx);
    if (callerMsp !== MSP.REGULATOR) {
      throw new Error('Only the Regulator may flag a compliance violation.');
    }
    await MembershipService.assertActive(ctx, callerMsp);

    const record = await ComplianceService.flagViolation(
      ctx, shipmentId, violationId, violationType, details, callerMsp
    );
    return JSON.stringify(record);
  }

  async GetComplianceViolations(ctx, shipmentId) {
    await this.getShipmentRecord(ctx, shipmentId);
    const violations = await ComplianceService.getViolations(ctx, shipmentId);
    return JSON.stringify(violations);
  }

  async ResolveComplianceViolation(ctx, shipmentId, violationId, resolutionNotes) {
    const callerMsp = this.getClientMsp(ctx);
    if (callerMsp !== MSP.REGULATOR) {
      throw new Error('Only the Regulator may resolve a compliance violation.');
    }
    await MembershipService.assertActive(ctx, callerMsp);

    const record = await ComplianceService.resolveViolation(ctx, shipmentId, violationId, resolutionNotes, callerMsp);
    return JSON.stringify(record);
  }

  // ── Dispute Resolution ───────────────────────────────────────────────
  // Any active member may raise/respond; only the Regulator (neutral
  // arbiter) may resolve. Thin entry points, real logic in dispute-service.js.

  async RaiseDispute(ctx, shipmentId, disputeId, reason) {
    await this.getShipmentRecord(ctx, shipmentId);
    const callerMsp = this.getClientMsp(ctx);
    await MembershipService.assertActive(ctx, callerMsp);

    const record = await DisputeService.raiseDispute(ctx, shipmentId, disputeId, reason, callerMsp);
    return JSON.stringify(record);
  }

  async RespondToDispute(ctx, shipmentId, disputeId, response) {
    const callerMsp = this.getClientMsp(ctx);
    await MembershipService.assertActive(ctx, callerMsp);

    const record = await DisputeService.respondToDispute(ctx, shipmentId, disputeId, response, callerMsp);
    return JSON.stringify(record);
  }

  async ResolveDispute(ctx, shipmentId, disputeId, resolution) {
    const callerMsp = this.getClientMsp(ctx);
    if (callerMsp !== MSP.REGULATOR) {
      throw new Error('Only the Regulator may resolve a dispute.');
    }
    await MembershipService.assertActive(ctx, callerMsp);

    const record = await DisputeService.resolveDispute(ctx, shipmentId, disputeId, resolution, callerMsp);
    return JSON.stringify(record);
  }

  async GetShipmentDisputes(ctx, shipmentId) {
    await this.getShipmentRecord(ctx, shipmentId);
    const disputes = await DisputeService.getShipmentDisputes(ctx, shipmentId);
    return JSON.stringify(disputes);
  }

  // ── Internal Helpers ─────────────────────────────────────────────────

  async assertShipmentDoesNotExist(ctx, shipmentId) {
    const existing = await ctx.stub.getState(shipmentKey(shipmentId));
    if (existing && existing.length > 0) {
      throw new Error(`Shipment ${shipmentId} already exists.`);
    }
  }

  async getShipmentRecord(ctx, shipmentId) {
    const shipmentBuffer = await ctx.stub.getState(shipmentKey(shipmentId));
    if (!shipmentBuffer || shipmentBuffer.length === 0) {
      throw new Error(`Shipment ${shipmentId} does not exist.`);
    }

    return JSON.parse(shipmentBuffer.toString('utf8'));
  }

  getClientMsp(ctx) {
    return ctx.clientIdentity.getMSPID();
  }

  sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = MaritimeConsortiumContract;
