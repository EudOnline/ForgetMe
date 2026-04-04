# Agent Runtime Operations Phase Two Implementation Plan

## Goal

Increase effective autonomy by improving runtime triage, budget visibility, and bounded self-recovery without lowering the `critical` threshold.

This phase adds:

- incident severity and alert lifecycle
- budget-pressure and timeout visibility in the runtime ops surface
- short-window trend views for backlog, stalls, and blocked proposals
- bounded low-risk self-recovery with explicit audit evidence

It does not:

- lower the `critical` threshold
- broaden external permissions
- add new agent roles
- add deeper nested delegation
- auto-retry irreversible or public actions

## Current Assessment

**Current score:** `8.6 / 10`

**What is already strong**

- The objective runtime now has a converged control plane with centralized autonomy policy, selector-driven gating, and structured verification state.
- Objective Workbench exposes runtime health, recent incidents, and persisted runtime controls in-product.
- Operators can already stop unsafe drift quickly through persisted kill switches instead of relying only on environment variables.
- The runtime has meaningful unit and objective e2e coverage across deliberation, verification, operator confirmation, stall recovery, and bounded subagent execution.

**What is still missing**

- Runtime incidents are visible, but not yet prioritized. Operators still need to infer which incidents are urgent versus noisy.
- Budget exhaustion and timeout pressure exist in the runtime, but they are not aggregated into the ops surface as first-class health signals.
- The system can stop safely, but it does not yet recover predictably from transient low-risk failures.
- There is no persistent alert lifecycle for acknowledging, resolving, or auditing repeated runtime instability.
- The current scorecard is snapshot-oriented, not trend-oriented, so it is hard to tell whether the runtime is stabilizing or degrading.

## Why This Phase Comes Next

Phase One made the runtime operable.

Phase Two should make it self-stabilizing.

The project does not need broader autonomy yet. It needs a tighter runtime control loop so that:

- operators can separate `warning` noise from truly urgent runtime regressions
- budget and timeout pressure become visible before they become user-facing failures
- low-risk transient failures recover automatically in a bounded, auditable way
- autonomy can improve through better runtime convergence instead of weaker safety boundaries

## Scope Guardrails

- Keep `critical` as the default operator-stop boundary.
- Treat runtime alert severity separately from proposal risk; a `critical` alert should remain rare and evidence-based.
- Do not allow self-recovery to execute irreversible, public, or externally sensitive actions.
- Do not auto-retry governance vetoes, operator blocks, or explicitly blocked proposals.
- Do not add background schedulers or generic autonomous daemons in this phase.
- Do not expand the persisted runtime controls into a free-form policy editor.

## Desired Outcome

After this phase:

- the runtime can tell operators what is wrong, how urgent it is, and whether it is getting better or worse
- budget exhaustion, tool timeout, and backlog pressure are visible in-product
- low-risk transient failures can recover once, with bounded retry and explicit telemetry
- repeated incidents become auditable alert records instead of raw event streams only
- the project has clearer release gates for runtime stability, not just correctness

## Acceptance Criteria

Ship this phase only when all of the following are true:

- operators can distinguish `warning` versus `critical` runtime alerts in-product
- alert records can be acknowledged and resolved with persisted audit fields
- runtime health shows budget exhaustion, timeout pressure, and short-window trend changes
- low-risk transient failures can auto-recover exactly within documented bounds
- recovery attempts emit explicit runtime events and never bypass `critical` gating
- unit, typecheck, runtime ops e2e, and objective e2e coverage pass

## Execution Order

1. Freeze the phase-two contract with failing tests.
2. Add runtime alert classification and lifecycle persistence.
3. Extend telemetry for budget pressure, timeout pressure, and trend windows.
4. Upgrade Objective Workbench into a triage cockpit.
5. Add bounded self-recovery for transient low-risk failures.
6. Freeze docs, release gates, and cleanup.

## Task 1: Freeze The Phase-Two Runtime Ops Contract With Failing Tests

**Files:**

- Create: `tests/unit/main/objectiveRuntimeAlertService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Create: `tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts`

**Step 1: Write the failing tests**

Add tests that require:

- incidents are classified into persisted `warning` or `critical` alerts
- repeated stalls or blocked proposals collapse into a stable alert fingerprint
- budget exhaustion and timeout failures appear in runtime health summaries
- Objective Workbench renders open alerts, trend deltas, and recovery history
- alert acknowledgement survives refresh

**Step 2: Run focused verification**

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts
```

Expected: FAIL because alert lifecycle, budget pressure rollups, and recovery history do not exist yet.

## Task 2: Add Runtime Alert Classification And Lifecycle Persistence

**Files:**

- Create: `src/main/services/migrations/030_agent_runtime_alerts.sql`
- Create: `src/main/services/objectiveRuntimeAlertService.ts`
- Modify: `src/main/services/objectiveRuntimeOpsReadService.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/contracts/objective.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/objective.ts`
- Modify: `tests/unit/main/objectiveRuntimeAlertService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`

**Implementation notes**

- Persist alert records with:
  - `alertId`
  - `fingerprint`
  - `severity`
  - `status`
  - `firstEventId`
  - `latestEventId`
  - `objectiveId`
  - `proposalId`
  - `openedAt`
  - `acknowledgedAt`
  - `acknowledgedBy`
  - `resolvedAt`
- Keep severity high-threshold:
  - `warning`: isolated blocked, vetoed, stalled, budget, or timeout incidents
  - `critical`: repeated or compounded instability such as sustained backlog, repeated stalls, or repeated budget exhaustion on the same objective
