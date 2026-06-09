'use strict';

const http = require('http');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Must match the API server's storagePath (config.js / STORAGE_PATH env var)
const STORAGE_PATH = process.env.STORAGE_PATH || '/storage';
const DOCS_DIR = path.join(STORAGE_PATH, 'documents');

// ── Config ─────────────────────────────────────────────────────────────

const API = 'http://localhost:8080';

const TOKENS = {
  1: { key: 'shippingA', label: 'Shipping Line A' },
  2: { key: 'shippingB', label: 'Shipping Line B' },
  3: { key: 'port',      label: 'Port Authority' },
  4: { key: 'customs',   label: 'Customs Authority' },
  5: { key: 'regulator', label: 'Regulator' }
};

// ── Colours ────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
  bgCyan:  '\x1b[46m',
};

// ── HTTP Helper ────────────────────────────────────────────────────────

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const payload = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {}
    };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Readline ───────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function pickToken(prompt) {
  return ask(
    `\n${C.cyan}  Select identity:${C.reset}\n` +
    `    1) Shipping Line A\n` +
    `    2) Shipping Line B\n` +
    `    3) Port Authority\n` +
    `    4) Customs Authority\n` +
    `    5) Regulator\n` +
    `  ${prompt || 'Choice'} [1-5]: `
  );
}

// ── Display Helpers ────────────────────────────────────────────────────

function banner() {
  console.log(`
${C.bgBlue}${C.white}${C.bold}                                                              ${C.reset}
${C.bgBlue}${C.white}${C.bold}   ⚓  Maritime Consortium — Interactive Test Console          ${C.reset}
${C.bgBlue}${C.white}${C.bold}                                                              ${C.reset}
`);
}

function showResult(res) {
  const colour = res.status < 300 ? C.green : res.status < 400 ? C.yellow : C.red;
  console.log(`\n  ${C.bold}Status:${C.reset} ${colour}${res.status}${C.reset}`);
  console.log(`  ${C.bold}Response:${C.reset}`);
  console.log(`  ${C.dim}${JSON.stringify(res.body, null, 2).split('\n').join('\n  ')}${C.reset}\n`);
}

function heading(text) {
  console.log(`\n${C.cyan}${C.bold}  ── ${text} ${'─'.repeat(Math.max(0, 55 - text.length))}${C.reset}`);
}

function divider() {
  console.log(`  ${C.dim}${'─'.repeat(60)}${C.reset}`);
}

// ── Menu Actions ───────────────────────────────────────────────────────

async function healthCheck() {
  heading('Health Check');
  const res = await request('GET', '/health');
  showResult(res);
}

async function createShipment() {
  heading('Create Shipment');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);
  const route = await ask(`  Route code: `);
  const cargo = await ask(`  Cargo description: `);

  console.log(`\n  ${C.dim}Submitting as ${token.label}...${C.reset}`);
  const res = await request('POST', '/shipments', token.key, {
    shipmentId: id,
    routeCode: route,
    cargoDescription: cargo
  });
  showResult(res);
}

async function getShipment() {
  heading('Get Shipment');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);

  console.log(`\n  ${C.dim}Querying as ${token.label}...${C.reset}`);
  const res = await request('GET', `/shipments/${id}`, token.key);
  showResult(res);
}

async function approveClearance() {
  heading('Approve Clearance');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);

  console.log(`\n  ${C.dim}Approving as ${token.label}...${C.reset}`);
  const res = await request('POST', `/shipments/${id}/clearance/approve`, token.key);
  showResult(res);
}

async function finalizeClearance() {
  heading('Finalize Clearance');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);

  console.log(`\n  ${C.dim}Finalizing as ${token.label}...${C.reset}`);
  const res = await request('POST', `/shipments/${id}/clearance/finalize`, token.key);
  showResult(res);
}

