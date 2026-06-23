# Maritime Consortium Blockchain Framework

A Hyperledger Fabric 2.5 prototype implementing a permissioned consortium blockchain for maritime cargo clearance and document compliance workflows across five participating organisations.

---

## Prerequisites

The following must be installed and running on the host machine before starting the system.

| Requirement | Minimum Version | Purpose |
|---|---|---|
| Docker | 24.x | Runs all Fabric nodes and the API gateway |
| Docker Compose | v2.x (plugin) | Orchestrates the multi-container network |
| curl | any | Used by the test suite |
| bash | any | All scripts are bash |
| Python 3 | 3.8+ | Used by the test suite for JSON formatting |

The network brings up **10 containers** at once (5 peers, 3 orderers, 1 CLI, 1 API gateway). Make sure the host has at least **4 GB of RAM allocated to Docker** and **5 GB of free disk space** for container images.

---

### Installing Docker

If Docker is not yet installed, follow the instructions for your operating system below. If you already have Docker installed, skip to [Verifying Docker](#verifying-docker).

#### Windows

1. Download **Docker Desktop** from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Run the installer. When prompted, leave **"Use WSL 2 instead of Hyper-V"** checked (this is the default and is required).
3. Restart your computer when the installer asks.
4. Launch **Docker Desktop** from the Start menu and wait for the whale icon in the system tray to stop animating — this means the Docker engine has started.
5. Open **Docker Desktop → Settings → Resources** and set memory to at least **4 GB**, then click **Apply & Restart**.
6. Run all commands in this guide from **Git Bash**, **WSL 2**, or another bash-compatible terminal — the scripts will not run in PowerShell or Command Prompt.

#### macOS

1. Download **Docker Desktop for Mac** from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) (choose the Apple Silicon or Intel chip build that matches your Mac).
2. Drag Docker to the Applications folder and launch it.
3. Approve the system permission prompts (Docker needs privileged helper access).
4. Wait for the whale icon in the menu bar to stop animating.
5. Open **Docker Desktop → Settings → Resources** and set memory to at least **4 GB**, then click **Apply & Restart**.

#### Linux (Ubuntu/Debian)

```bash
# Remove any old versions first
sudo apt-get remove docker docker-engine docker.io containerd runc

# Install Docker Engine via the official convenience script
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install the Compose plugin
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Allow your user to run docker without sudo
sudo usermod -aG docker $USER
```

After running `usermod`, **log out and log back in** (or restart the terminal session) for the group change to take effect.

#### Linux (Fedora/RHEL/CentOS)

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in afterwards for the group change to take effect.

---

### Verifying Docker

Before running the system, confirm Docker is installed correctly and running:

```bash
docker --version
docker compose version
docker run hello-world
```

- `docker --version` should print a version `24.x` or higher.
- `docker compose version` should print a version `2.x` (this confirms the Compose **plugin** is installed — the standalone `docker-compose` with a hyphen is a different, older tool and is not used by this project).
- `docker run hello-world` should download a tiny test image and print a "Hello from Docker!" confirmation message. If this fails with a permission error, you have not been added to the `docker` group, or you have not logged out/in after being added — repeat the `usermod` step above and restart your terminal.

> **Important:** Docker must be left running in the background for the entire time the system is up. On Windows and macOS this means keeping Docker Desktop open. On Linux, the Docker daemon runs as a service automatically once installed (`systemctl status docker` to confirm).

---

## System Overview

The network consists of ten Docker containers:

- **5 peer nodes** — one per organisation (Shipping Line A, Shipping Line B, Port Authority, Customs Authority, Regulator)
- **3 RAFT orderer nodes** — operated by Port Authority, Customs Authority, and Regulator
- **1 CLI container** — used internally for channel setup and chaincode deployment
- **1 API gateway container** — Express.js server exposing the REST API on port 8080

All nodes communicate on an isolated Docker bridge network (`maritime_consortium`). The API gateway is the only container with a port exposed to the host.

---

## Starting the System

From the root of the repository, run:

```bash
bash start.sh
```

