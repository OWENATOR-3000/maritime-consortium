# Tests

## Full Test Suite

Runs all 70 tests across governance, cargo, confidentiality, compliance, and attack scenarios:

```bash
bash tests/run-tests.sh
```

Evidence is saved to `tests/evidence/`.

## Chapter 6 Scenario Scripts

Five standalone scripts for the thesis demonstration scenarios. Each uses timestamped IDs and can be run independently without conflicting with the main suite or each other.

| Script | Scenario | Section |
|---|---|---|
| `scenario-1-stakeholder-onboarding.sh` | Consortium governance onboarding, quorum voting, duplicate vote rejection | 6.3.1 |
| `scenario-2-cargo-booking.sh` | Cargo booking, multi-org clearance, document anchoring, audit trail | 6.3.2 |
| `scenario-3-confidentiality.sh` | Private data collection — authorised reads, ShippingLineB blocked | 6.3.3 |
| `scenario-4-interoperability.sh` | ERP, Customs, Port TOS integration via REST API gateway | 6.3.4 |
| `scenario-5-auditability.sh` | Audit trails, SHA-256 tamper detection, RAFT orderer fault tolerance | 6.3.5 |

Run any scenario:

```bash
bash tests/scenario-1-stakeholder-onboarding.sh
```

## Other Scripts

| Script | Purpose |
|---|---|
| `fault-tolerance-test.sh` | Stops 1 / 2 RAFT orderers, verifies network behaviour |
| `governance-smoke-test.sh` | Quick governance sanity check |
| `external-systems-simulation.js` | Node.js simulation of ERP, Customs, Port TOS (called by scenario 4) |
