# Contributing to Pocket Vibe

Pocket Vibe is a **reference architecture** — a teaching-grade open source project demonstrating how to build a real-time, E2EE control plane across mobile, server, and IDE boundaries.

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

## What kinds of contributions are welcome

- **Bug fixes** — if something doesn't compile or a test fails
- **Documentation improvements** — better explanations, diagrams, ADRs (Architecture Decision Records)
- **Test coverage** — `useOpenVibeWS.js` in particular has no tests
- **Architecture blog posts** — if you write about patterns you find here, open a PR linking it in the README

## What this project is NOT looking for

- ✗ New features that expand scope (this is a reference, not a product)
- ✗ Pro/commercial feature flags
- ✗ Cloud relay services or monetization infrastructure

## Before submitting a PR

1. Run `pytest tests -q` — Python tests should all pass
2. Run `cd frontend && npm run test:capabilities` — frontend tests should pass
3. Keep the architecture clean. If you add a file, give it one clear responsibility.

## Code style

- Python: type hints everywhere, `@dataclass` over raw dicts, functions under 50 lines
- TypeScript: explicit interfaces, no `any`
- JavaScript (frontend): see existing patterns in `utils/` — pure functions, tested logic
- No new cloud dependencies. Everything must run offline.
