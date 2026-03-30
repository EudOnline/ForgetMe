# Message-Native Multi-Agent Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current run-centric, single-hop five-agent runtime with a message-native deliberation runtime built around objectives, threads, structured messages, proposals, controlled subagents, and key-node summaries.

**Architecture:** Keep the existing ForgetMe domain services authoritative for review, workspace, enrichment, publication, and policy behavior, but move agent execution onto a new `objective / thread / message / proposal` core. Introduce a facilitator-led scheduler, proposal gates, tool brokers, controlled external verification, and bounded skill-pack subagents, then replace `Agent Console` with an `Objective Workbench` that defaults to key decision checkpoints instead of raw internal chat.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing preload bridge, Vitest, Playwright.

---

## Implementation Notes

- Follow `@test-driven-development` for every task.
- Follow `@verification-before-completion` before every completion claim.
- This plan assumes **no backward compatibility requirement** for the old run-centric runtime.
- Execute in a dedicated worktree before touching implementation files.
- Treat the current typecheck drift as part of the first task so the new runtime starts from a green baseline.

## Scope Summary

In scope:

- objective / thread / message / proposal data model
- facilitator-led deliberation scheduler
- bounded subagent spawning with skill packs
- tool broker and external verification broker
- controlled search / page-open / citation capture
- proposal approvals, challenges, vetoes, and operator confirmations
- key-node summary persistence and renderer surfaces
- retiring the old `Agent Console` runtime path

Out of scope for this plan:

- infinite recursive subagents
- fully autonomous destructive review actions
- automatic external-truth writes into approved fact tables
- turning the whole app into a chat shell

---

### Task 1: Stabilize the Current Agent Baseline Before the Rewrite

**Files:**
- Modify: `src/main/services/agentSuggestionFollowupService.ts`
- Modify: `tests/unit/main/agentSuggestionFollowupService.test.ts`
- Modify: `tests/unit/main/ingestionAgentService.test.ts`
- Modify: `tests/unit/main/workspaceAgentService.test.ts`

**Step 1: Capture the failing baseline verification**

Run:

```bash
npm run test:typecheck
```

Expected: FAIL with the current `RunAgentTaskInput` narrowing issue in `agentSuggestionFollowupService.ts` and missing `executionOrigin` in two test fixtures.

**Step 2: Fix the typed follow-up builder shape**

Update `src/main/services/agentSuggestionFollowupService.ts` so the helper that builds follow-up suggestions returns a properly discriminated `RunAgentTaskInput` and never leaks `undefined` into `sourceRunId`.

Use a helper shaped like:

```ts
function buildTaskInputForRole<Role extends AgentRole>(input: {
  role: Role
  taskKind: AgentTaskKindByRole[Role]
  prompt: string
}): Extract<RunAgentTaskInput, { role: Role }> {
  return {
    role: input.role,
    taskKind: input.taskKind,
    prompt: input.prompt
  } as Extract<RunAgentTaskInput, { role: Role }>
}
```

Ensure `sourceRunId` is always normalized with `?? null`.

**Step 3: Fix the agent run test fixtures**

Update both test fixtures so the mocked `AgentRunRecord` includes:

```ts
executionOrigin: 'operator_manual'
```

**Step 4: Re-run typecheck**

Run:

```bash
npm run test:typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/agentSuggestionFollowupService.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/workspaceAgentService.test.ts
git commit -m "chore: restore green agent runtime typecheck baseline"
```

---

### Task 2: Define the New Objective/Thread/Proposal Contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/messageNativeAgentContracts.test.ts`

**Step 1: Write the failing shared-contract tests**

Create `tests/unit/shared/messageNativeAgentContracts.test.ts` with coverage for:

- parsing a minimal `createObjectiveInputSchema`
- parsing a `spawnSubagentProposal`
- rejecting an external-verification proposal without bounded tool policy
- parsing a checkpoint summary node for the renderer

Use expectations like:

```ts
expect(createObjectiveInputSchema.safeParse({
  title: 'Verify whether this candidate can be approved safely',
  objectiveKind: 'review_decision',
  prompt: 'Can this safe group be approved?'
}).success).toBe(true)

expect(createProposalInputSchema.safeParse({
  proposalKind: 'verify_external_claim',
  ownerRole: 'workspace',
  payload: { claim: '...' }
}).success).toBe(false)
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/messageNativeAgentContracts.test.ts
```

