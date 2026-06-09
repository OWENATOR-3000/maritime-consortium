# Network Plan

This directory holds the Hyperledger Fabric network assets for the prototype.

## Planned topology

- Shared operational channel: `operations`
- Five peer organizations:
  - ShippingLineA
  - ShippingLineB
  - PortAuthority
  - CustomsAuthority
  - Regulator
- RAFT orderer organizations:
  - PortAuthority
  - CustomsAuthority
  - Regulator

## Governance targets

- Shipment clearance must require endorsements from:
  - Shipping Line A
  - Customs Authority
  - Port Authority
- Governance/config updates must require signatures from multiple organizations.
- Shipping Line B must not be able to read Shipping Line A private commercial data.

## Planned assets

- `configtx.yaml`
- `organizations/`
- `docker/`
- `collections/`
- `scripts/`

These files are scaffolded to match the client specification and will later be wired into a runnable Fabric environment.
