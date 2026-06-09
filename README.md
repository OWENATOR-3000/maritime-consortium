# Maritime Consortium Blockchain Prototype

This repository contains a Hyperledger Fabric prototype designed to satisfy the requirements described in the client's "Prototype Implementation and Evaluation Specification".

The prototype is not intended to be a generic blockchain demo or a performance benchmark. Its purpose is to demonstrate that the following constraints can be enforced architecturally in a permissioned consortium network:

- Governance neutrality
- Enforceable confidentiality
- Bounded transparency
- Distributed validation authority
- Hybrid compliance
- Governed interoperability

## Project Direction

This project will be delivered as a lean academic MVP.

That means we are not building a full production maritime platform. We are building a focused proof-of-implementation that shows the client's rules can be enforced technically inside a permissioned blockchain system.

The guiding idea is:

- keep what proves the thesis
- cut what only adds enterprise complexity

## What We Are Actually Building

The MVP will demonstrate:

- a permissioned Hyperledger Fabric consortium network
- a shipment workflow with public and private data separation
- endorsement-based clearance approval
- audit trace reconstruction
- off-chain document storage with on-chain hash anchoring
- controlled access through an API layer
- positive and negative test evidence

## What We Are Not Building

To keep the project affordable and realistic, the MVP will not include:

- production deployment
- cloud hosting
- advanced frontend dashboard development
- enterprise-grade identity infrastructure
- large-scale multi-channel business expansion
- performance benchmarking
- hardening for real commercial operations

## Target Scenario

The consortium consists of five organizations:

- Shipping Line A
- Shipping Line B
- Port Authority
- Customs Authority
- Regulator

The implementation target is a Docker-based Hyperledger Fabric network with:

- One peer per organization
- A shared operational channel
- A distributed RAFT ordering service collectively operated by public-interest actors
- Private data collections for commercially sensitive shipment fields
- Off-chain storage for regulatory documents with on-chain hash anchoring
- An API gateway as the only supported integration path into the ledger

## MVP Scope

The affordable MVP should still prove the core academic argument.

The minimum implementation target is:

- 5 organizations represented in the network
- 1 shared operational channel
- 1 shipment lifecycle
- 1 private data collection
- 1 document hash anchoring flow
- 1 API gateway
- positive and negative tests for the major enforcement domains

The MVP does not need multiple business workflows, a polished UI, or full enterprise integrations to satisfy the dissertation objective.

## Implementation Plan

We will implement the system in phases so that each phase adds proof value.

### Phase 1: Environment and Network Foundation

Goal:
- get a runnable local Fabric environment in Docker

Work:
- verify Docker access
- install or confirm Fabric binaries and images
- prepare network configuration
- configure five organizations
- configure the shared operational channel
- define the RAFT ordering layout

Output:
- a local consortium network that can start successfully

### Phase 2: Governance and Data Enforcement

Goal:
- encode the client rules into chaincode and network policy

Work:
- implement shipment creation
- implement clearance approval flow
- enforce endorsement expectations
- add private data collection support
- separate public shipment data from protected commercial fields
- record audit events on ledger state

Output:
- business logic that proves governance and confidentiality rules are enforceable

### Phase 3: Compliance and Integration Layer

Goal:
- prove off-chain compliance and controlled external interaction

Work:
- add local off-chain document storage
- hash documents before ledger anchoring
- implement document verification flow
- add a simple API gateway
- ensure external interactions happen through the gateway rather than direct peer access

Output:
- a working compliance and integration path suitable for demonstration

### Phase 4: Validation and Evidence

Goal:
- prove that the rules work under valid and invalid conditions

Work:
- run positive tests
- run negative tests
- capture screenshots and terminal evidence
- map evidence back to the specification
- prepare concise technical explanation for handover

Output:
- an evidence pack that supports academic evaluation

## Implementation Priorities

If time or budget pressure increases, these items stay first:

- endorsement-based governance proof
- competitor data isolation proof
- document hash verification proof
- API access-control proof
- evidence of both success and failure cases

If something must be reduced, we reduce polish before we reduce proof.

## Planned Repository Structure

- `docs/`
  - Architecture and specification mapping
  - Test and evidence plan
- `network/`
  - Fabric network configuration
  - Channel, MSP, endorsement, and private data settings
- `chaincode/`
  - Smart contract logic for shipments, approvals, audit, and document integrity
- `api/`
  - Gateway service for authenticated transaction submission and queries
- `tests/`
  - Positive and negative validation scenarios tied directly to the specification
- `storage/`
  - Local off-chain document store used by the prototype

## Core Technical Design

### Network

- Hyperledger Fabric in Docker
- one peer per organization
- shared operational channel
- RAFT orderers distributed across Port Authority, Customs Authority, and Regulator

### Governance

- shipment clearance requires multi-party approval
- no single commercial actor may unilaterally finalize critical actions
- governance changes are intended to require multiple administrative signatures

### Confidentiality

- commercially sensitive shipment fields are stored in a private data collection
- shared ledger contains only public shipment data and integrity references
- Shipping Line B must not be able to retrieve Shipping Line A private commercial fields

### Transparency and Audit

- transactions are identity-bound and immutable
- shipment history can be reconstructed for audit purposes
- commercially sensitive content remains hidden from unauthorized participants

### Compliance

- documents are stored off-chain
- only hashes and minimal metadata are stored on-chain
- integrity is verified by recomputing and comparing hashes

### Integration

- all external interaction should pass through the API layer
- the gateway handles controlled submission and query flows

## Delivery Strategy

We will build the prototype in four layers:

1. Network and governance configuration
2. Chaincode enforcing business and visibility rules
3. API gateway and off-chain document handling
4. Validation scripts and evidence checklist

## Success Criteria

The MVP is successful if it can convincingly demonstrate:

- a valid shipment clearance succeeds only when required approvals are present
- an invalid clearance attempt fails
- authorized users can retrieve allowed data
- unauthorized users cannot retrieve protected data
- an off-chain document can be verified through its on-chain hash
- a tampered document fails verification
- API access is controlled
- evidence exists for both positive and negative cases

## Current Status

The repository now contains:

- implementation planning documents
- a chaincode skeleton
- an API skeleton
- network configuration placeholders
- a validation and evidence scaffold

The next work is to convert the scaffolding into a runnable local Fabric MVP.

## Related Documents

- [docs/implementation-blueprint.md](C:\Users\chilw\Documents\blockchain\docs\implementation-blueprint.md)
- [docs/spec-to-build-map.md](C:\Users\chilw\Documents\blockchain\docs\spec-to-build-map.md)
- [docs/validation-matrix.md](C:\Users\chilw\Documents\blockchain\docs\validation-matrix.md)
- [tests/evidence-checklist.md](C:\Users\chilw\Documents\blockchain\tests\evidence-checklist.md)
