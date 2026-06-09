'use strict';

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { port, storagePath } = require('./config');
const { authenticate } = require('./auth');
const FabricClient = require('./fabric-client');

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
  route(req, res).catch((error) => {
    sendJson(res, 500, { error: error.message });
  });
});

server.listen(port, () => {
  process.stdout.write(`Maritime consortium API listening on port ${port}\n`);
});
