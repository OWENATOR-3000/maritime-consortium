'use strict';

const crypto = require('crypto');
const { Contract } = require('fabric-contract-api');
const { MSP, PRIVATE_COLLECTIONS } = require('./msp-roles');
const { shipmentKey, auditKey, documentKey } = require('./state-keys');

class MaritimeConsortiumContract extends Contract {
  async CreateShipment(ctx, shipmentId, routeCode, cargoDescription) {
    await this.assertShipmentDoesNotExist(ctx, shipmentId);

    const creatorMsp = this.getClientMsp(ctx);
    if (creatorMsp !== MSP.SHIPPING_A && creatorMsp !== MSP.SHIPPING_B) {
      throw new Error('Only a shipping line can create a shipment.');
    }

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
    await this.appendAuditEvent(ctx, shipmentId, 'SHIPMENT_CREATED', {
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
    await this.appendAuditEvent(ctx, shipmentId, 'COMMERCIAL_DETAILS_SUBMITTED', {
      ownerMsp: creatorMsp,
      privateDataHash: detailsHash
    });

    return JSON.stringify({
      shipmentId,
      privateDataHash: detailsHash
    });
  }

  async ApproveClearance(ctx, shipmentId) {
    const approverMsp = this.getClientMsp(ctx);
    const allowedApprovers = [MSP.SHIPPING_A, MSP.CUSTOMS, MSP.PORT];

    if (!allowedApprovers.includes(approverMsp)) {
      throw new Error('Only Shipping Line A, Customs Authority, and Port Authority may approve clearance.');
    }

    const shipment = await this.getShipmentRecord(ctx, shipmentId);

    if (!shipment.clearanceApprovals.includes(approverMsp)) {
      shipment.clearanceApprovals.push(approverMsp);
    }

    shipment.status = shipment.clearanceApprovals.length >= 3 ? 'READY_FOR_CLEARANCE' : 'PENDING_CLEARANCE_APPROVALS';
    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));

    await this.appendAuditEvent(ctx, shipmentId, 'CLEARANCE_APPROVED', {
      approverMsp,
      approvals: shipment.clearanceApprovals
    });

    return JSON.stringify(shipment);
  }

  async FinalizeClearance(ctx, shipmentId) {
    const shipment = await this.getShipmentRecord(ctx, shipmentId);
    const requiredApprovals = [MSP.SHIPPING_A, MSP.CUSTOMS, MSP.PORT];
    const missingApprovals = requiredApprovals.filter((mspId) => !shipment.clearanceApprovals.includes(mspId));

    if (missingApprovals.length > 0) {
      throw new Error(`Shipment clearance cannot be finalized. Missing approvals: ${missingApprovals.join(', ')}`);
    }

    shipment.status = 'CLEARED';
    shipment.clearedAt = ctx.stub.getTxTimestamp().seconds.low;
    await ctx.stub.putState(shipmentKey(shipmentId), Buffer.from(JSON.stringify(shipment)));

    await this.appendAuditEvent(ctx, shipmentId, 'CLEARANCE_FINALIZED', {
      finalizedBy: this.getClientMsp(ctx)
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

    const documentRecord = {
      documentId,
      shipmentId,
      documentName,
      hashValue,
      anchoredBy: clientMsp,
      anchoredAt: ctx.stub.getTxTimestamp().seconds.low
    };

    await ctx.stub.putState(documentKey(documentId), Buffer.from(JSON.stringify(documentRecord)));
    await this.appendAuditEvent(ctx, shipmentId, 'DOCUMENT_HASH_RECORDED', {
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

  async appendAuditEvent(ctx, shipmentId, eventType, payload) {
    const txId = ctx.stub.getTxID();
    const event = {
      shipmentId,
      eventId: txId,
      eventType,
      submittedBy: this.getClientMsp(ctx),
      timestamp: ctx.stub.getTxTimestamp().seconds.low,
      txId,
      payload
    };

    await ctx.stub.putState(auditKey(shipmentId, txId), Buffer.from(JSON.stringify(event)));
  }

  getClientMsp(ctx) {
    return ctx.clientIdentity.getMSPID();
  }

  sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = MaritimeConsortiumContract;
