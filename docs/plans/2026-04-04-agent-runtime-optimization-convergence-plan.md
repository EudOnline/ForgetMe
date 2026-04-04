# Agent Runtime Optimization And Convergence Implementation Plan

## Implementation Status

Completed on `2026-04-04`.

This convergence pass landed:

- centralized high-threshold autonomy policy
- selector-driven operator gating
- structured verification checkpoint metadata
- richer objective inbox diagnostics
- runtime telemetry, scorecarding, and kill switches
- frozen operator docs and release-gate coverage

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Converge ForgetMe's message-native agent runtime into a stable high-autonomy system that auto-runs almost all reversible local work, stops only on truly critical boundaries, and is transparent enough to ship without operator anxiety.

**Architecture:** Keep the current `objective / thread / message / proposal / checkpoint / subagent` runtime as the control plane. Optimize by converging four layers in order: deterministic autonomy policy, single-source-of-truth runtime state, structured verification and convergence signals, and operator-facing observability. Do not broaden permissions or delegation depth until the runtime can explain every pause, auto-commit, veto, and stall with persisted structured data.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, Vitest, Playwright.

---

## Current Assessment

**Current score:** `8.0 / 10`

**What is already strong**

- The repo already has the right runtime shape: `objective`, `thread`, `message`, `proposal`, `checkpoint`, and bounded `subagent` execution.
- High-threshold autonomy is now real, not aspirational: proposal risk and autonomy metadata are persisted and `critical` publication work is operator-gated while `medium` and `high` reversible work auto-commits.
- Objective Workbench already exposes proposal risk, autonomy decision, audit trail, and selected-objective diagnostics.
- The system has meaningful e2e coverage across deliberation, verification, operator confirmation, conflict escalation, stall recovery, and nested subagent budget flows.

**What is not converged yet**

- Risk policy is still hardcoded in `proposalRiskAssessmentService.ts`, so the product boundary exists but the policy surface is not centralized.
- Internal runtime logic still depends on compatibility booleans such as `requiresOperatorConfirmation` and `requiresOperatorInput`, which makes drift possible.
- Verification state is still partly inferred from checkpoint summary text in `objectiveThreadStateService.ts`, which is brittle and weakens determinism.
- The facilitator loop is solid but still heuristic-heavy; it needs a crisper convergence contract around pause, retry, recover, and complete.
- Objective inbox rows still use coarse summary fields instead of rich per-objective rollout status, which hides queue pressure until the operator clicks in.
- There is not yet a runtime scorecard or release gate that proves the agent system is stable enough to stop growing and start hardening.

## Scope Guardrails

- Do not lower the current critical boundary for destructive, public, or irreversible actions.
- Do not make autonomy decisions depend on model prose or prompt wording.
- Do not widen tool or network permissions before convergence signals and budget visibility are strengthened.
- Do not keep compatibility booleans as first-class decision inputs after the convergence pass; internal logic should derive them.
- Do not ship richer autonomy without richer observability, operator backlog visibility, and kill switches.
- Do not add new agent roles or deeper delegation recursion in this pass.

## Desired Outcome

After this plan:

- autonomy policy is centralized, deterministic, and easy to audit
- internal runtime decisions are based on structured proposal and verification state instead of text parsing or legacy flags
- facilitator behavior has explicit convergence and recovery rules
- Objective Workbench behaves like an operator cockpit, not a debug console
- the project has clear release metrics, regression gates, and a freeze line for the agent system

## Release Exit Criteria

Treat the runtime as converged for this phase only when all of the following are true:

- `critical` remains the only bucket that forces operator confirmation by default
- all proposal and objective gating logic uses centralized selectors instead of duplicating boolean checks
- verification verdicts are persisted as structured data and never re-derived from human-readable summary strings
- inbox rows expose at least `risk`, `awaiting operator`, `blocked`, `vetoed`, and `latest blocker`
- the runtime can report auto-commit rate, operator-gated rate, veto rate, blocked rate, and stalled-objective rate
- unit, shared, and objective e2e suites pass from a clean build
- there is a written operator playbook and a documented rollback switch for autonomy regressions