This single command performs all setup steps in order:

1. **Generates crypto material** — creates MSP identities, TLS certificates, and signing keys for all five organisations and three orderers using `cryptogen`
2. **Generates the genesis block** — creates the `operations` channel genesis block using `configtxgen`
3. **Starts all Docker containers** — brings up peers, orderers, CLI, and API gateway
4. **Creates the channel and joins all peers** — runs `setup-channel.sh` inside the CLI container
5. **Deploys the chaincode** — packages, installs, approves, and commits the `maritime-consortium` chaincode across all organisations via `deploy-chaincode.sh`
6. **Waits for the API gateway** — polls `http://localhost:8080/health` until the gateway is ready

When startup is complete you will see:

```
╔══════════════════════════════════════════════════════════════╗
║  Prototype is running!                                      ║
║                                                             ║
║  API Gateway:  http://localhost:8080                        ║
║  Health Check: http://localhost:8080/health                 ║
║                                                             ║
║  Run tests:    bash tests/run-tests.sh                     ║
║  Stop:         bash stop.sh                                 ║
╚══════════════════════════════════════════════════════════════╝
```

Startup typically takes 2–4 minutes on first run while Docker pulls the Hyperledger Fabric images (~1.5 GB).

---

## API Gateway

The REST API is available at `http://localhost:8080` once the system is running.

### Authentication

All endpoints (except `/health`) require a `Bearer` token in the `Authorization` header. Each token maps to a specific organisation identity:

| Token | Organisation | Role |
|---|---|---|
| `shippingA` | Shipping Line A | Shipping Line |
| `shippingB` | Shipping Line B | Shipping Line |
| `port` | Port Authority | Authority |
| `customs` | Customs Authority | Authority |
| `regulator` | Regulator | Regulator |

**Example:**
```bash
curl -H "Authorization: Bearer shippingA" http://localhost:8080/shipments/SH001
```

### Endpoints

#### General

```
GET  /health
```
Returns system status. No authentication required.

---

