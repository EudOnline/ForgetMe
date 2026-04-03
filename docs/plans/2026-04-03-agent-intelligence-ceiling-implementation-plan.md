# Agent Intelligence Ceiling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise the practical intelligence ceiling of the objective runtime by improving verification quality, facilitator planning quality, and subagent decomposition quality without weakening the current governance boundary.

**Architecture:** Keep the current `objective / thread / proposal / checkpoint / subagent` runtime as the control plane. Strengthen it in three layers: first make evidence verdicts semantically stronger, then make the facilitator state-aware and planning-driven, and finally make subagents execute against explicit plans instead of going straight from proposal to workflow. Do not reintroduce opaque auto-run behavior; every new capability must remain proposal-gated, budget-bounded, and observable in Objective Workbench.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, Vitest, Playwright.

---

## Scope Guardrails

- Do not bypass `proposal / veto / operator confirmation` to make the system look smarter.
- Do not introduce model-only judgement as the first implementation; establish deterministic baselines first.
- Do not merge the three phases into one giant rewrite. Land each phase behind tests and keep the runtime operable after every task.
- Do not expand tool access or delegation depth before plan, budget, and checkpoint visibility are in place.
- Do not turn `externalVerificationBrokerService` into a giant orchestration service; keep it as a bounded search/open/normalize layer.

## Desired Outcome

After this plan:

- verification proposals carry a structured evidence judgement instead of a coarse yes/no bundle
- the facilitator decides what kind of action the thread needs next instead of only counting idle rounds
- subagents produce an explicit execution plan before they spend budget or delegate nested work
- Objective Workbench can explain why a proposal advanced, paused, stalled, or was blocked

## Recommended Execution Order

1. Phase 1: Verification Judgement Baseline
2. Phase 2: Facilitator Planning Baseline
3. Phase 3: Planned Subagent Execution

## Phase 1: Verification Judgement Baseline

### Task 1: Freeze The New Verification Boundary With Failing Tests

**Files:**
- Create: `tests/unit/main/verificationClaimJudgementService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: `tests/unit/main/agentProposalGateService.test.ts`

**Step 1: Write the failing test**

Add tests that require:

- a verification verdict can be `supported`, `contradicted`, `mixed`, or `insufficient`
- conflicting reliable sources do not collapse to `supported`
- owner approval alone does not make a verification proposal effectively ready when evidence is insufficient

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/verificationClaimJudgementService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentProposalGateService.test.ts
```

Expected: FAIL because the judgement service and richer verdict model do not exist yet.

**Step 3: Tighten assertions**

Make the tests assert:

- per-source assessment fields exist
- contradictory sources stay contradictory after sorting
- `insufficient` verdicts do not look equivalent to operator-ready evidence

**Step 4: Commit**

```bash
git add tests/unit/main/verificationClaimJudgementService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentProposalGateService.test.ts
git commit -m "test: lock richer verification judgement boundary"
```

### Task 2: Add Shared Verification Contracts And Schemas

**Files:**
- Create: `src/shared/contracts/verification.ts`
- Create: `src/shared/schemas/verification.ts`
- Modify: `src/shared/contracts/objective.ts`
- Modify: `src/shared/archiveContracts.ts`

**Step 1: Write minimal shared contract types**

Define:

- `VerificationVerdict`
- `VerificationSourceAssessment`
- `VerificationJudgement`

Keep the model small and deterministic:

- `verdict`
- `claim`
- `sourceAssessments`
- `supportCount`
- `contradictionCount`
- `highReliabilitySupportCount`
- `highReliabilityContradictionCount`
- `summary`

**Step 2: Add matching schemas**

Expose a Zod schema for the new structures in `src/shared/schemas/verification.ts`.

**Step 3: Re-export only what objective runtime needs**

Update objective-facing contract files so the runtime can consume the new types without dragging unrelated archive types into the verification slice.

**Step 4: Run focused shared tests**

Run:

```bash
npm run test:unit -- tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/shared/objectiveRuntimeContractModule.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/contracts/verification.ts src/shared/schemas/verification.ts src/shared/contracts/objective.ts src/shared/archiveContracts.ts
git commit -m "feat: add structured verification contracts"
```

### Task 3: Introduce A Deterministic Verification Judgement Service

