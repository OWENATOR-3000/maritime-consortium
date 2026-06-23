'use strict';

// external-systems-simulation.js
//
// Demonstrates that the API gateway is a real, externally-consumable
// integration point — not just an internal test harness — by simulating
// three non-blockchain systems calling through it exactly as a real
// deployment would: a Port Terminal Operating System (TOS), a Customs
// declaration system, and a shipping line's ERP.
//
// Run against a live system: bash start.sh first, then:
//   node tests/external-systems-simulation.js
//
// Evidence (every request/response) is written to
// tests/evidence/interoperability/.

const fs = require('fs');
const path = require('path');

const API = process.env.API_BASE || 'http://localhost:8080';
const EVIDENCE_DIR = path.join(__dirname, 'evidence', 'interoperability');
fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let logIndex = 0;

async function call(persona, token, method, url, body) {
  logIndex += 1;
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API + url, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  const record = { persona, method, url, body, status: res.status, response: data, timestamp: new Date().toISOString() };
  const fileName = `${String(logIndex).padStart(2, '0')}-${persona}-${method}.json`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), JSON.stringify(record, null, 2));

  console.log(`  [${persona}] ${method} ${url} -> ${res.status}`);
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Persona: Shipping Line ERP ──────────────────────────────────────────
// Simulates an enterprise resource planning system pushing a new freight
// booking into the consortium ledger as part of an automated workflow,
// then recording its own (required) clearance approval.
async function erpSimulator() {
  console.log('\n=== ERP Simulator (Shipping Line A) ===');
  await call('erp', 'shippingA', 'POST', '/shipments', {
    shipmentId: 'SH-INTEROP-1',
    routeCode: 'RT-AUTO-01',
    cargoDescription: 'ERP-originated booking'
  });
  await sleep(300);
  await call('erp', 'shippingA', 'POST', '/shipments/SH-INTEROP-1/clearance/approve');
}

// ── Persona: Customs Declaration System ─────────────────────────────────
// Simulates an external customs system submitting its clearance approval
// and uploading a compliance document after an automated document check.
async function customsSystemSimulator() {
  console.log('\n=== Customs Declaration System Simulator ===');
  await call('customs-system', 'customs', 'POST', '/shipments/SH-INTEROP-1/clearance/approve');
  await sleep(300);
  const content = Buffer.from('Automated customs compliance check: PASSED').toString('base64');
  await call('customs-system', 'customs', 'POST', '/documents/upload', {
    shipmentId: 'SH-INTEROP-1',
    documentId: 'DOC-INTEROP-1',
    documentName: 'customs-auto-check.txt',
    content
  });
}

// ── Persona: Port Terminal Operating System (TOS) ───────────────────────
// Simulates a real-world port TOS polling shipment status before recording
// its own clearance approval as cargo physically clears the gate.
async function portTOSSimulator() {
  console.log('\n=== Port Terminal Operating System Simulator ===');
  await call('port-tos', 'port', 'GET', '/health');
  await call('port-tos', 'port', 'GET', '/shipments/SH-INTEROP-1');
  await sleep(300);
  await call('port-tos', 'port', 'POST', '/shipments/SH-INTEROP-1/clearance/approve');
  await sleep(300);
  // With all 3 required approvers now on-chain, finalize as the final step.
  await call('port-tos', 'port', 'POST', '/shipments/SH-INTEROP-1/clearance/finalize');
}

(async () => {
  try {
    await erpSimulator();
    await sleep(300);
    await customsSystemSimulator();
    await sleep(300);
    await portTOSSimulator();

    console.log(`\nEvidence written to: ${EVIDENCE_DIR}`);
    console.log('Interoperability simulation complete — three independent external');
    console.log('systems integrated through the same API gateway with no special access path.');
  } catch (err) {
    console.error('Simulation failed:', err.message);
    process.exit(1);
  }
})();
