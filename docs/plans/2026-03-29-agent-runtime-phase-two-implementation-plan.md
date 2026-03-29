# Agent Runtime Phase Two Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the biggest gaps in the five-agent runtime baseline by making review item actions executable, persisting delegation metadata for durable replay, and upgrading `Agent Console` from a transient launcher into a trustworthy replay surface.

**Architecture:** Keep the current archive, review, and Memory Workspace services authoritative. Extend the existing agent runtime tables rather than introducing a second run-tracking store. Route item-level review decisions through the current `reviewQueueService`, persist delegation and summary metadata directly on `agent_runs`, and let the renderer consume a richer run detail model over the existing IPC bridge.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing IPC/preload bridge, Vitest, Playwright.

---

## Assumptions

- `main` already contains the five-agent runtime baseline from `c56b5a0`.
- The next phase should harden and complete the existing agent surface before adding preservation orchestration or repository-wide scheduling.
- Existing review queue, decision journal, Memory Workspace, and preservation services remain the source of truth.
- High-risk review actions must stay confirmation-gated.

## Scope Guardrails

In scope:

- persist replayable run metadata such as target role, assigned roles, and latest assistant summary
- implement `review.apply_item_decision` through the existing review queue services
- improve orchestrator heuristics so item-level review actions can be inferred from plain-language prompts
- upgrade `Agent Console` to render durable run history and message replay from persisted data
- add targeted unit/e2e coverage and refresh maintainer docs

Out of scope:

- repository-wide generic schedulers
- autonomous background agent loops
- agent-driven preservation execution
- policy auto-activation
- cross-device or cloud agent collaboration

## Execution Notes

- Follow `@test-driven-development` for each task: write the failing test first, run it, implement the minimum, rerun, then commit.
- Follow `@verification-before-completion` before every completion claim and before any integration commit.
- Keep this phase narrow. If a change does not improve execution completeness, replay durability, or operator trust, defer it.

