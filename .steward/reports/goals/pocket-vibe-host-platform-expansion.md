# Pocket Vibe Host Platform Expansion Goal

Updated: 2026-04-23

## Goal

Turn Pocket Vibe from a remote for one desktop session into the mobile entry point across multiple desktop AI coding hosts and multiple active projects.

## Definition Of Done

- Pocket Vibe has a host-agnostic registration and routing model instead of a VS Code-shaped backend core.
- The phone can switch between projects reported by different desktop hosts from one consistent project registry.
- The mobile landing flow is project-first and chat-first, not host-debug-first.
- At least one non-reference host family has a validated adapter path or feasibility skeleton.
- Platform expansion decisions are governed by a clear priority matrix, not by ad hoc excitement.

## Non-Goals For This Phase

- Supporting every editor or AI coding tool immediately.
- Full feature parity across all hosts on day one.
- Rebuilding desktop IDE UX on the phone.
- Shipping a cloud platform before local-host abstractions are stable.

## Product Principles

1. Projects first, runtimes second.
   Users think in projects; runtimes are capabilities bound to those projects.
2. Host diversity without mobile complexity.
   New adapters should not make the phone UI feel like a host chooser maze.
3. Capability truth over fake parity.
   Every host may degrade differently, but it must do so explicitly.
4. Platform breadth follows adapter leverage.
   Add platforms when one adapter meaningfully expands the reachable user base.
5. Mobile remains a remote control plane.
   The phone should stay simple even while the desktop host graph grows.
