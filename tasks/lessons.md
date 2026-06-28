# Self-Improvement Lessons

> **AI Note**: Update this file after ANY correction from the user. Review these lessons at the start of each session to avoid repeating mistakes.

## Rules & Anti-Patterns
- **Quality Gate Violations**: When working with Python backend code (`Driver`, `API`, etc.), always use helper functions to decompose complex `async for` and `try/except` loops. Otherwise, the 3-branch limit and 30-line limit will immediately reject the commit.
- **Frontend Raw HTML**: DO NOT use raw `<button>`, `<input>`, `<select>` anywhere in `.jsx` files. Always import the equivalent components from `#antd-mobile` or `ArcoDesign` to avoid the "Zero Escape" ban.
- **Multiple Top-Level Elements**: When returning multiple components (e.g., a View and a Popup), ALWAYS wrap them in a React Fragment `<> ... </>`. Failure to do so leads to "Adjacent JSX elements" syntax errors.
- **Protocol E2E Verification**: Claims of feature completion are invalid without demonstrating cross-process communication. For a "Bridge" architecture, functionality is not "done" until the target IDE (VS Code) successfully responds to the Mobile command.
- **Mobile Script Semantics**: Do not treat project script execution as plain text sent into the AI runtime terminal. Discover scripts from first-party workspace manifests, then execute them in a dedicated desktop shell so the action matches the user's mental model.
- **Bridge Restart Resilience**: When backend processes are restarted during development, verify the VS Code bridge reconnects automatically. A backend fix is not complete if the mobile client is left in `HOST OFFLINE` until a manual reconnect.
- **Remote Control Scope**: For mobile UI decisions, optimize for "remote control of a desktop coding session", not "mini IDE". If a feature makes the phone app look like a compressed desktop workspace, it probably belongs behind an on-demand tools surface.
- **Chat-First Mobile UX**: The phone app should feel closer to Codex mobile than to a dashboard. Keep the primary surface as conversation plus state plus urgent actions; files, scripts, runtime switching, connection repair, and audit belong in secondary tools or support flows.