**Files:**
- Create: `src/main/services/verificationClaimJudgementService.ts`
- Test: `tests/unit/main/verificationClaimJudgementService.test.ts`

**Step 1: Write the failing test**

Cover these cases:

- one official source that directly supports the claim -> `supported`
- one official source that directly contradicts the claim -> `contradicted`
- one support + one contradiction from similarly strong sources -> `mixed`
- only weak/secondary/low-coverage sources -> `insufficient`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/verificationClaimJudgementService.test.ts
```

Expected: FAIL because the service file does not exist.

**Step 3: Write minimal implementation**

Implement deterministic rules only:

- classify per-source stance and coverage
- weight reliability
- summarize counts
- choose final verdict

Do not add model inference in this task.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/verificationClaimJudgementService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/verificationClaimJudgementService.ts tests/unit/main/verificationClaimJudgementService.test.ts
git commit -m "feat: add deterministic verification judgement service"
```

### Task 4: Rewire External Verification And Web Verifier Workflow Around Judgement

**Files:**
- Modify: `src/main/services/externalVerificationBrokerService.ts`
- Modify: `src/main/services/objectiveSubagentVerificationWorkflowService.ts`
- Modify: `src/main/services/objectiveSubagentSpecializationService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Narrow the broker boundary**

Keep `externalVerificationBrokerService` responsible for:

- search result normalization
- page snapshot normalization
- source sorting

Remove final truth judgement responsibility from the broker.

**Step 2: Upgrade web verifier workflow**

Change the workflow to:

- search up to 3 sources
- open each source
- create per-source assessments
- call `verificationClaimJudgementService`
- append judgement-aware messages and checkpoints

**Step 3: Gate proposal advancement on judgement**

When a verification proposal settles:

- `supported` may advance
- `mixed`, `contradicted`, and `insufficient` should not silently look equivalent to ready-to-commit evidence

Do not weaken operator confirmation.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentProposalGateService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/externalVerificationBrokerService.ts src/main/services/objectiveSubagentVerificationWorkflowService.ts src/main/services/objectiveSubagentSpecializationService.ts src/main/services/objectiveRuntimeProposalDecisionService.ts src/main/services/objectiveRuntimeService.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentProposalGateService.test.ts
git commit -m "refactor: integrate structured verification judgement"
```

### Task 5: Add An Objective E2E For Conflicting Verification

**Files:**
- Create: `tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts`

**Step 1: Write the failing e2e**

Seed an objective where:

- one strong source supports
- one strong source contradicts
- the UI must show the proposal as not committed and visibly unresolved

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts
```

Expected: FAIL before the workflow and UI expose the richer verdict cleanly.

**Step 3: Write minimal UI/runtime glue if needed**

Only add enough UI surface so Objective Workbench can expose the new verification state.

**Step 4: Run targeted e2e**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts src/renderer/pages/ObjectiveWorkbenchPage.tsx
git commit -m "test: cover conflicting external verification flow"
```

## Phase 2: Facilitator Planning Baseline

### Task 6: Freeze Thread State And Planning Expectations With Failing Tests

**Files:**
- Create: `tests/unit/main/objectiveThreadStateService.test.ts`
- Create: `tests/unit/main/objectiveFacilitatorPlanningService.test.ts`
- Modify: `tests/unit/main/facilitatorAgentService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Write the failing test**

Require explicit states:

- `exploring`
- `waiting_for_external_evidence`
- `conflict_unresolved`
- `awaiting_governance`
- `awaiting_operator`
- `ready_to_converge`
- `stalled`
- `completed`

Require planner actions:

- `continue_deliberation`
- `request_external_verification`
- `request_local_evidence_check`
- `spawn_specialist`
- `pause_for_operator`
- `compose_final_response`
- `mark_stalled`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: FAIL because state and planning services do not exist.

**Step 3: Commit**

```bash
git add tests/unit/main/objectiveThreadStateService.test.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "test: lock facilitator planning baseline"
```

### Task 7: Introduce A Pure Thread State Service

**Files:**
- Create: `src/main/services/objectiveThreadStateService.ts`
- Test: `tests/unit/main/objectiveThreadStateService.test.ts`

**Step 1: Write minimal implementation**

Compute thread state from:

- proposals
- votes
- checkpoints
- messages
- recent verification outcomes

Keep this service pure and side-effect free.

**Step 2: Run the focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveThreadStateService.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/main/services/objectiveThreadStateService.ts tests/unit/main/objectiveThreadStateService.test.ts
git commit -m "feat: add objective thread state service"
```

