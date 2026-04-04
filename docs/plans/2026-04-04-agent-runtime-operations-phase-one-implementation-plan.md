# Agent Runtime Operations Phase One Implementation Plan

## Goal

Turn the converged objective runtime into an operator-grade operations surface without broadening autonomy.

This phase adds:

- a runtime health scorecard
- a recent incident feed with drill-down payloads
- persisted runtime kill switches with audit evidence
- Objective Workbench support for reading and updating that surface

It does not:

- lower the `critical` threshold
- broaden external permissions
- add new agent roles
- add deeper nested delegation

## Why This Phase Comes Next

The runtime already converged on the hard safety boundaries:

- deterministic risk policy
- selector-driven operator gating
- structured verification
- telemetry rows for runtime events
- kill switches for rollback

What was still missing was operational leverage:

- telemetry existed but was invisible in-product
- incidents were only ergonomic if you read raw rows
- kill switches were engineering controls rather than operator tools
- there was no simple control loop for “is autonomy healthy today?”

That made the next step an operations phase, not a broader-autonomy phase.

## Execution Order

1. Freeze the runtime ops contract with failing tests.
2. Persist runtime settings and audit them.
3. Add runtime ops read models over telemetry.
4. Expose runtime ops through IPC and renderer client contracts.
5. Upgrade Objective Workbench with scorecard, incidents, and controls.
6. Update docs and rerun verification.

## Acceptance Criteria

Ship this phase only when all of the following are true:

- operators can see auto-commit, gated, blocked, vetoed, stalled, and backlog metrics in-product
- operators can inspect recent incidents without opening raw SQLite rows
- operators can toggle persisted runtime controls in the UI
- settings changes are audited
- the high-threshold `critical` boundary remains unchanged
- unit, typecheck, and objective runtime e2e coverage pass

## Implementation Notes

- Treat the existing `agent_runtime_events` table as the source of truth for runtime scorecards and incident feeds.
- Keep persisted runtime settings narrowly typed: three booleans only.
- Prefer explicit, labeled controls over free-form policy editing.
- Keep operator-facing explanations concrete and auditable.