async function submitCommercialDetails() {
  heading('Submit Commercial Details (Private Data)');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);
  const contractValue = await ask(`  Contract value (e.g. $500,000): `);
  const insuranceRef = await ask(`  Insurance reference: `);
  const clientName = await ask(`  Client name: `);

  console.log(`\n  ${C.dim}Submitting private data as ${token.label}...${C.reset}`);
  const res = await request('POST', `/shipments/${id}/commercial-details`, token.key, {
    commercialDetails: { contractValue, insuranceRef, clientName }
  });
  showResult(res);
}

async function getCommercialDetails() {
  heading('Get Commercial Details (Private Data)');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);

  console.log(`\n  ${C.dim}Querying private data as ${token.label}...${C.reset}`);
  const res = await request('GET', `/shipments/${id}/commercial-details`, token.key);
  showResult(res);
}

async function getAuditTrail() {
  heading('Get Audit Trail');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const id = await ask(`  Shipment ID: `);

  console.log(`\n  ${C.dim}Retrieving audit trail as ${token.label}...${C.reset}`);
  const res = await request('GET', `/shipments/${id}/audit`, token.key);
  showResult(res);
}

async function uploadDocument() {
  heading('Upload Document (Off-Chain + Hash Anchor)');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const shipmentId = await ask(`  Shipment ID: `);
  const documentId = await ask(`  Document ID: `);
  const documentName = await ask(`  Document name: `);
  const content = await ask(`  Document content (text): `);

  const encoded = Buffer.from(content).toString('base64');

  console.log(`\n  ${C.dim}Uploading and anchoring hash as ${token.label}...${C.reset}`);
  const res = await request('POST', '/documents/upload', token.key, {
    shipmentId, documentId, documentName, content: encoded
  });
  showResult(res);
}

async function verifyDocument() {
  heading('Verify Document Integrity');
  const choice = await pickToken();
  const token = TOKENS[choice];
  if (!token) { console.log(`  ${C.red}Invalid choice.${C.reset}`); return; }

  const documentId = await ask(`  Document ID: `);

  console.log(`\n  ${C.dim}Verifying stored document hash as ${token.label}...${C.reset}`);
  const res = await request('POST', `/documents/${documentId}/verify`, token.key);
  showResult(res);

  if (res.body && typeof res.body.matches !== 'undefined') {
    if (res.body.matches) {
      console.log(`  ${C.green}${C.bold}✓ Document integrity VERIFIED — hash matches on-chain record.${C.reset}\n`);
    } else {
      console.log(`  ${C.red}${C.bold}✗ Document TAMPERED — hash does NOT match on-chain record.${C.reset}\n`);
    }
  }
}

async function testUnauthenticated() {
  heading('Test Unauthenticated Access');
  console.log(`\n  ${C.dim}Sending request with NO auth token...${C.reset}`);
  const res = await request('GET', '/shipments/SH001');
  showResult(res);
  if (res.status === 401) {
    console.log(`  ${C.green}${C.bold}✓ Correctly rejected — API access is controlled.${C.reset}\n`);
  }
}

