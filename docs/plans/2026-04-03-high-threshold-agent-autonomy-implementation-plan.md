# High-Threshold Agent Autonomy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise objective-runtime autonomy so that almost all local and reversible work auto-commits, while only genuinely irreversible or boundary-crossing actions pause for operator confirmation.

**Architecture:** Keep the existing `objective / thread / proposal / checkpoint / subagent` runtime intact and insert a deterministic autonomy layer into the proposal lifecycle. Add a proposal risk assessment service plus a policy-driven autonomy decision so proposal creation, proposal gating, facilitator state, and Objective Workbench all agree on when the system should auto-commit and when it must stop. Do not make role agents decide confirmation policy themselves; centralize it in runtime services and persist the result in SQLite for auditability.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, Vitest, Playwright.

---

## Scope Guardrails

- Do not weaken the current governance boundary for destructive, external-publication, or external-sensitive actions.
- Do not let role agents hardcode `requiresOperatorConfirmation`; make that a derived runtime result.
- Do not add model-only risk scoring in the first pass. Start with deterministic rule-based classification.
- Do not hide autonomy decisions in ephemeral memory. Persist risk and autonomy metadata with proposals.
- Do not ship a more autonomous runtime without also surfacing the decision reason in Objective Workbench.

## Desired Outcome

After this plan:

- proposals carry structured autonomy metadata instead of only a boolean confirmation flag
- the runtime auto-commits low, medium, and high risk proposals when policy allows
- only `critical` proposals pause for operator confirmation
- facilitator and thread state distinguish between critical confirmation waits and normal autonomous progress
- Objective Workbench shows why a proposal auto-committed or stopped

## Recommended Execution Order

1. Contract and persistence baseline
2. Deterministic proposal risk engine
3. Runtime gate rewiring for high-threshold autonomy
4. Facilitator and UI transparency follow-through

## Task 1: Freeze The New High-Threshold Autonomy Boundary With Failing Tests

**Files:**
- Create: `tests/unit/main/proposalRiskAssessmentService.test.ts`
- Modify: `tests/unit/main/agentProposalGateService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

**Step 1: Write the failing tests**

Add tests that require:

- local reversible proposals default to `auto_commit`
- destructive or public-share proposals require `await_operator`
- `high` risk alone does not force operator confirmation under the high-threshold autonomy policy
- Objective Workbench can display proposal risk and autonomy reasons

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
```

Expected: FAIL because the risk assessment service and richer proposal metadata do not exist yet.

**Step 3: Tighten assertions**

Make the tests assert exact values for:

- `riskLevel`
- `autonomyDecision`
- `riskReasons`
- when `awaiting_operator` is still legal

**Step 4: Commit**

```bash
git add tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
git commit -m "test: lock high-threshold autonomy boundary"
```

## Task 2: Add Shared Proposal Autonomy Contracts And Schemas

**Files:**
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/contracts/objective.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/objective.ts`
- Modify: `tests/unit/shared/objectiveRuntimeContracts.test.ts`
- Modify: `tests/unit/shared/messageNativeAgentContracts.test.ts`

**Step 1: Extend proposal contracts**

Add deterministic proposal-level fields:

- `proposalRiskLevel`: `'low' | 'medium' | 'high' | 'critical'`
- `autonomyDecision`: `'auto_commit' | 'auto_commit_with_audit' | 'await_operator'`
- `riskReasons: string[]`
- `confidenceScore: number | null`

Keep `requiresOperatorConfirmation`, but document it as a derived compatibility field.

**Step 2: Update create-proposal input contracts**

Allow runtime-owned proposal creation to optionally pass:

- `proposalRiskLevel`
- `autonomyDecision`
- `riskReasons`
- `confidenceScore`

Do not require role agents to set them.

**Step 3: Update Zod schemas**

Teach `src/shared/schemas/objective.ts` to validate the new fields for proposal records and proposal input.

**Step 4: Run focused shared tests**

Run:

```bash
npm run test:unit -- tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/shared/messageNativeAgentContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/objectiveRuntimeContracts.ts src/shared/contracts/objective.ts src/shared/archiveContracts.ts src/shared/schemas/objective.ts tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/shared/messageNativeAgentContracts.test.ts
git commit -m "feat: add shared proposal autonomy contracts"
```

## Task 3: Persist Proposal Risk And Autonomy Metadata In SQLite

**Files:**
- Create: `src/main/services/migrations/026_agent_proposal_autonomy.sql`
- Modify: `src/main/services/objectivePersistenceInteractionMutationService.ts`
- Modify: `src/main/services/objectivePersistenceRowMapperService.ts`
- Modify: `src/main/services/objectivePersistenceQueryService.ts`
- Modify: `src/main/services/objectivePersistenceDetailService.ts`
- Modify: `tests/unit/main/objectivePersistenceService.test.ts`

**Step 1: Write the migration**

Add proposal columns for:

- `proposal_risk_level`
- `autonomy_decision`
- `risk_reasons_json`
- `confidence_score`

Use defaults that preserve current behavior for old rows:

- `proposal_risk_level = 'medium'`
- `autonomy_decision = 'await_operator'`
- `risk_reasons_json = '[]'`
- `confidence_score = null`

**Step 2: Extend persistence input/output types**

Update `CreateProposalInput`, proposal row types, and row mappers so the new fields round-trip through SQLite.

**Step 3: Preserve backward compatibility**

Keep `requiresOperatorConfirmation` writable for old call sites, but derive its stored value from the runtime autonomy decision during proposal creation.

**Step 4: Run focused persistence tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectivePersistenceService.test.ts tests/unit/shared/messageNativeAgentContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/026_agent_proposal_autonomy.sql src/main/services/objectivePersistenceInteractionMutationService.ts src/main/services/objectivePersistenceRowMapperService.ts src/main/services/objectivePersistenceQueryService.ts src/main/services/objectivePersistenceDetailService.ts tests/unit/main/objectivePersistenceService.test.ts
git commit -m "feat: persist proposal autonomy metadata"
```

