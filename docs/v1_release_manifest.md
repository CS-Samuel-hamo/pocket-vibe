# Pocket Vibe v1 Release Manifest

Updated: 2026-05-01

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

As of 2026-05-02, the remaining untracked files should be handled as follows before a release baseline:

- Release infrastructure, now validated against existing repo commands and safe to stage: `.github/`, `.pre-commit-config.yaml`.
- Module docs, now updated for current v1 wording and safe to stage: `backend/README.md`, `frontend/README.md`.
- Marketing or distribution backlog, do not stage for v1 runtime baseline by default: `docs/App_Store_Description.md`, `docs/Beta_Invites.md`, `docs/Discord_Post.md`.
- Historical planning backlog, keep local or move to archive after review: `Phase 2 Logic & Migration.md`, `Restarting System Components.md`, `docs/implementation_plan_phase2.md`, `docs/implementation_plan_phase3.md`, `plan.md`, `task.md`.
- Legacy agent/scaffold material, do not stage without a separate template decision: `GEMINI.md`, `agents.md`, `scaffold.py`, `scaffold_ai_project.ps1`, `init_cluster.ps1`, `init_cluster_bootstrap.ps1`, `docs/.antigravity/`.
- Legacy startup alias, stage only if it remains a documented supported path: `start_openvibe.ps1`.
- Infrastructure folder, review independently before staging: `infra/`.

## Current Git Metadata Blocker

At the start of baseline work, `backend/` and `frontend/` were nested Git worktrees, not ordinary root-repo directories. This blocker is now resolved for v1 by backing up and removing the nested `.git` pointer files. See [git_baseline_plan.md](/D:/AI_projects/Pocket_Vibe/docs/git_baseline_plan.md) for the recorded decision.

## Baseline Command Sequence

Use this order when preparing the first v1 baseline commit:

```powershell
git status --short
pytest tests -q
cd frontend
npm run test:capabilities
npm run build
cd ..\vscode-bridge
npm run compile
cd ..
git add README.md QUICKSTART.md .gitignore docs/v1_done_definition.md docs/v1_release_manifest.md docs/git_baseline_plan.md docs/README.md tasks/todo.md .steward/reports/workstreams/pocket-vibe-v1-active-plan.md
git status --short
```

After the Git metadata blocker is resolved, stage the full source baseline:

```powershell
git add README.md QUICKSTART.md .gitignore docs/ backend/ src/ frontend/ vscode-bridge/ tests/ scripts/ start.ps1 start.bat tasks/ .steward/
git status --short
```

Do not commit if `git status --short` shows logs, local databases, VS Code user data, screenshots, generated reports, or secrets staged for commit.

## Known Post-Baseline Quality Debt

The local pre-commit hook enforces future-state size and complexity limits across the full repository. The v1 baseline may need to be committed with `--no-verify` after the runtime gates above pass, because this is the first commit that brings historical backend, frontend, and bridge source into the root repository. The hook findings must be converted into follow-up refactor tasks instead of blocking the initial baseline.
