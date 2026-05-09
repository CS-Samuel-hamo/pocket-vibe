# Docs

This directory contains supporting product and rollout documents.

The authoritative v1 developer docs are the repo-root files:

- `README.md`
- `QUICKSTART.md`
- `docs/v1_done_definition.md`
- `docs/v1_release_manifest.md`
- `docs/v1_remaining_work.md`
- `docs/git_baseline_plan.md`
- `docs/PRIVACY_POLICY.md`
- `docs/SECURITY_AND_TRUST.md`
- `docs/error_codes.md`

Historical phase documents remain for reference, but the current implementation target is:

- VS Code host first
- mobile PWA control surface
- capability-driven websocket contract
- runtime registry for `codex-cli`, `claude-code`, `opencode`, and `antigravity`

The release gate for v1 is intentionally narrower than the long-term roadmap: stabilize the phone PWA, backend, VS Code bridge, and `codex-cli` reference path before expanding host families.