## Task 4: Add A Deterministic Proposal Risk Assessment Service

**Files:**
- Create: `src/main/services/proposalRiskAssessmentService.ts`
- Test: `tests/unit/main/proposalRiskAssessmentService.test.ts`

**Step 1: Write minimal deterministic rules**

Classify proposals by consequence, not by feature name.

Use these first-pass rules:

- `low`: local read-only, local analysis, compare, internal subagent spawning
- `medium`: local reversible state updates and review-flow progression
- `high`: stronger local business impact but still reversible and auditable
- `critical`: destructive actions, public sharing/publication, irreversible mutations, external sending of sensitive evidence, or final claims with insufficient evidence

**Step 2: Add autonomy policy resolution**

Hardcode the first policy as the product default:

- `low` -> `auto_commit`
- `medium` -> `auto_commit_with_audit`
- `high` -> `auto_commit_with_audit`
- `critical` -> `await_operator`

**Step 3: Include confidence and boundary signals**

The service should accept optional signals such as:

- verification verdict
- proposal kind
- tool policy/network usage
- artifact kinds
- reversibility

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/proposalRiskAssessmentService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/proposalRiskAssessmentService.ts tests/unit/main/proposalRiskAssessmentService.test.ts
git commit -m "feat: add deterministic proposal risk assessment"
```

## Task 5: Rewire Proposal Creation And Gate Evaluation Around The Risk Engine

**Files:**
- Modify: `src/main/services/objectiveRuntimeProposalStateService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/agentProposalGateService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveSubagentRoutingService.ts`
- Modify: `src/main/services/objectiveSubagentDelegationService.ts`
- Modify: `tests/unit/main/agentProposalGateService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Assess risk at proposal creation time**

When `createProposalWithCheckpoint` runs:

- compute risk metadata
- persist it with the proposal
- derive `requiresOperatorConfirmation` from `autonomyDecision === 'await_operator'`

Do not require caller code to provide these fields.

**Step 2: Upgrade gate evaluation**

Update `evaluateProposalGate` so:

- `critical` proposals can still reach `awaiting_operator`
- non-critical proposals with owner approval become `committable`
- existing challenge/veto behavior still wins over autonomy

**Step 3: Auto-commit eligible proposals centrally**

Move auto-commit logic into the generic proposal decision flow, not only `spawn_subagent`.

At minimum:

- `respondToAgentProposal` should auto-commit eligible non-critical proposals after votes settle
- `confirmAgentProposal` remains only for proposals that actually need confirmation

**Step 4: Keep subagent execution compatible**

Ensure `spawn_subagent` still auto-commits when allowed, but now because the generic autonomy layer says so, not because it is a special one-off path.

**Step 5: Run focused runtime tests**

Run:

```bash
npm run test:unit -- tests/unit/main/agentProposalGateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/subagentRegistryService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/objectiveRuntimeProposalStateService.ts src/main/services/objectiveRuntimeProposalDecisionService.ts src/main/services/agentProposalGateService.ts src/main/services/objectiveRuntimeService.ts src/main/services/objectiveSubagentRoutingService.ts src/main/services/objectiveSubagentDelegationService.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "feat: gate proposal commits with high-threshold autonomy policy"
```

## Task 6: Make Facilitator State And Role Agents Respect Centralized Autonomy

**Files:**
- Modify: `src/main/services/objectiveThreadStateService.ts`
- Modify: `src/main/services/objectiveFacilitatorPlanningService.ts`
- Modify: `src/main/services/agents/workspaceAgentService.ts`
- Modify: `src/main/services/agents/reviewAgentService.ts`
- Modify: `src/main/services/agents/governanceAgentService.ts`
- Modify: `src/main/services/agents/ingestionAgentService.ts`
- Modify: `tests/unit/main/facilitatorAgentService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Distinguish critical waits from generic waits**

Teach thread state classification to detect:

- there is a real `critical` proposal awaiting confirmation
- there are only autonomous proposals still moving

Avoid routing normal autonomous progress into the same bucket as operator-blocked work.

**Step 2: Clean up facilitator planning**

Update planning so:

- the facilitator only pauses for operator when a critical proposal is waiting
- autonomous reversible work can continue to converge

Also fix the artifact collection bug in `collectRecentArtifacts` so proposal artifacts actually participate in planning.

**Step 3: Simplify role agents**

Remove any need for role agents to decide confirmation behavior directly. They should emit intent only:

- proposal kind
- payload
- owner role

The runtime should add risk and autonomy metadata.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveThreadStateService.ts src/main/services/objectiveFacilitatorPlanningService.ts src/main/services/agents/workspaceAgentService.ts src/main/services/agents/reviewAgentService.ts src/main/services/agents/governanceAgentService.ts src/main/services/agents/ingestionAgentService.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "refactor: centralize autonomy policy in runtime"
```

## Task 7: Surface Risk And Autonomy Reasons In Objective Workbench

**Files:**
- Modify: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Modify: `tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`
- Create: `tests/e2e/objective-workbench-high-threshold-autonomy-flow.spec.ts`

**Step 1: Add proposal visibility fields**

Show for the selected proposal:

- risk level
- autonomy decision
- risk reasons
- confidence score when present

**Step 2: Clarify the operator wait reason**

Make the runtime panel say whether operator input is required because of:

- destructive/public/external boundary
- insufficient confidence for a critical final result

**Step 3: Add an e2e for autonomous reversible flow**

Seed a runtime where a reversible proposal:

- gets owner approval
- auto-commits without operator input
- renders its autonomy rationale in the workbench

**Step 4: Run renderer and e2e verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts tests/e2e/objective-workbench-high-threshold-autonomy-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ObjectiveWorkbenchPage.tsx src/renderer/i18n.tsx tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts tests/e2e/objective-workbench-high-threshold-autonomy-flow.spec.ts
git commit -m "feat: surface proposal autonomy decisions in objective workbench"
```

## Task 8: Run Full Regression For Objective Runtime Autonomy

**Files:**
- Modify: `README.md`

**Step 1: Update documentation**

Document the new autonomy baseline in the objective runtime section:

- proposals now carry risk and autonomy metadata
- only critical proposals require operator confirmation
- Objective Workbench exposes autonomy rationale

**Step 2: Run the targeted regression suite**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/objectiveModule.test.ts tests/unit/main/proposalRiskAssessmentService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/unit/shared/objectiveRuntimeContracts.test.ts tests/unit/shared/messageNativeAgentContracts.test.ts
npm run test:e2e:objective
npm run build
```

Expected: PASS

**Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: record high-threshold agent autonomy baseline"
```

## Notes For The Implementer

- Keep the first version deterministic. If a rule feels ambiguous, prefer explicit proposal-kind and boundary metadata over heuristics.
- When in doubt, classify external public share or destructive mutation as `critical`.
- Avoid a partial migration where some proposals have autonomy metadata and others do not in runtime code paths. Add compatibility defaults in one place.
- Preserve current proposal checkpoints, but update their summaries so operator waits are clearly attributable to critical-risk policy, not generic caution.
- Treat `requiresOperatorConfirmation` as an output compatibility field for existing UI and tests until the rest of the codebase no longer needs it.

Plan complete and saved to `docs/plans/2026-04-03-high-threshold-agent-autonomy-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