### Task 8: Add A Deterministic Facilitator Planning Service

**Files:**
- Create: `src/main/services/objectiveFacilitatorPlanningService.ts`
- Modify: `src/main/services/agents/facilitatorAgentService.ts`
- Test: `tests/unit/main/objectiveFacilitatorPlanningService.test.ts`
- Modify: `tests/unit/main/facilitatorAgentService.test.ts`

**Step 1: Implement planner decisions**

Planner inputs:

- thread state
- rounds without progress
- recent artifacts
- whether a user-facing result exists

Planner outputs:

- next action
- next objective status
- next thread status
- optional checkpoint summary

**Step 2: Refactor facilitator service**

Keep objective acceptance and participant seeding where they are.
Move stop-state intelligence behind the planning service.

**Step 3: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/facilitatorAgentService.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/main/services/objectiveFacilitatorPlanningService.ts src/main/services/agents/facilitatorAgentService.ts tests/unit/main/objectiveFacilitatorPlanningService.test.ts tests/unit/main/facilitatorAgentService.test.ts
git commit -m "feat: add facilitator planning service"
```

### Task 9: Integrate Planner-Driven Deliberation Into Runtime

**Files:**
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeDeliberationService.ts`
- Modify: `src/main/services/objectiveTriggerService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Replace fixed stop heuristics**

Update `deliberateThread` to:

- compute thread state each round
- ask the planner for the next action
- execute only the needed branch
- preserve existing governance and operator gates

**Step 2: Reduce indiscriminate participant fan-out**

Avoid forcing every participant to speak on every round when the planner already knows the thread should pause, escalate, or converge.

**Step 3: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/main/services/objectiveRuntimeService.ts src/main/services/objectiveRuntimeDeliberationService.ts src/main/services/objectiveTriggerService.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "refactor: make objective deliberation planner-driven"
```

### Task 10: Add Planner-Oriented Objective E2E Coverage

**Files:**
- Create: `tests/e2e/objective-workbench-stall-recovery-flow.spec.ts`
- Create: `tests/e2e/objective-workbench-conflict-escalation-flow.spec.ts`

**Step 1: Write failing e2e flows**

Cover:

- a stalled thread that is explicitly shown as stalled instead of silently idle
- a conflict-heavy thread that escalates to governance or evidence instead of looping

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-conflict-escalation-flow.spec.ts
```

Expected: FAIL until planner-driven status handling is fully wired.

**Step 3: Write minimal UI/runtime glue**

Expose the new state labels and planner checkpoints in Objective Workbench.

**Step 4: Run targeted e2e**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-conflict-escalation-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-conflict-escalation-flow.spec.ts src/renderer/pages/ObjectiveWorkbenchPage.tsx
git commit -m "test: add planner-driven objective workbench flows"
```

## Phase 3: Planned Subagent Execution

### Task 11: Freeze Planned Subagent Execution With Failing Tests

**Files:**
- Create: `tests/unit/main/objectiveSubagentPlanningService.test.ts`
- Create: `tests/unit/main/objectiveSubagentPlanSchemaService.test.ts`
- Modify: `tests/unit/main/subagentRegistryService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Write the failing test**

Require:

- every registered specialization can yield a plan schema
- subagent execution records a plan before tool execution
- nested delegation respects explicit max depth
- budget use is attributable to plan steps

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveSubagentPlanningService.test.ts tests/unit/main/objectiveSubagentPlanSchemaService.test.ts tests/unit/main/subagentRegistryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: FAIL because no planning service or plan schema exists yet.

**Step 3: Commit**

```bash
git add tests/unit/main/objectiveSubagentPlanningService.test.ts tests/unit/main/objectiveSubagentPlanSchemaService.test.ts tests/unit/main/subagentRegistryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "test: lock planned subagent execution boundary"
```

### Task 12: Add Subagent Plan Schemas And Registry Metadata

**Files:**
- Create: `src/main/services/objectiveSubagentPlanSchemaService.ts`
- Modify: `src/main/services/subagentRegistryService.ts`
- Test: `tests/unit/main/objectiveSubagentPlanSchemaService.test.ts`
- Modify: `tests/unit/main/subagentRegistryService.test.ts`

**Step 1: Extend registry metadata**

Add to each specialization:

- `planningSchema`
- `maxDelegationDepth`
- optional `requiresPlanApproval`

**Step 2: Centralize schema access**

Expose plan schema lookup through the new plan schema service so the registry stays readable.

**Step 3: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveSubagentPlanSchemaService.test.ts tests/unit/main/subagentRegistryService.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/main/services/objectiveSubagentPlanSchemaService.ts src/main/services/subagentRegistryService.ts tests/unit/main/objectiveSubagentPlanSchemaService.test.ts tests/unit/main/subagentRegistryService.test.ts
git commit -m "feat: add subagent plan schema metadata"
```