async function runFullDemo() {
  heading('Full Shipment Lifecycle Demo');
  console.log(`\n  ${C.magenta}This will run a complete shipment lifecycle demonstrating all enforcement domains.${C.reset}\n`);

  const shipmentId = 'DEMO-' + Date.now().toString(36).toUpperCase();
  const docId = 'DOC-' + Date.now().toString(36).toUpperCase();

  const step = (n, text) => console.log(`\n  ${C.bgCyan}${C.white} Step ${n} ${C.reset} ${C.bold}${text}${C.reset}`);

  // 1. Create shipment
  step(1, 'Create shipment as Shipping Line A');
  let res = await request('POST', '/shipments', 'shippingA', {
    shipmentId: shipmentId,
    routeCode: 'RT-DEMO-01',
    cargoDescription: 'Demo cargo — container electronics'
  });
  showResult(res);

  // 2. Negative — Regulator cannot create
  step(2, 'Regulator tries to create a shipment (should FAIL)');
  res = await request('POST', '/shipments', 'regulator', {
    shipmentId: 'FAIL-001',
    routeCode: 'RT-X',
    cargoDescription: 'Should fail'
  });
  showResult(res);
  console.log(`  ${res.status >= 400 ? C.green + '✓ Correctly denied' : C.red + '✗ Unexpected success'}${C.reset}`);

  // 3. Submit commercial details
  step(3, 'Submit private commercial details (Shipping Line A)');
  res = await request('POST', `/shipments/${shipmentId}/commercial-details`, 'shippingA', {
    commercialDetails: {
      contractValue: '$750,000',
      insuranceRef: 'INS-DEMO-2024',
      clientName: 'Acme Maritime Corp'
    }
  });
  showResult(res);

  // 4. Shipping Line A reads own private data
  step(4, 'Shipping Line A reads own commercial details (should SUCCEED)');
  res = await request('GET', `/shipments/${shipmentId}/commercial-details`, 'shippingA');
  showResult(res);
  console.log(`  ${res.status === 200 ? C.green + '✓ Private data accessible to owner' : C.red + '✗ Unexpected failure'}${C.reset}`);

  // 5. Shipping Line B tries to read (should fail)
  step(5, 'Shipping Line B tries to read competitor data (should FAIL)');
  res = await request('GET', `/shipments/${shipmentId}/commercial-details`, 'shippingB');
  showResult(res);
  console.log(`  ${res.status >= 400 ? C.green + '✓ Competitor data correctly isolated' : C.red + '✗ Data leak!'}${C.reset}`);

  // 6. Three-party clearance approval
  step(6, 'Multi-party clearance approval (3 organizations)');
  for (const [token, label] of [['shippingA', 'Shipping Line A'], ['customs', 'Customs Authority'], ['port', 'Port Authority']]) {
    console.log(`    ${C.dim}→ ${label} approving...${C.reset}`);
    res = await request('POST', `/shipments/${shipmentId}/clearance/approve`, token);
    console.log(`    ${res.status < 300 ? C.green + '✓' : C.red + '✗'} ${label}: ${res.status}${C.reset}`);
  }

  // 7. Finalize clearance
  step(7, 'Finalize clearance');
  res = await request('POST', `/shipments/${shipmentId}/clearance/finalize`, 'shippingA');
  showResult(res);
  console.log(`  ${res.body.status === 'CLEARED' ? C.green + '✓ Shipment CLEARED' : C.red + '✗ Not cleared'}${C.reset}`);

  // 8. Negative — finalize without approvals
  step(8, 'Try finalize on a new shipment with NO approvals (should FAIL)');
  const failShip = 'FAIL-CLR-' + Date.now().toString(36).toUpperCase();
  await request('POST', '/shipments', 'shippingA', {
    shipmentId: failShip, routeCode: 'RT-X', cargoDescription: 'Test'
  });
  res = await request('POST', `/shipments/${failShip}/clearance/finalize`, 'shippingA');
  showResult(res);
  console.log(`  ${res.status >= 400 ? C.green + '✓ Correctly rejected — missing approvals' : C.red + '✗ Unexpected success'}${C.reset}`);

  // 9. Upload document
  step(9, 'Upload regulatory document and anchor hash on-chain');
  const docContent = `Regulatory compliance report for shipment ${shipmentId}. Inspected and approved.`;
  res = await request('POST', '/documents/upload', 'customs', {
    shipmentId: shipmentId,
    documentId: docId,
    documentName: 'compliance-report.pdf',
    content: Buffer.from(docContent).toString('base64')
  });
  showResult(res);

  // 10. Verify document
  step(10, 'Verify document integrity (should match)');
  res = await request('POST', `/documents/${docId}/verify`, 'regulator');
  showResult(res);
  console.log(`  ${res.body.matches === true ? C.green + '✓ Document integrity verified' : C.red + '✗ Mismatch'}${C.reset}`);

  // 11. Audit trail
  step(11, 'Regulator retrieves full audit trail');
  res = await request('GET', `/shipments/${shipmentId}/audit`, 'regulator');
  const events = Array.isArray(res.body) ? res.body : [];
  console.log(`\n  ${C.bold}Audit events (${events.length}):${C.reset}`);
  for (const ev of events) {
    console.log(`    ${C.cyan}${ev.eventType}${C.reset} — by ${C.yellow}${ev.submittedBy}${C.reset} at ${new Date(ev.timestamp * 1000).toISOString()}`);
  }

  // 12. Unauthenticated
  step(12, 'Unauthenticated request (should return 401)');
  res = await request('GET', `/shipments/${shipmentId}`);
  showResult(res);
  console.log(`  ${res.status === 401 ? C.green + '✓ API access control working' : C.red + '✗ Not protected'}${C.reset}`);

  // 13. Shipping Line B tries to approve clearance (should fail — not an authorised approver)
  step(13, 'Shipping Line B tries to approve clearance (should FAIL — not an authorised approver)');
  const shipBClearanceShip = 'CLR-SHIPB-' + Date.now().toString(36).toUpperCase();
  await request('POST', '/shipments', 'shippingB', {
    shipmentId: shipBClearanceShip,
    routeCode: 'RT-SHIPB-TEST',
    cargoDescription: 'ShipB clearance test cargo'
  });
  res = await request('POST', `/shipments/${shipBClearanceShip}/clearance/approve`, 'shippingB');
  showResult(res);
  console.log(
    `  ${res.status >= 400
      ? C.green + '✓ Correctly denied — ShipB cannot approve clearance (only ShipA, Customs, Port may approve)'
      : C.red + '✗ Unexpected success — enforcement gap!'
    }${C.reset}`
  );

  // 14. Tampered document hash mismatch (demonstrates immutability of on-chain hash)
  step(14, 'Tampered document — hash mismatch detection (should return matches: false)');
  const tamperedDocId = 'TAMPER-DOC-' + Date.now().toString(36).toUpperCase();
  const originalContent = `Original compliance document for tamper test — shipment ${shipmentId}.`;

  // Upload the original document and anchor its hash on-chain
  console.log(`\n  ${C.dim}Uploading original document...${C.reset}`);
  res = await request('POST', '/documents/upload', 'customs', {
    shipmentId: shipmentId,
    documentId: tamperedDocId,
    documentName: 'tamper-test.pdf',
    content: Buffer.from(originalContent).toString('base64')
  });
  showResult(res);

  // Tamper with the stored file on disk (simulates an attacker modifying the off-chain file)
  const storedFilePath = path.join(DOCS_DIR, tamperedDocId);
  if (fs.existsSync(storedFilePath)) {
    console.log(`\n  ${C.yellow}${C.bold}⚠  Tampering with the stored file on disk...${C.reset}`);
    fs.writeFileSync(storedFilePath, 'TAMPERED CONTENT — this does not match the on-chain hash.');
    console.log(`  ${C.yellow}File at ${storedFilePath} has been overwritten with corrupted content.${C.reset}\n`);
  } else {
    console.log(`  ${C.yellow}Warning: stored file not found at ${storedFilePath} — skipping tamper step.${C.reset}\n`);
  }

  // Now verify — the recomputed hash will NOT match the on-chain record
  console.log(`  ${C.dim}Verifying document integrity after tampering...${C.reset}`);
  res = await request('POST', `/documents/${tamperedDocId}/verify`, 'regulator');
  showResult(res);
  if (res.body && typeof res.body.matches !== 'undefined') {
    if (!res.body.matches) {
      console.log(`  ${C.green}${C.bold}✓ Tamper DETECTED — on-chain hash does NOT match the modified file. Immutability proven.${C.reset}\n`);
    } else {
      console.log(`  ${C.red}${C.bold}✗ Tamper NOT detected — this is unexpected. Check that the tamper step ran correctly.${C.reset}\n`);
    }
  }

  // Summary
  console.log(`
${C.bgBlue}${C.white}${C.bold}                                                              ${C.reset}
${C.bgBlue}${C.white}${C.bold}   ✓  Full lifecycle demo complete!  Shipment: ${shipmentId}     ${C.reset}
${C.bgBlue}${C.white}${C.bold}                                                              ${C.reset}
`);
}

// ── Standalone Negative Tests ──────────────────────────────────────────

async function testShipBClearanceDenied() {
  heading('ShipB Denied — Approve Clearance');
  const shipmentId = 'CLR-SHIPB-' + Date.now().toString(36).toUpperCase();
  console.log(`\n  ${C.dim}Creating a shipment as Shipping Line B so we have something to attempt approval on...${C.reset}`);

  let res = await request('POST', '/shipments', 'shippingB', {
    shipmentId,
    routeCode: 'RT-SHIPB-NEG',
    cargoDescription: 'Negative test cargo'
  });
  console.log(`  ${C.dim}Shipment created: ${shipmentId}${C.reset}`);

  console.log(`\n  ${C.dim}Now attempting ApproveClearance as Shipping Line B (should be denied)...${C.reset}`);
  res = await request('POST', `/shipments/${shipmentId}/clearance/approve`, 'shippingB');
  showResult(res);
  if (res.status >= 400) {
    console.log(`  ${C.green}${C.bold}✓ Correctly denied — ShipB is not an authorised clearance approver.${C.reset}`);
    console.log(`  ${C.dim}(Only ShippingLineA, CustomsAuthority, and PortAuthority may approve clearance.)${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ Unexpected success — enforcement gap!${C.reset}\n`);
  }
}

async function testTamperedDocument() {
  heading('Tampered Document — Hash Mismatch Detection');

  const shipmentId = 'TAMPER-SHIP-' + Date.now().toString(36).toUpperCase();
  const documentId = 'TAMPER-DOC-' + Date.now().toString(36).toUpperCase();
  const originalContent = `Legitimate compliance document for shipment ${shipmentId}. Approved by Customs.`;

  // Create a shipment to anchor the document against
  console.log(`\n  ${C.dim}Step 1: Creating shipment ${shipmentId}...${C.reset}`);
  await request('POST', '/shipments', 'shippingA', {
    shipmentId,
    routeCode: 'RT-TAMPER-01',
    cargoDescription: 'Tamper test cargo'
  });

  // Upload document and anchor hash on-chain
  console.log(`  ${C.dim}Step 2: Uploading original document and anchoring hash on-chain...${C.reset}`);
  let res = await request('POST', '/documents/upload', 'customs', {
    shipmentId,
    documentId,
    documentName: 'tamper-test-doc.pdf',
    content: Buffer.from(originalContent).toString('base64')
  });
  showResult(res);
  console.log(`  ${C.dim}On-chain hash: ${res.body.hashValue || 'see above'}${C.reset}`);

  // Tamper with the stored file on disk
  const storedFilePath = path.join(DOCS_DIR, documentId);
  if (fs.existsSync(storedFilePath)) {
    console.log(`\n  ${C.yellow}${C.bold}⚠  Step 3: Tampering — overwriting the off-chain file with corrupted content...${C.reset}`);
    fs.writeFileSync(storedFilePath, 'TAMPERED CONTENT — an attacker modified this file after it was registered.');
    console.log(`  ${C.yellow}File: ${storedFilePath}${C.reset}`);
    console.log(`  ${C.yellow}New content does NOT match the SHA-256 hash stored on-chain.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}Stored file not found at ${storedFilePath}.${C.reset}`);
    console.log(`  ${C.dim}Ensure the API server's STORAGE_PATH env var matches this script's STORAGE_PATH.${C.reset}\n`);
    return;
  }

  // Verify — should return matches: false
  console.log(`  ${C.dim}Step 4: Verifier (Regulator) calls verify endpoint...${C.reset}`);
  res = await request('POST', `/documents/${documentId}/verify`, 'regulator');
  showResult(res);
  if (res.body && typeof res.body.matches !== 'undefined') {
    if (!res.body.matches) {
      console.log(`  ${C.green}${C.bold}✓ Tamper DETECTED — hash mismatch confirmed. The blockchain record cannot be forged.${C.reset}\n`);
    } else {
      console.log(`  ${C.red}${C.bold}✗ Tamper NOT detected — check that the file tamper step ran correctly.${C.reset}\n`);
    }
  }
}

// ── Main Menu ──────────────────────────────────────────────────────────

const MENU = [
  { key: '0',  label: 'Health Check',                        fn: healthCheck,              domain: '' },
  null, // divider
  { key: '1',  label: 'Create Shipment',                     fn: createShipment,           domain: '1. Governance' },
  { key: '2',  label: 'Get Shipment',                        fn: getShipment,              domain: '3. Transparency' },
  { key: '3',  label: 'Approve Clearance',                   fn: approveClearance,         domain: '1. Governance' },
  { key: '4',  label: 'Finalize Clearance',                  fn: finalizeClearance,        domain: '1. Governance' },
  null,
  { key: '5',  label: 'Submit Commercial Details (private)', fn: submitCommercialDetails,  domain: '2. Confidentiality' },
  { key: '6',  label: 'Get Commercial Details (private)',    fn: getCommercialDetails,     domain: '2. Confidentiality' },
  null,
  { key: '7',  label: 'Get Audit Trail',                     fn: getAuditTrail,            domain: '3. Transparency' },
  null,
  { key: '8',  label: 'Upload Document (off-chain + hash)',  fn: uploadDocument,           domain: '5. Compliance' },
  { key: '9',  label: 'Verify Document Integrity',           fn: verifyDocument,           domain: '5. Compliance' },
  null,
  { key: '10', label: 'Test Unauthenticated Access (401)',   fn: testUnauthenticated,      domain: '6. Interoperability' },
  null,
  { key: '11', label: 'ShipB denied Approve Clearance (403)',fn: testShipBClearanceDenied, domain: '1. Governance' },
  { key: '12', label: 'Tampered Doc — Hash Mismatch Test',  fn: testTamperedDocument,     domain: '5. Compliance' },
  null,
  { key: 'D',  label: 'Run Full Lifecycle Demo (all tests)', fn: runFullDemo,              domain: 'ALL' },
  { key: 'Q',  label: 'Quit',                                fn: null,                     domain: '' }
];

function showMenu() {
  console.log(`  ${C.bold}Select an operation:${C.reset}\n`);
  for (const item of MENU) {
    if (!item) {
      divider();
      continue;
    }
    const domain = item.domain ? `${C.dim}[${item.domain}]${C.reset}` : '';
    const key = item.key.length === 1 ? ` ${item.key}` : item.key;
    console.log(`    ${C.cyan}${C.bold}${key}${C.reset})  ${item.label}  ${domain}`);
  }
  console.log('');
}

async function main() {
  banner();

  // Quick health check
  try {
    const check = await request('GET', '/health');
    if (check.status === 200) {
      console.log(`  ${C.green}✓ API is reachable at ${API}${C.reset}\n`);
    }
  } catch {
    console.log(`  ${C.red}✗ Cannot reach API at ${API}. Is the network running?${C.reset}\n`);
    rl.close();
    return;
  }

  while (true) {
    showMenu();
    const choice = (await ask(`  ${C.bold}▸${C.reset} `)).trim().toUpperCase();

    if (choice === 'Q') {
      console.log(`\n  ${C.dim}Goodbye!${C.reset}\n`);
      break;
    }

    const item = MENU.find(m => m && m.key.toUpperCase() === choice);
    if (!item || !item.fn) {
      console.log(`  ${C.red}Invalid option. Try again.${C.reset}\n`);
      continue;
    }

    try {
      await item.fn();
    } catch (err) {
      console.log(`  ${C.red}Error: ${err.message}${C.reset}\n`);
    }

    await ask(`  ${C.dim}Press Enter to continue...${C.reset}`);
    console.clear();
    banner();
  }

  rl.close();
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