```
GET  /metrics
```
Returns live, in-memory request statistics — count, average latency, and error count per route, plus overall uptime and error rate. No authentication required. Resets when the API gateway restarts. See [Performance Metrics Dashboard](#performance-metrics-dashboard-metrics-dashboardhtml) below for a visual view.

---

#### Shipments

```
POST /shipments
```
Create a new shipment. Shipping lines only — authorities and regulator will receive `403`.

Request body:
```json
{
  "shipmentId": "SH001",
  "routeCode": "RT-EAST-01",
  "cargoDescription": "Container electronics"
}
```

---

```
GET  /shipments/:id
```
Retrieve public shipment data. Available to all authenticated organisations.

---

```
GET  /shipments/:id/audit
```
Retrieve the full transaction audit trail for a shipment. Regulator only.

---

#### Clearance Workflow

```
POST /shipments/:id/clearance/approve
```
Record an approval for cargo clearance. The clearance requires approval from three parties: Shipping Line A, Customs Authority, and Port Authority. Each must call this endpoint with their respective token.

---

```
POST /shipments/:id/clearance/finalize
```
Finalise the clearance. This will be rejected with `400` if all three required approvals are not already recorded on-chain.

---

#### Commercial Details (Private Data)

```
POST /shipments/:id/commercial-details
```
Submit commercially sensitive shipment data to the private data collection. Only accessible by the submitting organisation.

Request body:
```json
{
  "commercialDetails": {
    "contractValue": "$450,000",
    "insuranceRef": "INS-2024-881",
    "clientName": "ACME Corp"
  }
}
```

---

```
GET  /shipments/:id/commercial-details
```
Retrieve private commercial data. Only the owning organisation can read its own private data. A competitor organisation will receive `403`.

---

#### Document Compliance

```
POST /documents/upload
```
Upload a document. The file is stored off-chain in `storage/documents/` and its SHA-256 hash is anchored to the ledger.

Request body:
```json
{
  "shipmentId": "SH001",
  "documentId": "DOC001",
  "documentName": "compliance-report.pdf",
  "content": "<base64-encoded file content>"
}
```

---

```
POST /documents/:id/verify
```
Verify a document's integrity. Re-reads the stored file, recomputes its SHA-256 hash, and compares it against the on-chain record. Returns `"matches": true` if the file is intact, `"matches": false` if it has been tampered with.

---

#### Consortium Governance

```
POST /governance/proposals
```
Propose a consortium-level governance change. Caller must be an active member. `changeType` is one of `ADD_MEMBER`, `SUSPEND_MEMBER`, `REVOKE_MEMBER`, `REINSTATE_MEMBER`, `CHANGE_CLEARANCE_THRESHOLD`.

Request body:
```json
{
  "proposalId": "PROP-001",
  "changeType": "SUSPEND_MEMBER",
  "payload": { "targetMsp": "ShippingLineBMSP" }
}
```

---

```
POST /governance/proposals/:id/vote
```
Cast a `YES`/`NO` vote on an open proposal. One vote per active member per proposal. Once `YES` votes reach a majority of currently active members, the proposal is automatically marked `APPROVED` and the change is applied immediately — membership status changes or the clearance-approver rule updates with no separate "apply" step.

Request body: `{ "choice": "YES" }`

---

```
GET  /governance/proposals
GET  /governance/proposals/:id
```
List all proposals, or fetch one proposal with its current vote tally.

---

```
GET  /governance/members
GET  /governance/members/:mspId
```
Full membership roster (status: `ACTIVE`, `PENDING`, `SUSPENDED`, or `REVOKED`), or a single organisation's status.

---

```
POST /governance/membership/request
```
Sponsor a candidate organisation's membership application (caller must already be an active member). Creates a `PENDING` record — does not grant access until an `ADD_MEMBER` proposal reaches quorum.

Request body: `{ "candidateMsp": "ShippingLineCMSP", "organisationName": "Shipping Line C" }`

---

```
GET  /governance/audit
```
The full immutable consortium governance history — every proposal, vote, and outcome, in order.

---

A **suspended or revoked organisation is rejected by the chaincode itself**, not just by the API — every shipment, commercial-data, and document transaction function checks active membership before executing.

---

#### Compliance Enforcement

```
POST /shipments/:id/compliance/flag
```
Regulator-only. Flags a compliance violation against a shipment.

Request body: `{ "violationId": "V001", "violationType": "LATE_FILING", "details": "Filed 3 days late" }`

---

```
GET  /shipments/:id/compliance
```
List all compliance violations recorded against a shipment.

---

```
POST /shipments/:id/compliance/:violationId/resolve
```
Regulator-only. Marks a violation resolved.

Request body: `{ "resolutionNotes": "Penalty waived after review" }`

---

#### Dispute Resolution

```
POST /shipments/:id/disputes
```
Raise a dispute against a shipment. Caller must be an active member. Status flow: `OPEN → RESPONDED → RESOLVED`.

Request body: `{ "disputeId": "D001", "reason": "Cargo weight mismatch" }`

---

```
GET  /shipments/:id/disputes
```
List all disputes for a shipment.

---

```
POST /shipments/:id/disputes/:disputeId/respond
```
Counterparty responds to an open dispute.

Request body: `{ "response": "Weight confirmed correct per manifest" }`

---

```
POST /shipments/:id/disputes/:disputeId/resolve
```
Regulator-only — the neutral arbiter. Resolves a dispute regardless of its current status (except already-`RESOLVED`).

Request body: `{ "resolution": "Manifest takes precedence; no penalty" }`

---

## Running the Test Suite

With the system running, execute:

```bash
bash tests/run-tests.sh
```

The suite runs 70 automated tests covering seven enforcement domains:

1. **Governed Interoperability** — API authentication and access control
2. **Governance Neutrality** — role-based transaction restrictions and multi-party endorsement
3. **Enforceable Confidentiality** — private data isolation between competitor organisations
4. **Bounded Transparency** — regulator audit access and public data visibility
5. **Distributed Validation Authority** — enforcement of multi-approval requirements before finalisation
6. **Hybrid Compliance** — off-chain document storage with on-chain hash anchoring and tamper detection
7. **Advanced Attack Simulation** — cross-org private-data write attempts, full suspend/reinstate/revoke governance round trips with enforcement checks at every step, a non-active member blocked from voting (including voting on its own reinstatement), a forged-approval tamper attempt against `FinalizeClearance`, and a revoked credential rejected identically across repeated "replay" attempts

Each test outputs `PASS` or `FAIL`. Evidence files for all 45 tests are saved to `tests/evidence/` as plain text, capturing the HTTP method, URL, request body, expected status, actual status, and full response body. Domain 7 ends by reinstating Shipping Line B, so the suite leaves the ledger in a clean state for a subsequent run.

### Additional Test Scripts

```bash
bash tests/governance-smoke-test.sh
```
Verifies the consortium governance round trip end-to-end: propose suspending an organisation, vote it to quorum, confirm the chaincode itself blocks that organisation's transactions, then reinstate it and confirm access is restored. Uses fixed proposal IDs — run once per fresh `stop.sh`/`start.sh` cycle.

```bash
bash tests/fault-tolerance-test.sh
```
Proves RAFT orderer resilience: stops 1 of 3 orderers (quorum holds, writes still succeed), stops a 2nd (quorum lost, writes correctly fail), then restarts both (writes succeed again). This script actually stops and restarts your running orderer containers — only run it when you don't need the system for anything else for a couple of minutes. Evidence saved to `tests/evidence/fault-tolerance/`.

```bash
node tests/external-systems-simulation.js
```
Simulates three external, non-blockchain systems — an ERP, a Customs declaration system, and a Port Terminal Operating System — integrating through the API gateway exactly as a real deployment would, with no special access path. Evidence saved to `tests/evidence/interoperability/`.

---

## Chapter 6 Demonstration Scenarios

Five standalone scripts demonstrate the five evaluation scenarios from Chapter 6 of the accompanying thesis (Sections 6.3.1–6.3.5). Each script is self-contained: it creates its own shipment and supporting data using a timestamped ID (e.g. `S1-ONBOARD-1750123456`) so it never conflicts with the main test suite or with other scenario scripts running concurrently.

All scripts are in `tests/` and require the system to be running (`bash start.sh`).

### Section 6.3.1 — Stakeholder Onboarding and Consortium Governance

```bash
bash tests/scenario-1-stakeholder-onboarding.sh
```

Demonstrates on-chain dynamic membership governance. The script proposes adding a new organisation (`FreightCoMSP`) to the consortium, votes it through quorum (3 of 5 active members cast YES), confirms the membership reaches `ACTIVE` status, verifies the new member appears in the roster, and confirms that a duplicate vote from the same member is correctly rejected with `400`. Key checks:

- Governance proposal created and returned `202`
- Three YES votes reach quorum and auto-approve the proposal
- Member status transitions to `ACTIVE` on the ledger
- Duplicate vote blocked by chaincode at protocol level (`400`)
- Governance audit trail records every proposal and vote event

### Section 6.3.2 — Cargo Booking and Multi-Party Clearance

```bash
bash tests/scenario-2-cargo-booking.sh
```

Demonstrates the end-to-end cargo clearance workflow. A shipping line creates a shipment, a compliance document is uploaded with its SHA-256 hash anchored on-chain, and the three required parties (Customs, Port, Shipping Line A) each record their approval. The script confirms that a premature finalise attempt is rejected before all approvals are collected, and that finalisation succeeds once the quorum is met. Key checks:

- Shipment created by Shipping Line A (`202`)
- Regulator blocked from creating shipments (`403`)
- Compliance document uploaded and hash anchored on-chain
- Customs Authority and Port Authority approvals recorded
- Early finalise attempt rejected (`400`) with "missing approvals" error
- Shipping Line A approval added; finalise then succeeds (`200`)
- Shipment status reads `CLEARED`
- Audit trail contains all lifecycle events

### Section 6.3.3 — Confidential Commercial Data

```bash
bash tests/scenario-3-confidentiality.sh
```

Demonstrates the private data collection enforcing commercial confidentiality. Shipping Line A submits commercially sensitive details (contract value, insurance reference) to the `shippingLineAPrivateDetails` collection. The script then reads that data as every participant: authorised organisations (Shipping Line A, Customs, Port, Regulator) receive `200`; Shipping Line B is blocked at chaincode level with `403` — not by the API layer, but by the endorsement policy embedded in the collection definition. Key checks:

- Shipping Line A submits commercial details (`202`)
- Shipping Line A reads own data (`200`)
- Customs Authority reads data (`200`)
- Port Authority reads data (`200`)
- Regulator reads data (`200`)
- Shipping Line B read blocked at chaincode level (`403`)
- Shipping Line B write blocked at chaincode level (`403`)
- Unauthenticated request rejected (`401`)
- Shipping Line B can still read the public shipment record (`200`)

### Section 6.3.4 — Interoperability and Legacy System Integration

```bash
bash tests/scenario-4-interoperability.sh
```

Demonstrates that existing non-blockchain systems can integrate through the standard REST API gateway with no special blockchain access path. The script invokes `tests/external-systems-simulation.js`, which simulates three external systems — an ERP (Shipping Line A's booking system), a Customs declaration system, and a Port Terminal Operating System — each using only HTTP/JSON bearer-token requests. Key checks:

- ERP submits cargo booking and ledger accepts (`202`)
- Customs system submits declaration and approves clearance
- Port TOS approves berth/terminal scheduling
- Full shipment lifecycle completed end-to-end across three simulated external systems
- All systems use the identical API surface — no privileged integration path

### Section 6.3.5 — Auditability and Distributed Verification

```bash
bash tests/scenario-5-auditability.sh
```

Demonstrates four auditability properties. First, every shipment lifecycle event (create, approve, finalise) is immutably recorded in a per-shipment audit trail readable only by the Regulator. Second, every governance action (proposals, votes, outcomes) is separately recorded in the governance audit trail. Third, the SHA-256 hash anchored on-chain during document upload detects any subsequent tampering with the off-chain file: the script uses `docker exec` to overwrite the stored file, then verifies again — `matches` changes from `true` to `false`. Fourth, the RAFT ordering service is shown to tolerate a single orderer failure: one orderer container is stopped mid-test, a new transaction is submitted and succeeds (2/3 quorum holds), then the orderer is restarted. Key checks:

- Per-shipment audit trail retrieved and contains `CREATED`, `CLEARANCE_APPROVED`, and `CLEARED` events
- Governance audit trail retrieved and non-empty
- Original document verifies correctly (`matches: true`)
- Tampered off-chain file immediately detected (`matches: false`)
- Network accepts writes with 1 of 3 orderers down (RAFT 2/3 quorum holds)
- Full two-orderer failure proof available via `bash tests/fault-tolerance-test.sh`

---

## Using the GUI (Browser Interface)

Three browser-based interfaces are included as alternatives to using the terminal or `curl`. All three connect directly to the API gateway running at `http://localhost:8080` — the system must be started with `bash start.sh` before opening any of them.

Open any file by double-clicking it in your file explorer, or by dragging it into a browser window.

---

### Maritime Consortium Portal — `portal.html`

A guided workflow interface that walks through the full shipment lifecycle step by step.

**Login**

When you open the portal, you are presented with a login screen. Select an organisation identity to proceed:

- **Shipping Line A** — can create shipments, submit commercial details, approve clearance
- **Shipping Line B** — can create shipments; cannot access Shipping Line A private data
- **Port Authority** — can approve clearance
- **Customs Authority** — can approve clearance, upload compliance documents
- **Regulator** — can view audit trails and verify documents

You can switch identity at any time by clicking the identity pill in the top bar.

**Workflow Tabs**

The portal is organised into seven sequential tabs:

| Tab | Function |
|---|---|
| **1 — Create Shipment** | Register a new cargo shipment on the ledger. Fill in a Shipment ID, route code, and cargo description. Only shipping lines may do this — selecting an authority identity will show the rejection response. |
| **2 — Commercial Details** | Submit or retrieve confidential commercial data (contract value, insurance reference). Shipping Line A submits its own data. Switch to Shipping Line B and attempt to read it to observe the access denial. |
| **3 — Clearance Approval** | Record approvals from the three required parties. The tab shows three signatory indicators (Shipping Line A, Customs Authority, Port Authority). Switch identity for each and click Approve — the indicators update as each approval lands on-chain. |
| **4 — Finalise Clearance** | Attempt to finalise the shipment clearance. If all three approvals are present the ledger accepts it. If any approval is missing the ledger rejects it with a descriptive error — try finalising early to see this enforced. |
| **5 — Documents** | Upload a compliance document (base64 file picker provided) to store it off-chain and anchor its hash on-chain. Then verify it to confirm integrity. The tab also supports simulating a tampered document to observe the hash mismatch response. |
| **6 — Audit Trail** | Retrieve the full transaction history for a shipment. Only the Regulator identity can access this tab's data. |
| **7 — Governance** | Propose a consortium-level change (suspend/reinstate/revoke a member, admit a new one, or change the clearance-approval rule), then switch identity and vote as different organisations to watch a proposal reach quorum and apply automatically. Also shows the live membership roster and the full governance audit trail. |

All API responses are displayed inline beneath each form in formatted JSON.

---

### Test Console — `test-console.html`

A developer-facing interface that mirrors the full validation suite with individual Run buttons for each test case, plus three additional cards beyond the original six domains: consortium governance (propose, vote, list proposals/members, audit trail, suspended-member enforcement check), compliance enforcement (flag/list/resolve violations), and dispute resolution (raise/respond/resolve/list) — all using whichever identity is currently active in the top bar, with Regulator-only actions forced automatically.

**Identity Bar**

At the top of the page, click any organisation button to set the active identity for subsequent requests:

```
Shipping Line A  |  Shipping Line B  |  Port Authority  |  Customs Authority  |  Regulator
```

**Shipment ID / Document ID Bar**

Enter a Shipment ID and Document ID in the input fields at the top — these are shared across all actions on the page so you only set them once.

**Running Tests**

Each test case is listed as a row with:
- the endpoint and HTTP method shown as a badge
- a brief description of what is being tested
- a **Run** button
- an inline response box that shows the HTTP status and JSON response immediately after the button is clicked

Tests marked in **red** are negative tests — they are expected to fail (e.g. a `401` rejection or a `403` access denial). A correct response for a negative test is the expected error code appearing in the response box.

The clearance approval section includes four sequential step buttons — run them in order to simulate the full three-party approval flow, then attempt early finalisation to confirm the rejection is enforced before all approvals are collected.

A connection status indicator in the top bar shows whether the API gateway at `http://localhost:8080` is reachable. If it shows a red dot, the system is not running — run `bash start.sh` first.

---

### Performance Metrics Dashboard — `metrics-dashboard.html`

A live view over the `GET /metrics` endpoint. Shows total requests, total errors, error rate, and uptime as summary cards, a per-route table (method, path, request count, average latency, error count), and a bar chart of average latency for the 10 busiest routes. Auto-refreshes every 3 seconds (toggle in the top bar) or refresh manually with the button beside it.

Open it after generating some traffic — through the portal, the test console, or any of the test scripts — since it starts empty on a freshly started API gateway. Metrics are in-memory only and reset on restart; they complement, rather than replace, the Hyperledger Caliper load-test figures in Table 6.1.

---

## Stopping the System

```bash
bash stop.sh
```

Removes all Docker containers, volumes, and generated crypto material (`network/organizations/` and `network/channel-artifacts/`). The system returns to a clean state and can be restarted fresh with `bash start.sh`.

---

## Repository Structure

```
├── api/                        API gateway (Node.js + Hyperledger Fabric Gateway SDK)
│   └── src/
│       ├── server.js           HTTP server — all route handlers
│       ├── fabric-client.js    Fabric Gateway connection pool
│       ├── auth.js             Token-to-identity mapping
│       ├── config.js           Peer endpoints and channel configuration
│       └── metrics.js          In-memory request metrics (GET /metrics)
├── chaincode/
│   └── maritime-consortium/
│       ├── index.js                       Chaincode entry point
│       └── lib/
│           ├── maritime-consortium-contract.js   Fabric Contract class — thin entry points only
│           ├── state-keys.js              Shipment / document / audit key schema
│           ├── msp-roles.js                Organisation MSP ID constants
│           ├── governance-keys.js          Proposal / vote / member / rule key schema
│           ├── governance-rules.js         On-chain rule storage + dynamic quorum calculation
│           ├── membership-service.js       Membership lifecycle (ACTIVE/SUSPENDED/REVOKED/PENDING)
│           ├── governance-service.js       Propose → vote → tally → apply orchestration
│           ├── audit-service.js            Immutable shipment + governance audit logging
│           ├── compliance-keys.js          Violation key schema
│           ├── compliance-service.js       Compliance violation flag/resolve
│           ├── dispute-keys.js             Dispute key schema
│           └── dispute-service.js          Dispute raise/respond/resolve
├── network/
│   ├── configtx.yaml           Channel and endorsement policy definitions
│   ├── crypto-config.yaml      Organisation and identity specifications
│   ├── docker/
│   │   └── docker-compose.yaml Full container specification
│   └── scripts/
│       ├── generate.sh         Crypto material and genesis block generation
│       ├── setup-channel.sh    Channel creation and peer join
│       ├── deploy-chaincode.sh Chaincode lifecycle (package → install → approve → commit)
│       └── env.sh              Peer context switching helpers
├── docs/                       Implementation blueprint, validation matrix, framework mapping
├── storage/documents/          Off-chain document storage (mounted into API container)
├── tests/
│   ├── run-tests.sh                       Core validation suite (70 tests)
│   ├── scenario-1-stakeholder-onboarding.sh   Chapter 6 — Section 6.3.1 demonstration
│   ├── scenario-2-cargo-booking.sh            Chapter 6 — Section 6.3.2 demonstration
│   ├── scenario-3-confidentiality.sh          Chapter 6 — Section 6.3.3 demonstration
│   ├── scenario-4-interoperability.sh         Chapter 6 — Section 6.3.4 demonstration
│   ├── scenario-5-auditability.sh             Chapter 6 — Section 6.3.5 demonstration
│   ├── governance-smoke-test.sh           Consortium governance round-trip test
│   ├── fault-tolerance-test.sh            RAFT orderer resilience test
│   ├── external-systems-simulation.js     External-system (ERP/Customs/Port TOS) integration demo
│   └── evidence/                          Per-test evidence output (generated on test run)
├── metrics-dashboard.html      Live performance metrics dashboard
├── start.sh                    Master startup script
└── stop.sh                     Teardown script
```

---

## Troubleshooting

**Startup fails at chaincode deployment**
Run `bash stop.sh` then `bash start.sh` again. Chaincode deployment can time out on first run while Docker pulls the build environment image. A second run uses the cached image and completes faster.

**API gateway never becomes ready**
Check the container logs:
```bash
docker logs api-gateway
```
If it shows a connection error to a peer, the peer may still be initialising. Wait 30 seconds then check manually:
```bash
curl http://localhost:8080/health
```

**Port 8080 is already in use**
Another process is using port 8080. Stop it, or change the port mapping in `network/docker/docker-compose.yaml` under the `api-gateway` service from `"8080:8080"` to `"<your-port>:8080"` before running `start.sh`.

**`docker compose` command not found**
Ensure Docker Compose v2 is installed as a plugin (`docker compose`, not `docker-compose`). On Ubuntu: `sudo apt install docker-compose-plugin`. On macOS/Windows: upgrade Docker Desktop to the latest version.

**`permission denied` when running scripts**
Make the scripts executable:
```bash
chmod +x start.sh stop.sh tests/run-tests.sh
```