### Task 13: Add A Deterministic Subagent Planning Service

**Files:**
- Create: `src/main/services/objectiveSubagentPlanningService.ts`
- Test: `tests/unit/main/objectiveSubagentPlanningService.test.ts`

**Step 1: Implement deterministic plan generation**

Given a specialization and proposal payload, emit:

- `goal`
- `steps`
- `expectedArtifacts`
- `toolSequence`
- `stopConditions`
- `delegationAllowed`
- `estimatedBudgetUse`

Do not use model-generated plans in this task.

**Step 2: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveSubagentPlanningService.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/main/services/objectiveSubagentPlanningService.ts tests/unit/main/objectiveSubagentPlanningService.test.ts
git commit -m "feat: add deterministic subagent planning service"
```

### Task 14: Integrate Plans Into Subagent Execution

**Files:**
- Modify: `src/main/services/objectiveSubagentExecutionService.ts`
- Modify: `src/main/services/objectiveSubagentSpecializationService.ts`
- Modify: `src/main/services/objectiveSubagentVerificationWorkflowService.ts`
- Modify: `src/main/services/objectiveSubagentAnalysisWorkflowService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Record plan before execution**

When a subagent starts:

- generate its plan
- append a planning message/checkpoint
- bind budget consumption to plan steps

**Step 2: Enforce delegation depth**

Use `maxDelegationDepth` and explicit plan permission to prevent unlimited nesting.

**Step 3: Return structured completion metadata**

Extend runner results to include:

- `completionReason`
- `confidence`
- `artifactSummary`

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveSubagentExecutionService.ts src/main/services/objectiveSubagentSpecializationService.ts src/main/services/objectiveSubagentVerificationWorkflowService.ts src/main/services/objectiveSubagentAnalysisWorkflowService.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "refactor: execute subagents against explicit plans"
```

### Task 15: Add Planned-Execution E2E Coverage And Final Verification

**Files:**
- Create: `tests/e2e/objective-workbench-subagent-plan-visibility-flow.spec.ts`
- Create: `tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts`
- Modify: `README.md`

**Step 1: Write failing e2e tests**

Cover:

- Objective Workbench shows a subagent plan before execution details
- nested subagent work stops at the configured depth and budget limit

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-subagent-plan-visibility-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
```

Expected: FAIL until planned execution is fully visible and enforced.

**Step 3: Add the last UI/docs glue**

Expose plan and budget summaries in Objective Workbench and document the new runtime behavior in `README.md`.

**Step 4: Run full verification**

Run:

```bash
npm run lint
npm run test:typecheck
npm run test:unit
npm run test:e2e:objective
npm run test:e2e -- tests/e2e/objective-workbench-conflicting-verification-flow.spec.ts tests/e2e/objective-workbench-stall-recovery-flow.spec.ts tests/e2e/objective-workbench-conflict-escalation-flow.spec.ts tests/e2e/objective-workbench-subagent-plan-visibility-flow.spec.ts tests/e2e/objective-workbench-nested-subagent-budget-flow.spec.ts
npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e README.md src/renderer/pages/ObjectiveWorkbenchPage.tsx
git commit -m "feat: expose planned objective runtime execution"
```

## Exit Criteria

- verification verdicts are semantically richer than a binary source bundle
- facilitator decisions are driven by explicit thread state and planning output
- subagents record and execute explicit plans before spending budget
- Objective Workbench can explain why a thread advanced, paused, stalled, or stayed blocked
- objective e2e coverage includes conflicting verification, planner-driven stall/conflict paths, and planned subagent execution

Plan complete and saved to `docs/plans/2026-04-03-agent-intelligence-ceiling-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints
