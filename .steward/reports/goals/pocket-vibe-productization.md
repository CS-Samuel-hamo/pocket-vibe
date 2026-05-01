# Pocket Vibe Productization Goal

Updated: 2026-04-19

## Goal

Move Pocket Vibe from a technically impressive demo into a product users can rely on when they are away from the PC.

## Definition Of Done

- Connection is understandable and repeatable for non-developer users.
- The primary runtime path, `codex-cli`, is stable under real usage.
- The mobile experience is optimized for control, approval, interruption, and recovery.
- Remote access has one supported and documented path beyond same-LAN usage.
- Operators can diagnose and recover a failed session without reading source code.

## Non-Goals For This Phase

- Expanding feature breadth across many runtimes before one runtime is solid.
- Building a full cloud platform before desktop-host-first UX is stable.
- Replacing the desktop IDE; Pocket Vibe remains a mobile control plane.

## Product Principles

1. Host-first, mobile-control.
   The desktop does the work; the phone controls and monitors it.
2. Explicit runtime state.
   No hidden fallback, no silent degradation, no guessing.
3. Remote by design.
   Cross-network access must be a first-class scenario, not a later patch.
4. Recovery matters as much as dispatch.
   Reconnect, relaunch, retry, and audit must be visible.
5. Control surface over raw terminal.
   The mobile UI should optimize for action and judgment, not terminal emulation.
