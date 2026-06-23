# Caliper Benchmarking — Maritime Consortium Prototype

Produces the evidence behind **Figure 6.8** (environment), **Figure 6.9**
(throughput/latency) and **Table 6.1** (results summary) of Chapter 6.

## Prerequisites

- Node.js 18+
- The Fabric network running with chaincode deployed:
  `cd network && bash ../start.sh` (network up, channel `operations`, chaincode `maritime-consortium`)
- Crypto material generated at `network/organizations/` (done by `generate.sh`)

## One-time setup

```bash
cd caliper
npm install
npx caliper bind --caliper-bind-sut fabric:fabric-gateway
```

## Run the benchmark

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig network-config.yaml \
  --caliper-benchconfig benchmarks/maritime.yaml
```

Duration: roughly 10–15 minutes (some rounds pre-create shipments before timing starts).

## Output

- `report.html` — the official Caliper report (keep this in the repo as Chapter 6 evidence;
  this is the primary artifact an examiner can ask for).
- Console summary table — TPS, avg/max latency, success rate per round.

## After the run

1. Update **Table 6.1** with the real numbers from `report.html`.
2. Regenerate **Figure 6.9** charts from the same numbers.
3. Commit `report.html` alongside the figures.

## Notes

- Identities used: `User1` of Shipping Line A, Customs Authority and Port Authority
  (paths in `network-config.yaml`). If your cryptogen output names the private key
  differently (not `priv_sk`), adjust the `clientPrivateKey.path` entries.
- `SubmitCommercialDetails` and `GetCommercialDetails` exercise the private data
  collection via transient data, endorsed only by Shipping Line A — mirroring the
  API gateway behaviour.
- Each `ApproveClearance` tx targets its own pre-created shipment to avoid MVCC
  read conflicts; approver identity rotates across the three authorised MSPs.
- All benchmark shipment IDs are prefixed `BENCH_` so demo data (SH001 etc.) is untouched.