## Recommended Execution Order

1. Freeze the convergence contract with tests.
2. Centralize the autonomy policy matrix.
3. Collapse legacy gating flags into derived selectors.
4. Persist structured verification and checkpoint state.
5. Converge facilitator and subagent progression rules.
6. Upgrade Objective Workbench into an operator cockpit.
7. Add telemetry, kill switches, and release gates.
8. Freeze docs, metrics, and cleanup.

## Task 1: Freeze The Convergence Contract With Failing Tests

**Files:**
- Create: `tests/unit/main/autonomyPolicyMatrixService.test.ts`
- Modify: `tests/unit/main/proposalRiskAssessmentService.test.ts`
- Modify: `tests/unit/main/objectiveThreadStateService.test.ts`
- Modify: `tests/unit/main/objectiveFacilitatorPlanningService.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Create: `tests/e2e/objective-workbench-inbox-status-flow.spec.ts`

**Step 1: Write the failing tests**

Add tests that require:

- a centralized policy matrix returns `await_operator` only for truly `critical` actions
- proposal and objective operator requirements are derived from structured selectors, not handwritten boolean duplication
- thread state reads structured verification verdicts instead of regex-parsing checkpoint summaries
- inbox rows show `awaiting operator`, `blocked`, `vetoed`, and `latest blocker` directly from list data
- the workbench keeps a critical proposal uncommitted even if compatibility flags are stale

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/autonomyPolicyMatrixService.test.ts tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-inbox-status-flow.spec.ts
```

Expected: FAIL because the policy matrix, structured checkpoint state, and richer inbox summary model do not exist yet.

**Step 3: Tighten assertions**

Make the tests assert exact values for:

- `proposalRiskLevel`
- `autonomyDecision`
- `verificationVerdict`
- `requiresOperatorInput`
- `awaitingOperatorCount`
- `blockedCount`
- `vetoedCount`
- `latestBlocker`

**Step 4: Commit**

```bash
git add tests/unit/main/autonomyPolicyMatrixService.test.ts tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/e2e/objective-workbench-inbox-status-flow.spec.ts
git commit -m "test: freeze agent runtime convergence contract"
```

## Task 2: Centralize The High-Threshold Autonomy Policy Matrix

**Files:**
- Create: `src/main/services/autonomyPolicyMatrixService.ts`
- Modify: `src/main/services/proposalRiskAssessmentService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalStateService.ts`
- Modify: `src/main/services/agentProposalGateService.ts`
- Modify: `tests/unit/main/autonomyPolicyMatrixService.test.ts`
- Modify: `tests/unit/main/proposalRiskAssessmentService.test.ts`
- Modify: `tests/unit/main/agentProposalGateService.test.ts`

**Step 1: Write the minimal matrix interface**

Implement a small service that takes:

- `proposalKind`
- destination and payload hints
- reversibility
- network or external-boundary signals
- artifact kinds

Return:

- `proposalRiskLevel`
- `autonomyDecision`
- `riskReasons`
- `confidenceScore`

**Step 2: Move hardcoded policy rules into the matrix**

Start with one default preset:

- `low` -> `auto_commit`
- `medium` -> `auto_commit_with_audit`
- `high` -> `auto_commit_with_audit`
- `critical` -> `await_operator`

Keep the critical threshold intentionally high:

- public publication
- destructive or irreversible mutation
- external sensitive disclosure
- other clearly non-local boundaries

**Step 3: Rewire proposal creation to call the matrix**

Make `proposalRiskAssessmentService.ts` a thin compatibility wrapper or remove it after the matrix is fully adopted. Keep proposal creation deterministic and persist the matrix output on every proposal row.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/autonomyPolicyMatrixService.test.ts tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/agentProposalGateService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/autonomyPolicyMatrixService.ts src/main/services/proposalRiskAssessmentService.ts src/main/services/objectiveRuntimeProposalStateService.ts src/main/services/agentProposalGateService.ts tests/unit/main/autonomyPolicyMatrixService.test.ts tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/agentProposalGateService.test.ts
git commit -m "feat: centralize high-threshold autonomy policy"
```

## Task 3: Collapse Legacy Operator Flags Into Derived Selectors

**Files:**
- Create: `src/main/services/objectiveAutonomySelectorsService.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/contracts/objective.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/objective.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/objectiveThreadStateService.ts`
- Modify: `src/main/services/objectivePersistenceQueryService.ts`
- Modify: `src/main/services/objectivePersistenceRowMapperService.ts`
- Modify: `tests/unit/shared/objectiveRuntimeContracts.test.ts`
- Modify: `tests/unit/main/objectiveThreadStateService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Introduce selector helpers**

Add selector functions such as:

- `proposalNeedsOperator(...)`
- `objectiveNeedsOperator(...)`
- `proposalIsAutoCommittable(...)`
- `proposalHasCriticalBoundary(...)`

**Step 2: Convert internal callers to selectors**

Update gate evaluation, proposal confirmation, thread classification, and facilitator planning so internal logic reads from selectors instead of repeating checks on:

- `requiresOperatorConfirmation`
- `requiresOperatorInput`
- `proposalRiskLevel === 'critical'`
- `autonomyDecision === 'await_operator'`

**Step 3: Keep compatibility fields as derived outputs**

Keep `requiresOperatorConfirmation` and `requiresOperatorInput` in shared contracts and UI payloads for backward compatibility, but derive them in one place before serialization.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveAutonomySelectorsService.ts src/shared/objectiveRuntimeContracts.ts src/shared/contracts/objective.ts src/shared/archiveContracts.ts src/shared/schemas/objective.ts src/main/services/objectiveRuntimeProposalDecisionService.ts src/main/services/objectiveThreadStateService.ts src/main/services/objectivePersistenceQueryService.ts src/main/services/objectivePersistenceRowMapperService.ts tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "refactor: derive operator gating from autonomy selectors"
```

## Task 4: Persist Structured Verification And Checkpoint State

**Files:**
- Create: `src/main/services/migrations/027_agent_checkpoint_metadata.sql`
- Modify: `src/shared/contracts/verification.ts`
- Modify: `src/shared/schemas/verification.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/objective.ts`
- Modify: `src/main/services/objectivePersistenceInteractionMutationService.ts`
- Modify: `src/main/services/objectivePersistenceQueryService.ts`
- Modify: `src/main/services/objectivePersistenceRowMapperService.ts`
- Modify: `src/main/services/objectiveSubagentVerificationWorkflowService.ts`
- Modify: `src/main/services/objectiveThreadStateService.ts`
- Modify: `tests/unit/main/objectivePersistenceService.test.ts`
- Modify: `tests/unit/main/objectiveThreadStateService.test.ts`
- Modify: `tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts`

**Step 1: Add structured checkpoint metadata**

Add a `metadata_json` column to `agent_checkpoints` so verification checkpoints can persist:

- `verificationVerdict`
- summary counts
- source reliability counts
- structured blocker or convergence hints

**Step 2: Populate metadata from verification workflow**

When the verifier finishes, persist the full structured verification judgement alongside the human-readable summary instead of storing the verdict only in prose.

**Step 3: Rewire thread state classification**

Make `objectiveThreadStateService.ts` read verification state from checkpoint metadata first and never depend on string matching for normal operation.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectivePersistenceService.test.ts tests/unit/main/objectiveThreadStateService.test.ts
npm run test:e2e -- tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/027_agent_checkpoint_metadata.sql src/shared/contracts/verification.ts src/shared/schemas/verification.ts src/shared/objectiveRuntimeContracts.ts src/shared/archiveContracts.ts src/shared/schemas/objective.ts src/main/services/objectivePersistenceInteractionMutationService.ts src/main/services/objectivePersistenceQueryService.ts src/main/services/objectivePersistenceRowMapperService.ts src/main/services/objectiveSubagentVerificationWorkflowService.ts src/main/services/objectiveThreadStateService.ts tests/unit/main/objectivePersistenceService.test.ts tests/unit/main/objectiveThreadStateService.test.ts tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts
git commit -m "feat: persist structured verification checkpoint state"
```

## Task 5: Converge Facilitator And Subagent Progression Rules

**Files:**
- Create: `src/main/services/objectiveConvergenceService.ts`
- Modify: `src/main/services/objectiveFacilitatorPlanningService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveSubagentExecutionService.ts`
- Modify: `src/main/services/objectiveSubagentLifecycleService.ts`
- Modify: `src/main/services/objectiveSubagentDelegationService.ts`
- Modify: `tests/unit/main/objectiveFacilitatorPlanningService.test.ts`
- Create: `tests/unit/main/objectiveConvergenceService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: `tests/e2e/objective-workbench-stall-recovery-flow.spec.ts`
- Modify: `tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts`

**Step 1: Extract explicit convergence decisions**

Create a service that decides between:

- continue deliberation
- request local evidence
- request external verification
- wait on active specialist
- pause for operator
- mark stalled
- complete objective

based on structured thread state, budget pressure, and recent progress.

**Step 2: Use budget and depth as first-class convergence inputs**

Make the facilitator and subagent loop explicitly account for:

- rounds without progress
- active spawn count
- remaining budget
- nested delegation depth
- unresolved blockers

**Step 3: Keep recovery deterministic**

A stalled or conflicted objective should always have a visible next state:

- retry locally
- request stronger evidence
- stop for operator
- complete with bounded confidence

Avoid silent loops.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveConvergenceService.test.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
npm run test:e2e -- tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveConvergenceService.ts src/main/services/objectiveFacilitatorPlanningService.ts src/main/services/objectiveRuntimeService.ts src/main/services/objectiveSubagentExecutionService.ts src/main/services/objectiveSubagentLifecycleService.ts src/main/services/objectiveSubagentDelegationService.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/objectiveConvergenceService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
git commit -m "feat: converge facilitator and subagent progression rules"
```

## Task 6: Upgrade Objective Workbench Into An Operator Cockpit

**Files:**
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/objective.ts`
- Modify: `src/main/services/objectivePersistenceQueryService.ts`
- Modify: `src/main/services/objectivePersistenceRowMapperService.ts`
- Modify: `src/renderer/clients/objectiveClient.ts`
- Modify: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/main/objectivePersistenceService.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Modify: `tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`
- Modify: `tests/e2e/objective-workbench-inbox-status-flow.spec.ts`

**Step 1: Enrich objective list summaries**

Extend `AgentObjectiveRecord` list data with:

- `awaitingOperatorCount`
- `criticalProposalCount`
- `blockedProposalCount`
- `vetoedProposalCount`
- `latestBlocker`
- `latestAutonomyDecision`

Do this in query and row-mapper layers so the renderer does not need eager detail-loading for every row.

**Step 2: Render row-level status pills**

Update inbox rows to show:

- risk pill
- operator-attention pill
- blocked or vetoed pill when present
- latest blocker snippet when present

Keep the default view dense and scannable.

**Step 3: Make the right pane explain the stop reason**

The selected objective should clearly answer:

- why this work auto-committed
- why this work is waiting
- who blocked it
- whether operator action would actually unblock it

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectivePersistenceService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts tests/e2e/objective-workbench-inbox-status-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/objectiveRuntimeContracts.ts src/shared/archiveContracts.ts src/shared/schemas/objective.ts src/main/services/objectivePersistenceQueryService.ts src/main/services/objectivePersistenceRowMapperService.ts src/renderer/clients/objectiveClient.ts src/renderer/pages/ObjectiveWorkbenchPage.tsx src/renderer/i18n.tsx tests/unit/main/objectivePersistenceService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts tests/e2e/objective-workbench-inbox-status-flow.spec.ts
git commit -m "feat: converge objective workbench operator cockpit"
```

