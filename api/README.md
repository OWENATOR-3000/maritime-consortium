# API Gateway Skeleton

This service is the controlled integration boundary for the prototype.

In the finished system it will:

- authenticate callers
- resolve them to consortium identities
- submit or evaluate transactions through the Fabric gateway SDK
- prevent direct external interaction with peers

For now, the gateway uses a stub Fabric client so the routing surface can be defined before full SDK integration.

## Prototype Tokens

Use these bearer tokens in the `Authorization` header:

- `shippingA`
- `shippingB`
- `port`
- `customs`
- `regulator`

## Planned Endpoints

- `POST /shipments`
- `POST /shipments/:id/clearance/approve`
- `POST /shipments/:id/clearance/finalize`
- `GET /shipments/:id`
- `GET /shipments/:id/audit`
- `GET /shipments/:id/commercial-details`
- `POST /documents/hash`
- `POST /documents/:id/verify`
