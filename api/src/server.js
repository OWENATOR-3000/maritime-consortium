'use strict';

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { port, storagePath } = require('./config');
const { authenticate } = require('./auth');
const FabricClient = require('./fabric-client');
const metrics = require('./metrics');

const fabricClient = new FabricClient();
const DOCS_DIR = path.join(storagePath, 'documents');

// Ensure the documents directory exists
fs.mkdirSync(DOCS_DIR, { recursive: true });

// ── Request Helpers ────────────────────────────────────────────────────

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(payload, null, 2));
}

// ── Router ─────────────────────────────────────────────────────────────

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight — browsers send OPTIONS before cross-origin requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Health check — no auth required
  if (url.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // Performance metrics — no auth required, same as /health.
  // Read-only, in-memory, resets on restart.
  if (url.pathname === '/metrics' && req.method === 'GET') {
    sendJson(res, 200, metrics.snapshot());
    return;
  }

  // Authenticate
  const identity = authenticate(req);
  if (!identity) {
    sendJson(res, 401, {
      error: 'Authentication failed. Provide a valid bearer token.'
    });
    return;
  }

  try {
    // ── Shipment endpoints ──────────────────────────────────────────

    // POST /shipments — create a shipment
    if (url.pathname === '/shipments' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await fabricClient.submitTransaction(
        identity,
        'CreateShipment',
        body.shipmentId,
        body.routeCode,
        body.cargoDescription
      );
      sendJson(res, 202, result);
      return;
    }

    // POST /shipments/:id/commercial-details — submit private commercial data
    if (url.pathname.match(/^\/shipments\/[^/]+\/commercial-details$/) && req.method === 'POST') {
      const shipmentId = url.pathname.split('/')[2];
      const body = await readJsonBody(req);

      const transientData = {
        commercialDetails: Buffer.from(JSON.stringify(body.commercialDetails || {}))
      };

      const result = await fabricClient.submitWithTransient(
        identity,
        'SubmitCommercialDetails',
        [shipmentId],
        transientData
      );
      sendJson(res, 202, result);
      return;
    }

    // POST /shipments/:id/clearance/approve — approve clearance
    if (url.pathname.match(/^\/shipments\/[^/]+\/clearance\/approve$/) && req.method === 'POST') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.submitTransaction(identity, 'ApproveClearance', shipmentId);
      sendJson(res, 202, result);
      return;
    }

    // POST /shipments/:id/clearance/finalize — finalize clearance
    if (url.pathname.match(/^\/shipments\/[^/]+\/clearance\/finalize$/) && req.method === 'POST') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.submitTransaction(identity, 'FinalizeClearance', shipmentId);
      sendJson(res, 202, result);
      return;
    }

    // GET /shipments/:id — read shipment
    if (url.pathname.match(/^\/shipments\/[^/]+$/) && req.method === 'GET') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.evaluateTransaction(identity, 'GetShipment', shipmentId);
      sendJson(res, 200, result);
      return;
    }

    // GET /shipments/:id/audit — audit trail
    if (url.pathname.match(/^\/shipments\/[^/]+\/audit$/) && req.method === 'GET') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.evaluateTransaction(identity, 'GetShipmentAuditTrail', shipmentId);
      sendJson(res, 200, result);
      return;
    }

    // GET /shipments/:id/commercial-details — read private data
    if (url.pathname.match(/^\/shipments\/[^/]+\/commercial-details$/) && req.method === 'GET') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.evaluateTransaction(identity, 'GetCommercialDetails', shipmentId);
      sendJson(res, 200, result);
      return;
    }

    // ── Document endpoints (off-chain storage + on-chain hash) ──────

    // POST /documents/upload — store file locally and anchor hash on-chain
    if (url.pathname === '/documents/upload' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { shipmentId, documentId, documentName, content } = body;

      if (!shipmentId || !documentId || !documentName || !content) {
        sendJson(res, 400, {
          error: 'Required fields: shipmentId, documentId, documentName, content (base64)'
        });
        return;
      }

      // Decode base64 content and store locally
      const fileBuffer = Buffer.from(content, 'base64');
      const filePath = path.join(DOCS_DIR, documentId);
      fs.writeFileSync(filePath, fileBuffer);

      // Compute hash
      const hashValue = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Anchor hash on-chain
      const result = await fabricClient.submitTransaction(
        identity,
        'RecordDocumentHash',
        shipmentId,
        documentId,
        documentName,
        hashValue
      );

      sendJson(res, 202, {
        ...result,
        offChainPath: filePath,
        hashValue
      });
      return;
    }

    // POST /documents/:id/verify — re-hash stored file and compare to on-chain
    if (url.pathname.match(/^\/documents\/[^/]+\/verify$/) && req.method === 'POST') {
      const documentId = url.pathname.split('/')[2];
      const filePath = path.join(DOCS_DIR, documentId);

      if (!fs.existsSync(filePath)) {
        sendJson(res, 404, { error: `Off-chain document ${documentId} not found.` });
        return;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const computedHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      const result = await fabricClient.evaluateTransaction(
        identity,
        'VerifyDocumentHash',
        documentId,
        computedHash
      );

      sendJson(res, 200, result);
      return;
    }

    // POST /documents/hash — manually anchor a hash (original endpoint)
    if (url.pathname === '/documents/hash' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await fabricClient.submitTransaction(
        identity,
        'RecordDocumentHash',
        body.shipmentId,
        body.documentId,
        body.documentName,
        body.hashValue
      );
      sendJson(res, 202, result);
      return;
    }

    // ── Governance endpoints ────────────────────────────────────────

    // POST /governance/proposals — propose a consortium governance change
    if (url.pathname === '/governance/proposals' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { proposalId, changeType, payload } = body;

      if (!proposalId || !changeType) {
        sendJson(res, 400, { error: 'Required fields: proposalId, changeType, payload' });
        return;
      }

      const result = await fabricClient.submitTransaction(
        identity,
        'ProposeGovernanceChange',
        proposalId,
        changeType,
        JSON.stringify(payload || {})
      );
      sendJson(res, 202, result);
      return;
    }

    // POST /governance/proposals/:id/vote — cast a vote on an open proposal
    if (url.pathname.match(/^\/governance\/proposals\/[^/]+\/vote$/) && req.method === 'POST') {
      const proposalId = url.pathname.split('/')[3];
      const body = await readJsonBody(req);

      if (!body.choice) {
        sendJson(res, 400, { error: 'Required field: choice ("YES" or "NO")' });
        return;
      }

      const result = await fabricClient.submitTransaction(identity, 'VoteOnProposal', proposalId, body.choice);
      sendJson(res, 202, result);
      return;
    }

    // GET /governance/proposals — list all proposals
    if (url.pathname === '/governance/proposals' && req.method === 'GET') {
      const result = await fabricClient.evaluateTransaction(identity, 'GetAllProposals');
      sendJson(res, 200, result);
      return;
    }

    // GET /governance/proposals/:id — read one proposal + its vote tally
    if (url.pathname.match(/^\/governance\/proposals\/[^/]+$/) && req.method === 'GET') {
      const proposalId = url.pathname.split('/')[3];
      const result = await fabricClient.evaluateTransaction(identity, 'GetProposal', proposalId);
      sendJson(res, 200, result);
      return;
    }

    // GET /governance/audit — full immutable consortium governance history
    if (url.pathname === '/governance/audit' && req.method === 'GET') {
      const result = await fabricClient.evaluateTransaction(identity, 'GetGovernanceAuditTrail');
      sendJson(res, 200, result);
      return;
    }

    // POST /governance/membership/request — sponsor a candidate org's application
    if (url.pathname === '/governance/membership/request' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { candidateMsp, organisationName } = body;

      if (!candidateMsp || !organisationName) {
        sendJson(res, 400, { error: 'Required fields: candidateMsp, organisationName' });
        return;
      }

      const result = await fabricClient.submitTransaction(
        identity,
        'RequestMembership',
        candidateMsp,
        organisationName
      );
      sendJson(res, 202, result);
      return;
    }

    // GET /governance/members — full membership roster (all statuses)
    if (url.pathname === '/governance/members' && req.method === 'GET') {
      const result = await fabricClient.evaluateTransaction(identity, 'GetAllMembers');
      sendJson(res, 200, result);
      return;
    }

    // GET /governance/members/:mspId — single member's status
    if (url.pathname.match(/^\/governance\/members\/[^/]+$/) && req.method === 'GET') {
      const mspId = url.pathname.split('/')[3];
      const result = await fabricClient.evaluateTransaction(identity, 'GetMemberStatus', mspId);
      sendJson(res, 200, result);
      return;
    }

    // ── Compliance endpoints ─────────────────────────────────────────

    // POST /shipments/:id/compliance/flag — Regulator flags a violation
    if (url.pathname.match(/^\/shipments\/[^/]+\/compliance\/flag$/) && req.method === 'POST') {
      const shipmentId = url.pathname.split('/')[2];
      const body = await readJsonBody(req);
      const { violationId, violationType, details } = body;

      if (!violationId || !violationType) {
        sendJson(res, 400, { error: 'Required fields: violationId, violationType, details' });
        return;
      }

      const result = await fabricClient.submitTransaction(
        identity, 'FlagComplianceViolation', shipmentId, violationId, violationType, details || ''
      );
      sendJson(res, 202, result);
      return;
    }

    // GET /shipments/:id/compliance — list violations for a shipment
    if (url.pathname.match(/^\/shipments\/[^/]+\/compliance$/) && req.method === 'GET') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.evaluateTransaction(identity, 'GetComplianceViolations', shipmentId);
      sendJson(res, 200, result);
      return;
    }

    // POST /shipments/:id/compliance/:violationId/resolve — Regulator resolves a violation
    if (url.pathname.match(/^\/shipments\/[^/]+\/compliance\/[^/]+\/resolve$/) && req.method === 'POST') {
      const parts = url.pathname.split('/');
      const shipmentId = parts[2];
      const violationId = parts[4];
      const body = await readJsonBody(req);

      const result = await fabricClient.submitTransaction(
        identity, 'ResolveComplianceViolation', shipmentId, violationId, body.resolutionNotes || ''
      );
      sendJson(res, 202, result);
      return;
    }

    // ── Dispute endpoints ────────────────────────────────────────────

    // POST /shipments/:id/disputes — raise a dispute
    if (url.pathname.match(/^\/shipments\/[^/]+\/disputes$/) && req.method === 'POST') {
      const shipmentId = url.pathname.split('/')[2];
      const body = await readJsonBody(req);
      const { disputeId, reason } = body;

      if (!disputeId || !reason) {
        sendJson(res, 400, { error: 'Required fields: disputeId, reason' });
        return;
      }

      const result = await fabricClient.submitTransaction(identity, 'RaiseDispute', shipmentId, disputeId, reason);
      sendJson(res, 202, result);
      return;
    }

    // GET /shipments/:id/disputes — list disputes for a shipment
    if (url.pathname.match(/^\/shipments\/[^/]+\/disputes$/) && req.method === 'GET') {
      const shipmentId = url.pathname.split('/')[2];
      const result = await fabricClient.evaluateTransaction(identity, 'GetShipmentDisputes', shipmentId);
      sendJson(res, 200, result);
      return;
    }

    // POST /shipments/:id/disputes/:disputeId/respond — counterparty responds
    if (url.pathname.match(/^\/shipments\/[^/]+\/disputes\/[^/]+\/respond$/) && req.method === 'POST') {
      const parts = url.pathname.split('/');
      const shipmentId = parts[2];
      const disputeId = parts[4];
      const body = await readJsonBody(req);

      const result = await fabricClient.submitTransaction(
        identity, 'RespondToDispute', shipmentId, disputeId, body.response || ''
      );
      sendJson(res, 202, result);
      return;
    }

    // POST /shipments/:id/disputes/:disputeId/resolve — Regulator resolves
    if (url.pathname.match(/^\/shipments\/[^/]+\/disputes\/[^/]+\/resolve$/) && req.method === 'POST') {
      const parts = url.pathname.split('/');
      const shipmentId = parts[2];
      const disputeId = parts[4];
      const body = await readJsonBody(req);

      const result = await fabricClient.submitTransaction(
        identity, 'ResolveDispute', shipmentId, disputeId, body.resolution || ''
      );
      sendJson(res, 202, result);
      return;
    }

    sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    // Fabric GatewayError wraps the chaincode error in error.details[].message
    // Extract the real chaincode message so we can correctly classify it
    let chaincodeMessage = '';
    if (Array.isArray(error.details) && error.details.length > 0) {
      chaincodeMessage = error.details.map(d => d.message || '').join(' ');
    }
    const fullMessage = (error.message || '') + ' ' + chaincodeMessage;

    const isAuthError =
      fullMessage.includes('not authorized') ||
      fullMessage.includes('not allowed')    ||
      fullMessage.includes('Only a shipping') ||
      fullMessage.includes('Only Shipping')  ||
      fullMessage.includes('may not')        ||
      fullMessage.includes('access denied');

    const statusCode = isAuthError ? 403 : 400;
    // Prefer the chaincode-level message; fall back to the gateway message
    const errorMessage = chaincodeMessage || error.message;
    sendJson(res, statusCode, { error: errorMessage });
  }
}

// ── Server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  res.on('finish', () => {
    metrics.recordRequest(req.method, requestUrl.pathname, res.statusCode, Date.now() - startedAt);
  });

  route(req, res).catch((error) => {
    sendJson(res, 500, { error: error.message });
  });
});

server.listen(port, () => {
  process.stdout.write(`Maritime consortium API listening on port ${port}\n`);
});
