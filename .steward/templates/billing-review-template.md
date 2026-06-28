# Billing Review Template

## Focus Areas
- idempotency on retry paths
- ledger integrity
- protected path changes

## Blocking Questions
- Can this change double-post a refund?
- Can this change bypass the ledger write path?
- Do tests cover the changed behavior?