Expected: FAIL because the new contract types and schemas do not exist yet.

**Step 3: Add the shared runtime types**

In `src/shared/archiveContracts.ts`, add types for:

- `AgentObjectiveRecord`
- `AgentThreadRecord`
- `AgentThreadParticipantRecord`
- `AgentMessageRecordV2`
- `AgentProposalRecord`
- `AgentVoteRecord`
- `AgentCheckpointRecord`
- `AgentSubagentRecord`
- `AgentToolExecutionRecord`
- `AgentSkillPackId`
- `AgentArtifactRef`
- `CreateAgentObjectiveInput`
- `ListAgentObjectivesInput`
- `GetAgentObjectiveInput`
- `GetAgentThreadInput`
- `CreateAgentProposalInput`
- `RespondToAgentProposalInput`
- `ConfirmAgentProposalInput`

Represent checkpoint summaries explicitly:

```ts
export type AgentCheckpointKind =
  | 'goal_accepted'
  | 'participants_invited'
  | 'evidence_gap_detected'
  | 'subagent_spawned'
  | 'tool_action_executed'
  | 'external_verification_completed'
  | 'proposal_raised'
  | 'challenge_raised'
  | 'veto_issued'
  | 'consensus_reached'
  | 'awaiting_operator_confirmation'
  | 'committed'
  | 'blocked'
  | 'user_facing_result_prepared'
```

**Step 4: Add new IPC schemas**

In `src/shared/ipcSchemas.ts`, add schemas for:

- `createAgentObjectiveInputSchema`
- `listAgentObjectivesInputSchema`
- `getAgentObjectiveInputSchema`
- `getAgentThreadInputSchema`
- `createAgentProposalInputSchema`
- `respondToAgentProposalInputSchema`
- `confirmAgentProposalInputSchema`

Require bounded policy fields on external and subagent proposals, for example:

```ts
toolPolicyId: z.string().min(1)
budget: z.object({
  maxRounds: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  timeoutMs: z.number().int().positive()
})
```

