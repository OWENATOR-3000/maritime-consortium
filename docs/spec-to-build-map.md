# Spec to Build Map

This document translates each client requirement into a concrete implementation artifact.

## Governance neutrality

Requirement:
- No single organization may unilaterally clear shipments or alter governance settings.

Build response:
- Channel endorsement policy requiring Shipping Line A, Customs Authority, and Port Authority for shipment clearance
- Configuration update policies requiring multi-organization admin signatures
- RAFT orderers distributed across Port Authority, Customs Authority, and Regulator

Evidence:
- Successful multi-party clearance
- Rejected unilateral clearance
- Rejected unilateral policy modification

## Enforceable confidentiality

Requirement:
- Shipping Line A can store sensitive commercial fields that Shipping Line B cannot read.

Build response:
- Private data collection for sensitive shipment commercial details
- Public ledger stores only non-sensitive metadata plus integrity references
- Chaincode query paths that return private content only to authorized organizations

Evidence:
- Shipping Line A can retrieve private fields
- Shipping Line B receives no private fields or an authorization failure
- Direct private data retrieval by Shipping Line B is rejected

## Bounded transparency

Requirement:
- Regulator can reconstruct shipment history without exposing competitor-sensitive content.

Build response:
- Append-only shipment event model on the ledger
- Audit trail query endpoint
- Event metadata including transaction ID, timestamp, submitting MSP, and state changes

Evidence:
- Regulator reconstructs shipment history
- Historical tampering attempt fails or produces integrity mismatch evidence

## Distributed validation authority

Requirement:
- Validation and ordering authority must be structurally distributed.

Build response:
- Multi-organization endorsement policy
- RAFT ordering cluster with quorum behavior

Evidence:
- Successful multi-endorsement commit
- Continued operation after one orderer failure
- Rejection when endorsement threshold is not met

## Hybrid compliance

Requirement:
- Regulatory documents remain off-chain, while authenticity remains verifiable on-chain.

Build response:
- Local document storage outside the ledger
- SHA-256 hash anchoring on-chain
- Verification endpoint that recomputes document hashes

Evidence:
- Hash recorded on-chain
- Full document cannot be retrieved from the ledger
- Correct document verifies successfully
- Tampered document fails verification

## Governed interoperability

Requirement:
- External integrations must be authenticated and mediated by an API layer.

Build response:
- API gateway service
- Authentication middleware
- No direct client-to-peer interaction

Evidence:
- Authenticated API submission succeeds
- Unauthenticated API request is denied