## Task 7: Add Runtime Telemetry, Kill Switches, And Release Gates

**Files:**
- Create: `src/main/services/migrations/028_agent_runtime_events.sql`
- Create: `src/main/services/objectiveRuntimeTelemetryService.ts`
- Create: `src/main/services/objectiveRuntimeConfigService.ts`
- Modify: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalStateService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Create: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`

**Step 1: Persist runtime events**

Record structured events for:

- proposal created
- proposal auto-committed
- proposal awaiting operator
- proposal blocked
- proposal vetoed
- objective stalled
- objective completed

**Step 2: Add kill switches**

Introduce runtime config flags such as:

- disable auto-commit globally
- force operator confirmation for all external actions
- disable nested delegation

Keep defaults aligned with the current high-threshold policy.

**Step 3: Expose a scorecard**

Generate metrics for:

- auto-commit rate by risk level
- critical gate rate
- veto rate
- blocked rate
- stalled-objective rate
- mean rounds to completion
- operator backlog size

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentIpc.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/028_agent_runtime_events.sql src/main/services/objectiveRuntimeTelemetryService.ts src/main/services/objectiveRuntimeConfigService.ts src/main/modules/objective/runtime/createObjectiveModule.ts src/main/services/objectiveRuntimeService.ts src/main/services/objectiveRuntimeProposalDecisionService.ts src/main/services/objectiveRuntimeProposalStateService.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentIpc.test.ts
git commit -m "feat: add agent runtime telemetry and kill switches"
```

## Task 8: Freeze Docs, Cleanup, And Ship Criteria

**Files:**
- Create: `docs/agent-runtime-risk-matrix.md`
- Create: `docs/agent-runtime-operator-playbook.md`
- Modify: `docs/plans/2026-04-04-agent-runtime-optimization-convergence-plan.md`
- Modify: `tests/unit/repo/objectiveRuntimeCleanup.test.ts`

**Step 1: Document the final risk matrix**

Write the product-level boundary for:

- what is `low`
- what is `medium`
- what is `high`
- what is `critical`
- which cases always stop for operator

**Step 2: Document the operator playbook**

Cover:

- how to read inbox pills
- how to respond to a blocked or vetoed proposal
- when to use the kill switch
- how to validate that autonomy is behaving correctly after deploy

**Step 3: Lock the release gate**

Update repo-level cleanup or meta tests to require the final objective e2e suite and any new telemetry tests in the standard verification path.

**Step 4: Run final verification**

Run:

```bash
npm run test:unit
npm run test:e2e:objective
```

Expected: PASS

**Step 5: Commit**

```bash
git add docs/agent-runtime-risk-matrix.md docs/agent-runtime-operator-playbook.md docs/plans/2026-04-04-agent-runtime-optimization-convergence-plan.md tests/unit/repo/objectiveRuntimeCleanup.test.ts
git commit -m "docs: freeze agent runtime convergence criteria"
```

## Recommended Product Boundary After This Plan

Once these tasks land, treat the agent system as converged for this release line and resist adding new surface area until post-release evidence says otherwise.

Specifically, do not immediately add:

- new agent roles
- deeper nested delegation than the current bounded model
- operator-editable live autonomy rules in the UI
- broader external tool permissions
- free-form agent-to-agent social behavior outside the objective runtime

The right next step after convergence is not “more features”. It is a stability cycle driven by telemetry, bug reports, and operator friction.