**Step 5: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/messageNativeAgentContracts.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/messageNativeAgentContracts.test.ts
git commit -m "feat: add message-native agent runtime contracts"
```

---

### Task 3: Add SQLite Schema for Objectives, Threads, Messages, Proposals, and Subagents

**Files:**
- Create: `src/main/services/migrations/025_agent_objective_runtime.sql`
- Create: `tests/unit/main/dbMessageNativeAgentRuntime.test.ts`

**Step 1: Write the failing migration tests**

Create `tests/unit/main/dbMessageNativeAgentRuntime.test.ts` with assertions that migrations create:

- `agent_objectives`
- `agent_threads`
- `agent_thread_participants`
- `agent_messages_v2`
- `agent_proposals`
- `agent_votes`
- `agent_tool_executions`
- `agent_checkpoints`
- `agent_role_state`
- `agent_subagents`

Use expectations like:

```ts
expect(tableNames).toContain('agent_objectives')
expect(tableNames).toContain('agent_subagents')
expect(indexNames).toContain('idx_agent_messages_v2_thread_round')
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/dbMessageNativeAgentRuntime.test.ts
```

Expected: FAIL because the migration does not exist yet.

**Step 3: Add the migration**

Create `src/main/services/migrations/025_agent_objective_runtime.sql` with:

- `agent_objectives`
  - `id`, `title`, `objective_kind`, `status`, `risk_level`, `created_by`, timestamps
- `agent_threads`
  - `id`, `objective_id`, `kind`, `parent_thread_id`, `spawned_by_agent`, `purpose`, `status`
- `agent_messages_v2`
  - `id`, `objective_id`, `thread_id`, `from_identity`, `to_identity`, `kind`, `body`, `refs_json`, `reply_to_message_id`, `round`, `confidence`, `blocking`, `created_at`
- `agent_proposals`
  - `id`, `objective_id`, `thread_id`, `proposed_by`, `proposal_kind`, `payload_json`, `owner_role`, `status`, `required_approvals_json`, `allow_veto_by_json`, `requires_operator_confirmation`, `derived_from_message_ids_json`, `artifact_refs_json`, timestamps
- `agent_votes`
- `agent_tool_executions`
- `agent_checkpoints`
- `agent_role_state`
- `agent_subagents`

Add indexes on:

- objective status / created_at
- thread objective / parent thread
- message thread / round / created_at
- proposal objective / status / owner role
- checkpoint objective / created_at
- subagent parent thread / status

**Step 4: Re-run the migration test**

Run:

```bash
npm run test:unit -- tests/unit/main/dbMessageNativeAgentRuntime.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/025_agent_objective_runtime.sql tests/unit/main/dbMessageNativeAgentRuntime.test.ts
git commit -m "feat: add message-native agent runtime schema"
```

---

### Task 4: Build Objective/Thread Persistence Helpers

**Files:**
- Create: `src/main/services/objectivePersistenceService.ts`
- Create: `tests/unit/main/objectivePersistenceService.test.ts`

**Step 1: Write the failing persistence tests**

Create `tests/unit/main/objectivePersistenceService.test.ts` proving:

- an objective can be created with its main thread
- thread participants persist
- messages append in round order
- proposals, votes, checkpoints, and subagents round-trip

Use expectations like:

```ts
expect(objective.objectiveId).toBeTruthy()
expect(thread.kind).toBe('main')
expect(messages.map((m) => m.round)).toEqual([0, 1, 1, 2])
expect(checkpoints[0]?.kind).toBe('proposal_raised')
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/objectivePersistenceService.test.ts
```

Expected: FAIL because the service does not exist yet.

**Step 3: Implement the persistence service**

Create helpers like:

```ts
createObjective(db, input)
createMainThread(db, input)
createSubthread(db, input)
addThreadParticipants(db, input)
appendAgentMessageV2(db, input)
createProposal(db, input)
recordProposalVote(db, input)
createCheckpoint(db, input)
createSubagent(db, input)
listObjectives(db, input)
getObjectiveDetail(db, input)
getThreadDetail(db, input)
```

Keep all JSON-typed fields normalized on write and parsed on read.

**Step 4: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/objectivePersistenceService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectivePersistenceService.ts tests/unit/main/objectivePersistenceService.test.ts
git commit -m "feat: persist agent objectives threads and proposals"
```

---

### Task 5: Add the Message Bus, Proposal Gate, and Checkpoint Generator

**Files:**
- Create: `src/main/services/agentMessageBusService.ts`
- Create: `src/main/services/agentProposalGateService.ts`
- Create: `src/main/services/agentCheckpointService.ts`
- Create: `tests/unit/main/agentMessageBusService.test.ts`
- Create: `tests/unit/main/agentProposalGateService.test.ts`
- Create: `tests/unit/main/agentCheckpointService.test.ts`

**Step 1: Write the failing runtime-core tests**

Add tests that prove:

- messages can be broadcast to multiple participants
- blocking challenges stop a proposal from becoming `committable`
- governance veto marks a proposal `vetoed`
- checkpoint summaries are emitted when a proposal is raised, challenged, approved, vetoed, or committed

Use expectations like:

```ts
expect(nextDeliveries.map((d) => d.to)).toEqual(['review', 'workspace', 'governance'])
expect(result.status).toBe('challenged')
expect(checkpoint.kind).toBe('veto_issued')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentMessageBusService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/agentCheckpointService.test.ts
```

Expected: FAIL because the services do not exist yet.

**Step 3: Implement the minimal runtime core**

Create:

- `agentMessageBusService.ts`
  - route broadcast vs direct messages
  - queue thread deliveries
- `agentProposalGateService.ts`
  - evaluate challenge / approval / veto / operator-confirmation eligibility
- `agentCheckpointService.ts`
  - translate state transitions into summary nodes

Keep the minimal state-transition logic explicit:

