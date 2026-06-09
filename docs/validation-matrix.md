# Validation Matrix

This matrix converts the client evaluation section into implementation-time test targets.

## 1. Governance neutrality

### Positive

- Multi-organization shipment clearance succeeds when endorsements from Shipping Line A, Customs Authority, and Port Authority are present.

### Negative

- Shipment clearance without Customs Authority endorsement is rejected.
- Governance or endorsement policy update without required admin signatures is rejected.

## 2. Enforceable confidentiality

### Positive

- Shipping Line A retrieves its confidential shipment fields successfully.

### Negative

- Shipping Line B cannot view Shipping Line A private commercial data.
- Shipping Line B cannot retrieve private collection content directly.

## 3. Bounded transparency

### Positive

- Regulator reconstructs full shipment transaction history from immutable ledger records.

### Negative

- Manual alteration or tampering attempt fails validation or is detectable through integrity mismatch evidence.

## 4. Distributed validation authority

### Positive

- Valid multi-endorsed transaction commits successfully.

### Negative

- One orderer is stopped and the network still commits through quorum.
- Transaction without required endorsements is rejected.

## 5. Hybrid compliance

### Positive

- Document hash is anchored on-chain.
- Regulator successfully verifies a document hash against the on-chain reference.

### Negative

- Ledger query cannot return full off-chain document content.
- Tampered off-chain document fails verification.

## 6. Governed interoperability

### Positive

- Authenticated API request commits a transaction.

### Negative

- Unauthenticated API request is denied.

## Suggested Evidence Pack

Minimum target:

- 14 to 16 screenshots covering all mandatory positive and negative cases

Recommended target:

- 20 or more artifacts including terminal output, API responses, ledger query results, and network status screens