- Prefer deterministic fingerprints over free-form summary matching

**Step 1: Persist the alert model**

Create a narrow alert table and keep it sourced from runtime events rather than a second heuristic datastore.

**Step 2: Add read and mutation APIs**

Expose:

- `listObjectiveRuntimeAlerts(...)`
- `acknowledgeObjectiveRuntimeAlert(...)`
- `resolveObjectiveRuntimeAlert(...)`

**Step 3: Run focused tests**

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts
```

Expected: PASS

## Task 3: Extend Telemetry For Budget Pressure, Timeout Pressure, And Trend Windows

**Files:**

- Modify: `src/main/services/objectiveRuntimeTelemetryService.ts`
- Modify: `src/main/services/objectiveSubagentToolExecutionService.ts`
- Modify: `src/main/services/objectiveSubagentExecutionService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Add new runtime event types**

Add explicit runtime events for:

- `subagent_budget_exhausted`
- `tool_timeout`
- `recovery_attempted`
- `recovery_exhausted`
- `objective_recovered`

**Step 2: Extend the scorecard**

Add short-window and pressure fields such as:

- `budgetExhaustedCount`
- `toolTimeoutCount`
- `warningAlertCount`
- `criticalAlertCount`
- `backlogDelta24h`
- `stalledDelta24h`
- `blockedDelta24h`

**Step 3: Keep trend math simple**

Use deterministic lookback windows over `agent_runtime_events`; do not add a second metrics store in this phase.

**Step 4: Run focused tests**

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

## Task 4: Upgrade Objective Workbench Into A Runtime Triage Cockpit

**Files:**

- Modify: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Modify: `src/main/modules/objective/ipc/handlers.ts`
- Modify: `src/preload/modules/objective.ts`
- Modify: `src/renderer/clients/objectiveClient.ts`
- Modify: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Modify: `tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts`

**UI target**

Add three operator-grade slices:

- `Open alerts`
  - severity pill
  - acknowledgement state
  - last-seen timestamp
- `Budget pressure`
  - exhausted budgets
  - tool timeout counts
  - hotspot objective links
- `Trend window`
  - backlog delta
  - stalled delta
  - blocked delta

Keep the existing `Runtime health`, `Recent incidents`, and `Runtime controls` sections. Phase Two should layer on top of Phase One, not replace it.

**Step 1: Add client and IPC coverage**

Bridge alert list and alert actions through the existing objective module.

**Step 2: Keep the UX operational**

Prioritize scanability, timestamps, and stable labels over ornamental visuals.

**Step 3: Run focused tests**

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts
```

Expected: PASS

## Task 5: Add Bounded Self-Recovery For Transient Low-Risk Failures

**Files:**

- Create: `src/main/services/objectiveRuntimeRecoveryService.ts`
- Modify: `src/main/services/objectiveFacilitatorPlanningService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/objectiveRuntimeConfigService.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `tests/unit/main/objectiveFacilitatorPlanningService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: `tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts`

**Recovery rules**

Allow exactly one bounded automatic recovery attempt when all of the following are true:

- the failure is transient and local
- the proposal risk is `low`, `medium`, or `high`
- the proposal is not blocked, vetoed, or awaiting operator
- the action is not public, destructive, or externally sensitive
- the retry remains within existing budget policy

Never auto-recover:

- `critical` proposals
- governance vetoes
- operator blocks
- publication or external disclosure paths

**Step 1: Implement recovery policy as code, not prose**

Create a small deterministic recovery service that returns:

- `retry_now`
- `cooldown_then_retry`
- `surface_to_operator`

**Step 2: Persist recovery evidence**

Every recovery attempt should emit runtime events and checkpoint evidence so operators can explain why the runtime retried and why it stopped.

**Step 3: Run focused tests**

```bash
npm run test:unit -- tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
npm run test:e2e -- tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
```

Expected: PASS

## Task 6: Freeze Docs, Release Gates, And Cleanup

**Files:**

- Modify: `docs/agent-runtime-operator-playbook.md`
- Modify: `docs/agent-runtime-risk-matrix.md`
- Modify: `docs/plans/2026-04-04-agent-runtime-operations-phase-two-implementation-plan.md`
- Modify: `tests/unit/repo/objectiveRuntimeCleanup.test.ts`

**Step 1: Update operator docs**

Document:

- alert severity meanings
- when to acknowledge versus when to flip a runtime control
- what bounded self-recovery is allowed to do
- how to interpret trend regressions

**Step 2: Tighten release expectations**

Require verification for:

```bash
npm run lint
npm run test:typecheck
npm run test:unit
npm run test:e2e -- tests/e2e/objective-workbench-runtime-alerts-flow.spec.ts tests/e2e/objective-workbench-runtime-ops-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
npm run test:e2e:objective
```

**Step 3: Final acceptance check**

Do not call this phase complete unless:

- alert severity is deterministic and audited
- budget pressure is visible before exhaustion becomes invisible drift
- recovery remains bounded and never weakens the `critical` stop line
- the runtime ops surface helps operators act faster without editing hidden config

## Recommended Outcome After Phase Two

If this phase lands cleanly, the project should move from `8.6 / 10` to roughly `9.0 / 10` on agent-runtime readiness.

The next decision after that should not be “add more freedom.” It should be:

- whether the runtime is stable enough to automate more low-risk recovery paths
- whether alert noise is low enough to trust broader background execution
- whether the operator backlog stays small under real workload, not just seeded tests