```ts
if (hasGovernanceVeto) return 'vetoed'
if (hasBlockingChallenge) return 'challenged'
if (requiresOperatorConfirmation && ownerApproved) return 'awaiting_operator'
if (ownerApproved) return 'committable'
return 'under_review'
```

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentMessageBusService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/agentCheckpointService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/agentMessageBusService.ts src/main/services/agentProposalGateService.ts src/main/services/agentCheckpointService.ts tests/unit/main/agentMessageBusService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/agentCheckpointService.test.ts
git commit -m "feat: add deliberation message bus and proposal gates"
```

---

### Task 6: Implement Tool Broker, External Verification Broker, and Skill-Pack Subagents

**Files:**
- Create: `src/main/services/toolBrokerService.ts`
- Create: `src/main/services/externalVerificationBrokerService.ts`
- Create: `src/main/services/subagentRegistryService.ts`
- Create: `src/main/services/skillPacks/webVerifierSkillPack.ts`
- Create: `src/main/services/skillPacks/evidenceCheckerSkillPack.ts`
- Create: `src/main/services/skillPacks/draftComposerSkillPack.ts`
- Create: `tests/unit/main/toolBrokerService.test.ts`
- Create: `tests/unit/main/externalVerificationBrokerService.test.ts`
- Create: `tests/unit/main/subagentRegistryService.test.ts`

**Step 1: Write the failing broker and subagent tests**

Cover:

- broker blocks direct network access without an allowed policy
- `web-verifier` subagent is created with bounded budget and schema
- external verification returns normalized citation bundles
- `evidence-checker` only exposes archive-local tools

Use expectations like:

```ts
expect(result.status).toBe('blocked')
expect(subagent.skillPackIds).toEqual(['web-verifier'])
expect(citationBundle.sources[0]?.url).toBe('https://example.com')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/toolBrokerService.test.ts tests/unit/main/externalVerificationBrokerService.test.ts tests/unit/main/subagentRegistryService.test.ts
```

Expected: FAIL because the broker and subagent systems do not exist yet.

**Step 3: Implement the broker layer**

Create:

- `toolBrokerService.ts`
  - authorize tool requests by role, policy, skill pack, and remaining budget
- `externalVerificationBrokerService.ts`
  - wrap `search_web`, `open_source_page`, `extract_claims`, `cross_source_compare`, `capture_citation_bundle`
- `subagentRegistryService.ts`
  - create bounded subagent templates

Each subagent template should define:

```ts
{
  specialization: 'web-verifier',
  toolWhitelist: ['search_web', 'open_source_page', 'capture_citation_bundle'],
  outputSchema: webVerificationResultSchema
}
```

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/toolBrokerService.test.ts tests/unit/main/externalVerificationBrokerService.test.ts tests/unit/main/subagentRegistryService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/toolBrokerService.ts src/main/services/externalVerificationBrokerService.ts src/main/services/subagentRegistryService.ts src/main/services/skillPacks/webVerifierSkillPack.ts src/main/services/skillPacks/evidenceCheckerSkillPack.ts src/main/services/skillPacks/draftComposerSkillPack.ts tests/unit/main/toolBrokerService.test.ts tests/unit/main/externalVerificationBrokerService.test.ts tests/unit/main/subagentRegistryService.test.ts
git commit -m "feat: add tool brokers and bounded skill-pack subagents"
```

---

### Task 7: Replace the Old Adapter Runtime with a Facilitator-Led Objective Runtime

**Files:**
- Create: `src/main/services/agents/facilitatorAgentService.ts`
- Create: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/agents/agentTypes.ts`
- Modify: `src/main/services/agents/reviewAgentService.ts`
- Modify: `src/main/services/agents/ingestionAgentService.ts`
- Modify: `src/main/services/agents/workspaceAgentService.ts`
- Modify: `src/main/services/agents/governanceAgentService.ts`
- Create: `tests/unit/main/facilitatorAgentService.test.ts`
- Create: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Write the failing runtime-flow tests**

Add tests that prove:

- facilitator creates an objective, main thread, and participant list
- review can raise a blocking challenge and governance can veto
- workspace can propose external verification and receive a normalized verification result
- objective runtime generates key checkpoints instead of only raw chat output

Use expectations like:

```ts
expect(objective.status).toBe('deliberating')
expect(checkpoints.map((c) => c.kind)).toContain('subagent_spawned')
expect(latestProposal.status).toBe('awaiting_operator')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: FAIL because the new runtime does not exist yet.

**Step 3: Implement the facilitator and runtime**

Create `facilitatorAgentService.ts` to:

- accept operator/system goals
- decide initial participants
- trigger rounds
- detect stalls
- request checkpoints

