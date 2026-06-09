# Evidence Checklist

## Governance neutrality

- [ ] Multi-organization clearance succeeds
- [ ] Unilateral clearance attempt fails
- [ ] Unauthorized governance update fails

## Enforceable confidentiality

- [ ] Shipping Line A can read private commercial fields
- [ ] Shipping Line B cannot read private commercial fields
- [ ] Direct private data retrieval attempt by Shipping Line B fails

## Bounded transparency

- [ ] Regulator reconstructs shipment history
- [ ] Historical tampering attempt fails or is shown as invalid

## Distributed validation authority

- [ ] Valid multi-endorsed transaction commits
- [ ] One orderer can be stopped while quorum continues
- [ ] Missing endorsement transaction is rejected

## Hybrid compliance

- [ ] Document hash is anchored on-chain
- [ ] Full document cannot be retrieved from the ledger
- [ ] Original document verifies successfully
- [ ] Tampered document fails verification

## Governed interoperability

- [ ] Authenticated API call succeeds
- [ ] Unauthenticated API call is rejected
