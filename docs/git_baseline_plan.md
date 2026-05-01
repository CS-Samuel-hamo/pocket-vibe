# Pocket Vibe Git Baseline Plan

Updated: 2026-05-01

## Current Finding

Pocket Vibe was not a clean single-repo worktree at the start of the v1 baseline work.

The repo root is on `master`, but key product directories were themselves Git worktrees:

- `backend/` points at `.git/worktrees/backend` and branch `backend`.
- `frontend/` points at `.git/worktrees/frontend` and branch `frontend`.
- The root worktree also has old prunable worktree entries under `.git/worktrees/`.

Because of this, a root-level `git add backend/ frontend/` was unsafe. Git treated these directories as embedded repositories, which means a root commit would not contain their source files in the normal way.

## Current Resolution

Option B has been selected for v1: single monorepo baseline.

The `backend/.git` and `frontend/.git` pointer files have been backed up to:

- `.git/pocket-vibe-worktree-backups/backend.gitfile`
- `.git/pocket-vibe-worktree-backups/frontend.gitfile`

Then the pointer files were removed from the product directories so root Git can stage normal backend and frontend source files.

No source files were deleted.

## Baseline Commit Gate Note

The product tests and build gates are the v1 baseline acceptance checks:

- `pytest tests -q`
- `cd frontend; npm run test:capabilities`
- `cd frontend; npm run build`
- `cd vscode-bridge; npm run compile`

The local pre-commit hook currently runs `scripts/quality_gate.py`, which applies strict refactor thresholds to the entire historical codebase. That hook blocks the first source baseline because existing files exceed the future-state limits. Treat those findings as post-baseline refactor debt, not as proof that the v1 runtime baseline is failing.

## Risk

If we continue with a naive root baseline:

- backend and frontend code may be stored as embedded repo links instead of normal source files;
- clones of the root repository may not contain the actual backend/frontend contents;
- review diffs will be misleading;
- rollback and handoff will remain unreliable.

## Decision Required Before v1 Baseline

The decision has been made for v1, but the alternatives are retained here for context.

## Option A: Multi-Worktree Baseline

Keep `backend/` and `frontend/` as separate Git worktrees/branches.

Use this if the project intentionally wants separate branch ownership for backend and frontend.

Required actions:

1. Commit backend source from `backend/` on branch `backend`.
2. Commit frontend source from `frontend/` on branch `frontend`.
3. Commit shared docs, `src/`, `tests/`, `vscode-bridge/`, scripts, and steward files from the root `master` worktree.
4. Add a root-level orchestration document that tells users to clone or checkout the required branches/worktrees.

Downside: this is harder to understand and not ideal for a small MVP.

## Option B: Single Monorepo Baseline

Convert `backend/` and `frontend/` back into normal directories under the root repo.

Use this if Pocket Vibe is intended to be one product with one release tag.

Required actions:

1. Back up or commit any branch-specific work before changing worktree metadata.
2. Remove or relocate nested worktree metadata from `backend/` and `frontend/`.
3. Verify `git add -n backend/ frontend/` lists normal files, not embedded repositories.
4. Stage the full v1 baseline from the root.
5. Run the v1 completion gate.
6. Commit and tag the baseline from the root repo.

Downside: this touches Git metadata and should be done deliberately, not as an incidental cleanup.

## Recommendation

Use Option B for v1.

Reason: Pocket Vibe is currently one deployable product with one phone app, one backend, one VS Code bridge, and one v1 acceptance path. A single baseline commit and tag will make review, rollback, and handoff much simpler.

## Safe Next Action

Stage backend and frontend as normal source directories from the root repo.

Still do not stage:

- local runtime logs;
- `.env`;
- local databases;
- VS Code user data;
- generated build outputs;
- root-level screenshots;
- dependency folders.

Run the v1 completion gate before committing the full source baseline.