Replace the old `execute(context)` contract in `src/main/services/agents/agentTypes.ts` with a receive/respond shape like:

```ts
export type AgentReceiveResult = {
  messages: AgentMessageDraft[]
  proposals?: AgentProposalDraft[]
  spawnRequests?: SpawnSubagentDraft[]
  toolRequests?: ToolRequestDraft[]
}
```

Implement `objectiveRuntimeService.ts` to:

- create objectives
- deliver messages by round
- resolve spawn requests and tool requests through brokers
- evaluate proposal states
- stop on `committable`, `blocked`, `stalled`, or `awaiting_operator`

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/agents/facilitatorAgentService.ts src/main/services/objectiveRuntimeService.ts src/main/services/agents/agentTypes.ts src/main/services/agents/reviewAgentService.ts src/main/services/agents/ingestionAgentService.ts src/main/services/agents/workspaceAgentService.ts src/main/services/agents/governanceAgentService.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "feat: replace single-hop runtime with facilitator-led objective runtime"
```

---

### Task 8: Expose Objective Runtime Through IPC, Preload, and Renderer API

**Files:**
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing IPC and preload tests**

Extend tests to prove:

- renderer can create objectives
- renderer can list objective summaries and fetch a thread detail
- renderer can respond to proposals and confirm operator-gated proposals
- old run-centric handlers are removed or intentionally replaced

Use expectations like:

```ts
const objective = await handlerMap.get('archive:createAgentObjective')?.({}, payload)
expect(objective.status).toBe('deliberating')

expect(window.archiveApi.getAgentObjective).toBeTypeOf('function')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the new IPC surface is not wired yet.

**Step 3: Replace the public API surface**

Update `src/main/ipc/agentIpc.ts` to expose:

- `archive:createAgentObjective`
- `archive:listAgentObjectives`
- `archive:getAgentObjective`
- `archive:getAgentThread`
- `archive:respondToAgentProposal`
- `archive:confirmAgentProposal`

Update preload and renderer API wrappers to match. Keep the browser fallback minimal but complete.

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/agentIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose objective runtime over ipc and renderer api"
```

---

### Task 9: Replace Agent Console with Objective Workbench

**Files:**
- Create: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`
- Create: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

**Step 1: Write the failing renderer tests**

Create `tests/unit/renderer/objectiveWorkbenchPage.test.tsx` with coverage for:

- objective inbox rendering
- key-node summary timeline rendering
- right-side agent stance panel
- proposal drawer with approve / challenge / veto / confirm actions
- hidden full-thread detail until expanded

Use expectations like:

```tsx
expect(await screen.findByRole('heading', { name: 'Objective Workbench' })).toBeInTheDocument()
expect(screen.getByText('Consensus reached')).toBeInTheDocument()
expect(screen.queryByText('internal thread message 1')).not.toBeInTheDocument()
```

**Step 2: Run the targeted renderer tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/objectiveWorkbenchPage.test.tsx
```

Expected: FAIL because the page does not exist yet.

**Step 3: Build the new renderer surface**

Create `ObjectiveWorkbenchPage.tsx` with:

- left objective list
- center checkpoint timeline
- right `Agent Stance Panel`
- proposal action drawer
- optional expandable raw thread section

Update `src/renderer/App.tsx` to route the ops surface to `Objective Workbench` instead of the old `Agent Console`.

Update i18n keys so the navigation and page labels use:

```ts
'nav.objectiveWorkbench'
'page.ops.objectiveWorkbench'
'objectiveWorkbench.title'
```

**Step 4: Run the targeted renderer tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/objectiveWorkbenchPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ObjectiveWorkbenchPage.tsx src/renderer/App.tsx src/renderer/i18n.tsx tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/unit/renderer/agentConsolePage.test.tsx
git commit -m "feat: replace agent console with objective workbench"
```

---

### Task 10: Add End-to-End Coverage for Deliberation, Verification, and Operator Confirmation

**Files:**
- Create: `tests/e2e/objective-workbench-deliberation-flow.spec.ts`
- Create: `tests/e2e/objective-workbench-external-verification-flow.spec.ts`
- Create: `tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`

**Step 1: Write the failing end-to-end tests**

