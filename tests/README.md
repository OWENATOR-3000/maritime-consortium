# Test Plan

This directory will hold repeatable positive and negative tests for the prototype.

The evidence requirements in the client specification make testing a first-class deliverable, not a final afterthought.

## Planned test groups

- `governance/`
- `confidentiality/`
- `transparency/`
- `validation-authority/`
- `hybrid-compliance/`
- `interoperability/`

## Evidence targets

Each scenario should produce evidence that can be captured in screenshots or terminal output:

- request submitted
- endorsements present or missing
- commit success or failure
- access allowed or denied
- hash match or mismatch
- orderer node up or down

The final evidence pack should be traceable directly back to the validation matrix in `docs/validation-matrix.md`.