### Task 1: Persist Delegation and Replay Metadata on Agent Runs

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Create: `src/main/services/migrations/022_agent_runtime_run_metadata.sql`
- Modify: `src/main/services/agentPersistenceService.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Modify: `tests/unit/main/agentPersistenceService.test.ts`
- Modify: `tests/unit/main/agentRuntimeService.test.ts`
- Create: `tests/unit/main/dbPhaseTwelveAgentRuntimeRunMetadata.test.ts`

**Step 1: Write the failing persistence and runtime tests**

Add failing tests that prove:

- a migration upgrades `agent_runs` with:
  - `target_role`
  - `assigned_roles_json`
  - `latest_assistant_response`
- `listAgentRuns(...)` returns persisted `assignedRoles` and `latestAssistantResponse`
- `getAgentRun(...)` returns persisted `targetRole`, `assignedRoles`, and `latestAssistantResponse`
- a completed orchestrator run persists the delegated target role and latest assistant reply

Use expectations shaped like:

```ts
expect(detail?.targetRole).toBe('review')
expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
expect(detail?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTwelveAgentRuntimeRunMetadata.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: FAIL because the new columns and runtime persistence do not exist yet.

**Step 3: Extend the shared run contracts**

In `src/shared/archiveContracts.ts`, extend the run read model so `AgentRunRecord` and `AgentRunDetail` include:

- `targetRole: AgentRole | null`
- `assignedRoles: AgentRole[]`
- `latestAssistantResponse: string | null`

Also extend `RunAgentTaskResult` to include:

- `assignedRoles: AgentRole[]`
- `targetRole: AgentRole | null`
- `latestAssistantResponse: string | null`

Do not create a second run-summary type unless the renderer truly needs one.

**Step 4: Add the migration and persistence helpers**

Create `src/main/services/migrations/022_agent_runtime_run_metadata.sql` so it safely alters `agent_runs` with the three new replay columns.

Update `src/main/services/agentPersistenceService.ts` to:

- read the new columns
- map `assigned_roles_json` to a typed `AgentRole[]`
- expose a helper such as:

```ts
updateAgentRunReplayMetadata(db, {
  runId,
  targetRole,
  assignedRoles,
  latestAssistantResponse
})
```

Store `assigned_roles_json` as JSON text and default it to `'[]'`.

**Step 5: Persist metadata from the runtime**

Update `src/main/services/agentRuntimeService.ts` so:

- after planning succeeds, the selected `targetRole` and `assignedRoles` are persisted
- after adapter execution completes, the latest agent-authored summary is persisted
- failed runs still persist the planned `targetRole` / `assignedRoles` when that information exists

Keep message journaling immutable; only the run row may be updated.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTwelveAgentRuntimeRunMetadata.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/shared/archiveContracts.ts src/main/services/migrations/022_agent_runtime_run_metadata.sql src/main/services/agentPersistenceService.ts src/main/services/agentRuntimeService.ts tests/unit/main/dbPhaseTwelveAgentRuntimeRunMetadata.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentRuntimeService.test.ts
git commit -m "feat: persist agent run replay metadata"
```

### Task 2: Implement Item-Level Review Decisions Through Existing Review Services

**Files:**
- Modify: `src/main/services/agentOrchestratorService.ts`
- Modify: `src/main/services/agents/reviewAgentService.ts`
- Modify: `tests/unit/main/reviewAgentService.test.ts`
- Modify: `tests/unit/main/agentRuntimeService.test.ts`

**Step 1: Write the failing review-agent tests**

Extend the review-agent tests to prove:

- prompts like `Approve review item rq-1` route to `approveReviewItem(...)`
- prompts like `Reject review item rq-2` route to `rejectReviewItem(...)`
- item-level actions still refuse to run without `confirmationToken`
- orchestrator infers `review.apply_item_decision` when the prompt contains an item id and an approve/reject verb

Use expectations shaped like:

```ts
expect(approveReviewItem).toHaveBeenCalledWith(db, {
  queueItemId: 'rq-1',
  actor: 'agent:review'
})

expect(rejectReviewItem).toHaveBeenCalledWith(db, {
  queueItemId: 'rq-2',
  actor: 'agent:review',
  note: 'Rejected through Agent Console'
})
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: FAIL because item-level review execution is not implemented yet.

**Step 3: Extend orchestrator inference**

Update `src/main/services/agentOrchestratorService.ts` so orchestrator routing can distinguish:

- safe-group apply
- item-level apply/reject
- read-only queue summary

Use a narrow heuristic. Only infer `review.apply_item_decision` when the prompt contains both:

- an explicit review-item id such as `rq-...`
- an approval or rejection verb

Do not infer item mutation from ambiguous prompts like `look at item rq-1`.

**Step 4: Implement item-level actions in the review adapter**

Update `src/main/services/agents/reviewAgentService.ts` to:

- import `approveReviewItem` and `rejectReviewItem` from `reviewQueueService`
- parse queue-item ids using the existing `rq-...` shape
- detect `approve` versus `reject`
- call the existing service instead of duplicating review logic
- return tool + agent messages that summarize the result

For the first cut, if the prompt is a rejection without an explicit note, use a stable default note:

```ts
'Rejected through Agent Console'
```

Keep the confirmation-token requirement for all `review.apply_item_decision` executions.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/agentOrchestratorService.ts src/main/services/agents/reviewAgentService.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentRuntimeService.test.ts
git commit -m "feat: execute item-level review actions through agent runtime"
```

### Task 3: Carry the Richer Run Model Through IPC, Preload, and Renderer API

**Files:**
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing bridge tests**

Extend the IPC / bridge tests so they prove:

- `runAgentTask(...)` returns `assignedRoles`, `targetRole`, and `latestAssistantResponse`
- `listAgentRuns(...)` returns persisted replay metadata
- `getAgentRun(...)` returns the same metadata without renderer-side reconstruction
- fallback APIs expose the richer result shape

Use expectations like:

```ts
expect(result).toEqual({
  runId: 'run-1',
  status: 'completed',
  targetRole: 'review',
  assignedRoles: ['orchestrator', 'review'],
  latestAssistantResponse: '1 pending items across 1 conflict groups.'
})
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the bridge tests still assume the older run-result shape.

**Step 3: Update the bridge layer**

Make the minimum changes required so the richer run model is preserved across:

- `registerAgentIpc(...)`
- preload `archiveApi`
- renderer fallback / `ipcRenderer` archive API

Do not add new IPC channels in this task. Keep the current four agent IPC entry points.

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/agentIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose richer agent replay metadata through ipc"
```

### Task 4: Upgrade Agent Console Into a Durable Replay Surface

**Files:**
- Create: `src/renderer/components/AgentRunTimeline.tsx`
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`

**Step 1: Write the failing renderer tests**

Extend the renderer tests to prove:

- history rows render `assignedRoles` and `latestAssistantResponse` from persisted run data, not only from the immediately returned mutation result
- the detail view renders a full chronological message timeline
- the detail view shows delegated target role
- the detail view compares the selected run against the previous run with the same `targetRole` or `role`

Use assertions like:

```tsx
expect(screen.getByText('Target role: review')).toBeInTheDocument()
expect(screen.getByText('Compared with previous review run')).toBeInTheDocument()
expect(screen.getByText('tool')).toBeInTheDocument()
expect(screen.getByText('agent')).toBeInTheDocument()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: FAIL because the current page still depends on transient local metadata and does not render a durable timeline/comparison view.

**Step 3: Add a dedicated timeline component**

Create `src/renderer/components/AgentRunTimeline.tsx` that:

- renders message rows by `ordinal`
- shows sender labels (`system`, `user`, `tool`, `agent`)
- keeps the markup replay-safe and read-only

Do not add inline mutation controls inside the timeline.

**Step 4: Refactor `AgentConsolePage` to use persisted replay data**

Update `src/renderer/pages/AgentConsolePage.tsx` so it:

- stops relying on ephemeral `runMetaById` for fields that are now persisted
- uses `listAgentRuns(...)` data for sidebar status / roles / latest summary
- uses `getAgentRun(...)` data for:
  - target role
  - assigned roles
  - latest assistant response
  - full message timeline
- computes a compact comparison block against the previous run sharing the same `targetRole` or `role`

Keep the confirmation flow for destructive review actions unchanged in spirit.

**Step 5: Add copy and styles**

Update `src/renderer/i18n.tsx` and `src/renderer/styles.css` with only the copy/styles needed for:

- `Target role`
- `Message timeline`
- `Compared with previous run`
- concise message-row presentation

Avoid turning this page into a giant dashboard. It should still feel like one focused console.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/renderer/components/AgentRunTimeline.tsx src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx src/renderer/styles.css tests/unit/renderer/agentConsolePage.test.tsx
git commit -m "feat: add durable agent replay timeline ui"
```

### Task 5: Add End-to-End Coverage, Refresh Docs, and Re-Verify the Slice

**Files:**
- Create: `tests/e2e/agent-console-replay-and-review-item-flow.spec.ts`
- Modify: `tests/e2e/agent-console-flow.spec.ts`
- Modify: `README.md`
- Modify: `package.json`

**Step 1: Write the failing e2e coverage**

Add a second e2e spec that proves:

1. a destructive item-level review action is blocked until a confirmation token is entered
2. the action succeeds after confirmation
3. the resulting run still shows persisted assigned roles and latest assistant output after navigating away and back

If practical, reuse the same `userDataDir` across a relaunch so the test proves replay durability instead of only in-memory React state.

**Step 2: Run the targeted e2e tests to verify they fail**

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts
```

Expected: FAIL because the new review-item and durable-replay behaviors are not fully covered yet.

**Step 3: Refresh maintainer docs**

Update `README.md` to document:

- item-level review action support
- durable persisted run metadata
- the difference between `role` and `targetRole`
- current phase boundary: still local-first, still not a background autonomous scheduler

**Step 4: Refresh agent verification scripts**

Update `package.json` so `test:e2e:agent` runs both agent-console specs.

For example:

```json
{
  "test:e2e:agent": "npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts"
}
```

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/agentConsolePage.test.tsx
npm run test:e2e:agent
```

Expected: PASS

**Step 6: Run full verification**

Run:

```bash
npm run verify:release
git diff --check
```

Expected: PASS

**Step 7: Commit**

```bash
git add tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts README.md package.json
git commit -m "docs: finalize agent runtime phase two"
```

## Recommended Implementation Order

1. Persist replay metadata
2. Complete item-level review execution
3. Carry the richer run shape through IPC
4. Upgrade the console UI
5. Add e2e and re-verify

## Expected User Experience After This Plan

- user opens `Agent Console`
- user runs a review summary and sees the delegated target role and durable run summary
- user runs `Approve review item rq-...`
- console blocks execution until a confirmation token is entered
- after confirmation, the existing review queue services apply the decision
- user can return later and still see:
  - which role executed the work
  - what the latest assistant summary was
  - the exact message timeline
  - a compact comparison against the previous similar run

## Safety Rules That Must Stay True

- no agent directly mutates approved truth outside the existing review services
- no destructive review action proceeds without explicit confirmation
- replay remains read-only
- renderer history must come from persisted data, not inferred client-only state

## Follow-Up Phase After This Plan

If phase two succeeds, the next implementation plan should cover:

- narrow background agent-run scheduling built on the existing runner pattern in `src/main/index.ts`
- agent-driven preservation flows that wrap `backupExportService` / `restoreService` without bypassing them
- governance policy evaluation sets and offline scoring
- richer multi-run diffing beyond the compact previous-run comparison introduced here