Add coverage for:

1. `review + governance + workspace` deliberation produces key checkpoints
2. a `web-verifier` subagent is spawned and returns an external verification checkpoint
3. a review-changing proposal becomes `awaiting_operator_confirmation` and only commits after the operator confirms

Use interactions like:

```ts
await page.getByRole('button', { name: 'Create objective' }).click()
await expect(page.getByText('Subagent spawned')).toBeVisible()
await expect(page.getByText('Awaiting operator confirmation')).toBeVisible()
await page.getByRole('button', { name: 'Confirm proposal' }).click()
await expect(page.getByText('Committed')).toBeVisible()
```

**Step 2: Run the targeted E2E tests to verify they fail**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
```

Expected: FAIL because the new UI/runtime flow is not complete yet.

**Step 3: Fill the missing integration glue**

Make whatever minimal integration updates are still required so:

- the new runtime boots from `src/main/index.ts`
- the old proactive runner no longer points at the removed run-centric runtime
- the renderer boot path opens `Objective Workbench` correctly

Likely modify:

- `src/main/index.ts`
- `src/main/services/agentProactiveRunnerService.ts`

**Step 4: Run the targeted E2E tests to verify they pass**

Run:

```bash
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/index.ts src/main/services/agentProactiveRunnerService.ts tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
git commit -m "test: add end-to-end coverage for objective workbench deliberation"
```

---

### Task 11: Remove the Obsolete Run-Centric Runtime and Refresh Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-30-message-native-multi-agent-runtime-design.md`
- Modify: `package.json`
- Remove or retire:
  - `src/main/services/agentRuntimeService.ts`
  - `src/main/services/agentOrchestratorService.ts`
  - `src/renderer/pages/AgentConsolePage.tsx`
  - obsolete unit and e2e tests tied only to the old run model

**Step 1: Write the failing documentation/verification expectation**

Add or update a README verification section so the release-facing commands reference the new objective workbench tests instead of the old agent console tests.

Use a diff target like:

```md
### Message-Native Objective Runtime Verification

npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts ...
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts ...
```

**Step 2: Run the full verification command before cleanup**

Run:

```bash
npm run test:typecheck
npm run test:unit
```

Expected: PASS before deleting obsolete files.

**Step 3: Remove obsolete runtime code and update docs**

Delete or retire the old run-centric runtime files and update:

- README runtime description
- design doc status note
- package scripts if a dedicated `test:e2e:agent` script should become `test:e2e:objective`

**Step 4: Run final verification**

Run:

```bash
npm run test:typecheck
npm run test:unit
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-30-message-native-multi-agent-runtime-design.md package.json
git rm src/main/services/agentRuntimeService.ts src/main/services/agentOrchestratorService.ts src/renderer/pages/AgentConsolePage.tsx
git commit -m "refactor: ship message-native multi-agent runtime"
```

---

## Final Verification Matrix

Before declaring the feature complete, run:

```bash
npm run test:typecheck
npm run test:unit -- tests/unit/shared/messageNativeAgentContracts.test.ts tests/unit/main/dbMessageNativeAgentRuntime.test.ts tests/unit/main/objectivePersistenceService.test.ts tests/unit/main/agentMessageBusService.test.ts tests/unit/main/agentProposalGateService.test.ts tests/unit/main/agentCheckpointService.test.ts tests/unit/main/toolBrokerService.test.ts tests/unit/main/externalVerificationBrokerService.test.ts tests/unit/main/subagentRegistryService.test.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
npm run build
```

## Recommended Rollout Order

Implement in this order and do not skip ahead:

1. baseline typecheck stabilization
2. contracts and schemas
3. database and persistence
4. message bus and proposal gate
5. brokers and subagents
6. facilitator-led runtime
7. IPC and renderer API
8. Objective Workbench UI
9. E2E coverage
10. old runtime removal

## Risks To Watch During Execution

- leaking old run-centric assumptions into new contracts
- allowing direct tool execution outside the broker path
- letting external verification results mutate archive truth tables
- making the Objective Workbench too chat-like instead of summary-first
- overbuilding subagent recursion before the one-layer model is stable

## Completion Handoff

Plan complete and saved to `docs/plans/2026-03-30-message-native-multi-agent-runtime-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
