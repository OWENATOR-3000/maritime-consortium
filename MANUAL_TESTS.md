# Maritime Consortium — Manual Test Guide

## Prerequisites

1. Start the network: `bash start.sh` (from the `network/` folder)
2. Open `test-console.html` in your browser
3. Check the top-right corner shows **API online** (green dot)

---

## Setup

At the top of the console set:
- **Shipment ID:** `SH100`
- **Document ID:** `DOC100`

These are shared across all tests below.

---

## Domain 6 — Governed Interoperability (Authentication)

### Test 1 — Health check
- Click **Shipping Line A** in the identity bar (or any identity)
- Section: *6 · Governed Interoperability*
- Click **Run** next to "Health check"
- ✅ **Expected:** `HTTP 200` · `{ "ok": true }`

### Test 2 — Unauthenticated request rejected
- Click **Run** next to "Unauthenticated request"
- ✅ **Expected:** `HTTP 401`

### Test 3 — Invalid token rejected
- Click **Run** next to "Invalid token"
- ✅ **Expected:** `HTTP 401`

---

## Domain 1 — Governance Neutrality (Shipment Lifecycle)

### Test 4 — Shipping Line A creates a shipment
- Select **Shipping Line A** in the identity bar
- Section: *1 · Governance Neutrality*
- Confirm route code `RT-EAST-01` and cargo `Container of electronics`
- Click **Run** next to "Create shipment"
- ✅ **Expected:** `HTTP 202` · response contains `shipmentId: "SH100"`

### Test 5 — Regulator cannot create a shipment
- Select **Regulator** in the identity bar
- Click **Run** next to "Create shipment" again
- ✅ **Expected:** `HTTP 403` · error message mentions role restriction

### Test 6 — Shipping Line A approves clearance
- Select **Shipping Line A**
- Click **Step 1 — Approve** in the clearance flow
- ✅ **Expected:** `HTTP 202` · step 1 dot turns green

### Test 7 — Customs Authority approves clearance
- Select **Customs Authority**
- Click **Step 2 — Approve**
- ✅ **Expected:** `HTTP 202` · step 2 dot turns green

### Test 8 — Cannot finalise with missing approvals
- Click **Finalize early** (red button)
- ✅ **Expected:** `HTTP 400` · error mentions incomplete approvals

### Test 9 — Port Authority approves clearance
- Select **Port Authority**
- Click **Step 3 — Approve**
- ✅ **Expected:** `HTTP 202` · step 3 dot turns green

### Test 10 — Finalise clearance with all 3 approvals
- Click **Finalize** (green button)
- ✅ **Expected:** `HTTP 202` · status in response is `CLEARED`

---

## Domain 2 — Enforceable Confidentiality (Private Data)

### Test 11 — Shipping Line A submits commercial details
- Select **Shipping Line A**
- Section: *2 · Enforceable Confidentiality*
- Fields are pre-filled (`$450,000`, `INS-2024-881`, `ACME Corp`) — leave or edit as needed
- Click **Run** next to "Submit commercial details"
- ✅ **Expected:** `HTTP 202` · response contains `privateDataHash`

### Test 12 — Shipping Line A reads its own private data
- Keep **Shipping Line A** selected
- Click **Run** next to "Read commercial details — authorised"
- ✅ **Expected:** `HTTP 200` · full commercial record returned

### Test 13 — Shipping Line B cannot read competitor data
- Click **Run** next to "Read commercial details — Shipping Line B"
- (This button forces the `shippingB` identity regardless of what is selected above)
- ✅ **Expected:** `HTTP 403` · error mentions ShippingLineBMSP not authorised

---

## Domain 3 — Bounded Transparency (Audit Trail)

### Test 14 — Regulator reads audit trail
- Select **Regulator**
- Section: *3 · Bounded Transparency*
- Click **Run** next to "Read audit trail"
- ✅ **Expected:** `HTTP 200` · array of events: `CREATED`, `COMMERCIAL_DETAILS_SUBMITTED`, three `CLEARANCE_APPROVED`, `CLEARANCE_FINALIZED`

### Test 15 — Regulator reads public shipment data
- Select **Regulator**
- Section: *1 · Governance Neutrality*
- Click **Run** next to "Read shipment"
- ✅ **Expected:** `HTTP 200` · public fields returned, no private data

---

## Domain 5 — Hybrid Compliance (Document Anchoring)

### Test 16 — Upload document and anchor hash on-chain
- Select **Customs Authority**
- Section: *5 · Hybrid Compliance*
- Document content field is pre-filled — leave or change as needed
- Click **Upload**
- ✅ **Expected:** `HTTP 202` · response contains `hashValue` (SHA-256 hex string)

### Test 17 — Verify document integrity
- Select **Regulator**
- Click **Verify**
- ✅ **Expected:** `HTTP 200` · `"matches": true`

### Test 18 — Tamper with document and re-verify
- Copy and run the docker command shown in the console in a terminal:
  ```
  docker exec api-gateway sh -c 'echo "TAMPERED" > /storage/documents/DOC100'
  ```
- Click **Verify after tamper**
- ✅ **Expected:** `HTTP 200` · `"matches": false` — cryptographic proof of tampering detected

---

## Summary

| # | Test | Identity | Expected |
|---|------|----------|----------|
| 1 | Health check | any | 200 `ok: true` |
| 2 | No token | none | 401 |
| 3 | Bad token | none | 401 |
| 4 | Create shipment | Shipping Line A | 202 |
| 5 | Create shipment | Regulator | 403 |
| 6 | Approve clearance | Shipping Line A | 202 |
| 7 | Approve clearance | Customs Authority | 202 |
| 8 | Finalize (incomplete) | Shipping Line A | 400 |
| 9 | Approve clearance | Port Authority | 202 |
| 10 | Finalize (complete) | Shipping Line A | 202 `CLEARED` |
| 11 | Submit commercial details | Shipping Line A | 202 |
| 12 | Read commercial details | Shipping Line A | 200 |
| 13 | Read competitor data | Shipping Line B | 403 |
| 14 | Read audit trail | Regulator | 200 |
| 15 | Read public shipment | Regulator | 200 |
| 16 | Upload document | Customs Authority | 202 |
| 17 | Verify integrity | Regulator | 200 `matches: true` |
| 18 | Verify after tamper | Regulator | 200 `matches: false` |
