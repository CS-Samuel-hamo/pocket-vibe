# Billing Task Template

## Domain Goal
Protect billing behavior while applying the requested change.

## Required Domain Rules
- refunds must remain idempotent
- ledger writes must stay traceable
- do not bypass the standard write path

## Expected Output
- a bounded patch
- a short rule trace
- updated tests for behavior changes
