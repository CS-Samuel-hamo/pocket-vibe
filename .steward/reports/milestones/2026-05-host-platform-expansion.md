# 2026-05 Host Platform Expansion

Updated: 2026-04-23
Status: planned

## Objective

Start the post-productization phase by turning Pocket Vibe into a host-agnostic, multi-project mobile control plane.

## Success Signals

- The backend can reason about hosts, projects, and runtimes without relying on VS Code-specific assumptions.
- The mobile product can surface multiple projects across hosts in one coherent entry flow.
- The next host families are ranked and sequenced with explicit product and adapter criteria.
- One non-reference host family is selected for the first feasibility adapter.

## Delivery Tracks

1. `host-protocol`
   Define the shared desktop host contract and normalize registry/routing semantics.
2. `project-inbox`
   Move the mobile landing surface from one session view to a multi-project decision surface.
3. `host-feasibility`
   Pick and validate the next host family after the VS Code reference adapter.

## Deliverables

- platform priority matrix and rollout strategy
- host adapter contract for backend and desktop adapters
- project inbox design and initial implementation plan
- first non-reference host feasibility brief
