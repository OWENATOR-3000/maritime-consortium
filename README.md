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

## Running the Test Suite

With the system running, execute:

```bash
bash tests/run-tests.sh
```

The suite runs 20 automated tests covering all six governance enforcement domains:

1. **Governed Interoperability** — API authentication and access control
2. **Governance Neutrality** — role-based transaction restrictions and multi-party endorsement
3. **Enforceable Confidentiality** — private data isolation between competitor organisations
4. **Bounded Transparency** — regulator audit access and public data visibility
5. **Distributed Validation Authority** — enforcement of multi-approval requirements before finalisation
6. **Hybrid Compliance** — off-chain document storage with on-chain hash anchoring and tamper detection

Each test outputs `PASS` or `FAIL`. Evidence files for all 20 tests are saved to `tests/evidence/` as plain text, capturing the HTTP method, URL, request body, expected status, actual status, and full response body.

---

## Using the GUI (Browser Interface)

Two browser-based interfaces are included as alternatives to using the terminal or `curl`. Both connect directly to the API gateway running at `http://localhost:8080` — the system must be started with `bash start.sh` before opening either file.

Open either file by double-clicking it in your file explorer, or by dragging it into a browser window.

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

The portal is organised into six sequential tabs:

| Tab | Function |
|---|---|
| **1 — Create Shipment** | Register a new cargo shipment on the ledger. Fill in a Shipment ID, route code, and cargo description. Only shipping lines may do this — selecting an authority identity will show the rejection response. |
| **2 — Commercial Details** | Submit or retrieve confidential commercial data (contract value, insurance reference). Shipping Line A submits its own data. Switch to Shipping Line B and attempt to read it to observe the access denial. |
| **3 — Clearance Approval** | Record approvals from the three required parties. The tab shows three signatory indicators (Shipping Line A, Customs Authority, Port Authority). Switch identity for each and click Approve — the indicators update as each approval lands on-chain. |
| **4 — Finalise Clearance** | Attempt to finalise the shipment clearance. If all three approvals are present the ledger accepts it. If any approval is missing the ledger rejects it with a descriptive error — try finalising early to see this enforced. |
| **5 — Documents** | Upload a compliance document (base64 file picker provided) to store it off-chain and anchor its hash on-chain. Then verify it to confirm integrity. The tab also supports simulating a tampered document to observe the hash mismatch response. |
| **6 — Audit Trail** | Retrieve the full transaction history for a shipment. Only the Regulator identity can access this tab's data. |

All API responses are displayed inline beneath each form in formatted JSON.

---

### Test Console — `test-console.html`

A developer-facing interface that mirrors the full 20-test validation suite with individual Run buttons for each test case.

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
│       ├── server.js           Express server — all route handlers
│       ├── fabric-client.js    Fabric Gateway connection pool
│       ├── auth.js             Token-to-identity mapping
│       └── config.js           Peer endpoints and channel configuration
├── chaincode/
│   └── maritime-consortium/
│       └── index.js            Smart contract — all transaction functions
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
├── docs/                       Implementation blueprint and validation matrix
├── storage/documents/          Off-chain document storage (mounted into API container)
├── tests/
│   ├── run-tests.sh            Automated test suite (20 tests)
│   └── evidence/               Per-test evidence output (generated on test run)
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
