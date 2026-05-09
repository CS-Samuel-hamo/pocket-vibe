# Pocket Vibe v1 Release Manifest

Updated: 2026-05-09

This manifest defines what belongs in the v1 baseline commit and what must stay local.

## Stage For v1 Baseline

These categories are part of the product baseline:

- root developer docs: `README.md`, `QUICKSTART.md`, `CONTRIBUTING.md`, `SECURITY_FIXES.md`;
- release docs: `docs/v1_done_definition.md`, `docs/v1_release_manifest.md`, `docs/remote_access_guide.md`, runtime validation docs, host capability docs;
- backend source and tests: `backend/`, `src/`, `tests/`;
- mobile PWA source and tests: `frontend/src/`, `frontend/tests/`, `frontend/package.json`, lock/config files if present;
- VS Code bridge source and tests: `vscode-bridge/src/`, `vscode-bridge/package.json`, TypeScript config and tests;
- startup and support scripts: `start.ps1`, `start.bat`, `scripts/prepare_remote_access.ps1`, `scripts/start_codex.ps1`, `scripts/start_host_probe.ps1`, `scripts/host_probe.py`;
- Steward governance definitions that are stable input: `.steward/modules/`, `.steward/tasks/`, `.steward/reports/goals/`, `.steward/reports/milestones/`, `.steward/reports/workstreams/`, `.steward/agents/`, `.steward/templates/`, `.steward/policies.yaml`, `.steward/constitution.yaml`.

## Keep Local Or Ignore

These categories must not be part of the v1 baseline:

- secrets and local environment files: `.env`, `.env.local`, `.env.*.local`;
- runtime logs: `.logs/`, `logs/`, `*.log`, `backend_error.log`, `backend_run.log`;
- generated scratch output: `qg_*`, `gate_report*`, `curl_*.json`, `test_output*`, `files.txt`, `ips.txt`;
- local databases and caches: `openvibe.db`, `*.sqlite*`, `__pycache__/`, `.pytest_cache/`;
- tool state: `.aider*`, `.qoder/`, `.trae/`, `.pv-vscode-extensions/`, `.pv-vscode-userdata/`, `.pv-vscode-userdata-projects/`;
- generated Steward runtime state: `.steward/approvals/`, `.steward/caller/`, `.steward/evals/`, `.steward/learning/`, `.steward/outcomes/`, `.steward/reports/dashboard.html`, `.steward/reports/tasks/`;
- dependency folders and build products: `node_modules/`, `dist/`, `build/`, `*.vsix`;
- root-level screenshots and media captures used during debugging.

## Review Before Staging

The following categories need human review before they enter the baseline:

- historical docs such as `Phase 2 Logic & Migration.md` and `Restarting System Components.md`;
- old scaffolding files such as `scaffold.py`, `scaffold_ai_project.ps1`, `init_cluster.ps1`, and `init_cluster_bootstrap.ps1`;
- external agent config folders such as `.antigravity/` and `.github/`;
- legacy top-level planning files: `plan.md`, `task.md`, `agents.md`, `GEMINI.md`.

## Current Untracked Review Queue

As of 2026-05-09, the remaining untracked files must stay out of product commits until they are deliberately classified:

| Path | Classification | Decision |
| --- | --- | --- |
| `docs/App_Store_Description.md` | `archive` | Marketing backlog. Keep outside the v1 runtime baseline until M5 distribution work starts. |
| `docs/Beta_Invites.md` | `archive` | Marketing backlog. Keep outside the v1 runtime baseline until beta onboarding is designed. |
| `docs/Discord_Post.md` | `archive` | Marketing backlog. Keep outside the v1 runtime baseline until community launch is approved. |
| `Phase 2 Logic & Migration.md` | `needs-human-review` | Historical planning note. Review before archiving or folding into roadmap docs. |
| `Restarting System Components.md` | `needs-human-review` | Historical operations note. Review before converting into current runbook content. |
| `docs/implementation_plan_phase2.md` | `needs-human-review` | Historical plan. Do not stage without reconciling with the current completion plan. |
| `docs/implementation_plan_phase3.md` | `needs-human-review` | Historical plan. Do not stage without reconciling with the current completion plan. |
| `plan.md` | `needs-human-review` | Legacy top-level planning file. Do not stage until ownership and relevance are clear. |
| `task.md` | `needs-human-review` | Legacy top-level task file. Do not stage until ownership and relevance are clear. |
| `GEMINI.md` | `needs-human-review` | External agent instruction file. Do not stage unless supported as a product integration. |
| `agents.md` | `needs-human-review` | External agent instruction file. Do not stage unless supported as a product integration. |
| `docs/.antigravity/` | `needs-human-review` | External agent config/docs. Review as a future runtime support artifact, not v1 core. |
| `scaffold.py` | `archive` | Old scaffold helper. Keep out of product baseline unless rebuilt as a supported template tool. |
| `scaffold_ai_project.ps1` | `archive` | Old scaffold helper. Keep out of product baseline unless rebuilt as a supported template tool. |
| `init_cluster.ps1` | `archive` | Old cluster/bootstrap helper. Not part of PWA-first single-developer v1. |
| `init_cluster_bootstrap.ps1` | `archive` | Old cluster/bootstrap helper. Not part of PWA-first single-developer v1. |
| `start_openvibe.ps1` | `needs-human-review` | Legacy startup alias. Stage only if it is intentionally kept as a compatibility alias. |
| `infra/` | `needs-human-review` | Infrastructure work must be reviewed separately before Relay MVP or deployment work. |

No current untracked file is classified as `stage` for the v1 product baseline.

## Current Git Metadata Blocker

At the start of baseline work, `backend/` and `frontend/` were nested Git worktrees, not ordinary root-repo directories. This blocker is now resolved for v1 by backing up and removing the nested `.git` pointer files. See [git_baseline_plan.md](/D:/AI_projects/Pocket_Vibe/docs/git_baseline_plan.md) for the recorded decision.

## Baseline Command Sequence

Use this order when preparing a v1 productization commit:

```powershell
git status --short
powershell -ExecutionPolicy Bypass -File scripts\v1_desktop_gate.ps1
git status --short
```

Stage only the files owned by the current task brief:

```powershell
git add <task-owned-files>
git status --short
```

Do not commit if `git status --short` shows logs, local databases, VS Code user data, screenshots, generated reports, or secrets staged for commit.

## Known Post-Baseline Quality Debt

The local pre-commit hook enforces future-state size and complexity limits across the full repository. The v1 baseline may need to be committed with `--no-verify` after the runtime gates above pass, because this is the first commit that brings historical backend, frontend, and bridge source into the root repository. The hook findings must be converted into follow-up refactor tasks instead of blocking the initial baseline.
