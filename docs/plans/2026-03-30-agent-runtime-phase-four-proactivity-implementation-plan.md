# Agent Runtime Phase Four Proactivity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent runtime proactively discover meaningful next actions, persist them as an operator-visible inbox, and execute them through the existing runtime without turning the system into an unsafe autonomous loop.

**Architecture:** Build a supervised proactivity layer on top of the current runtime instead of replacing it. A deterministic trigger service will scan existing authoritative data sources such as failed agent runs, pending review work, and failed enrichment jobs, then upsert structured agent suggestions into SQLite. A lightweight main-process runner will refresh that suggestion inbox in the background, and the renderer will let the operator review, run, or dismiss suggestions through the same `runTask(...)` path that phase three already hardened.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing IPC/preload bridge, Vitest, Playwright.

---

## Recommended Direction

Recommended: **supervised proactivity**.

- Keep trigger generation automatic.
- Keep execution human-approved from the console.
- Reuse existing agent adapters and confirmation gates.

Not recommended for this phase:

- full autonomous execution loops that mutate review data without an operator
- LLM-planned trigger generation with opaque heuristics
- background destructive actions such as `review.apply_safe_group` or `review.apply_item_decision`

## Assumptions

- `main` already includes the merged phase-three runtime, preview, replay, ingestion flow, memory visibility, and governance visibility work.
- The current agent runtime remains local-first and role-based; this phase should make it more proactive, not invent a cloud orchestration platform.
- Destructive review actions must remain confirmation-gated even if future suggestions point at them.
- The first proactive iteration should prefer deterministic trigger rules over model-generated planning so that operators can understand why a suggestion appeared.

## Scope Guardrails

In scope:

- persist a first-class proactive suggestion inbox in SQLite
- generate suggestions from existing authoritative read models
- refresh suggestions from a background main-process runner
- let the operator refresh, run, or dismiss suggestions from `Agent Console`
- keep suggestion execution on the same runtime path as manual tasks
- record suggestion provenance so replay and governance stay auditable

Out of scope:

- fully autonomous background execution of destructive tasks
- free-form tool use or generic multi-step planning
- policy auto-activation
- cloud dispatch, multi-device coordination, or remote workers
- replacing the existing `Review Queue`, `Import`, or `Memory Workspace` surfaces with a chat shell

## Suggested Trigger Set For Phase Four

Start with three deterministic trigger families only:

1. `governance.failed_runs_detected`
   Emit one suggestion when there are failed agent runs without a newer governance summary.

2. `review.safe_group_available`
   Emit one suggestion when the review agent can already identify a non-conflicting safe group worth inspecting via `review.suggest_safe_group_action`.

3. `ingestion.failed_enrichment_job`
   Emit one suggestion per failed enrichment job, prefilled to rerun that specific job through `ingestion.rerun_enrichment`.

This is intentionally narrow. It raises the system’s proactivity without introducing a second business-rules engine.

## Execution Notes

- Follow `@test-driven-development` for each task: write the failing test first, run it, implement the minimum, rerun, then commit.
- Follow `@verification-before-completion` before every completion claim and before any integration commit.
- Prefer structured persisted `RunAgentTaskInput` payloads over regenerating prompts from loose metadata.
- Keep YAGNI pressure high. The goal is an auditable proactive inbox, not a self-running autonomous agent platform.

### Task 1: Persist a First-Class Agent Suggestion Inbox

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentPersistenceService.ts`
- Create: `src/main/services/migrations/023_agent_runtime_proactive_suggestions.sql`
- Modify: `tests/unit/shared/agentRuntimeContracts.test.ts`
- Modify: `tests/unit/main/agentPersistenceService.test.ts`

**Step 1: Write the failing contract and persistence tests**

Add tests that prove:

- `AgentSuggestionRecord` round-trips a persisted `RunAgentTaskInput`
- suggestions can be listed newest-first with status filtering
- duplicate observations update `lastObservedAt` instead of inserting a second row
- dismissed and executed suggestions stay queryable for audit

Use expectations shaped like:

```ts
expect(suggestions[0]).toMatchObject({
  triggerKind: 'governance.failed_runs_detected',
  status: 'suggested',
  taskInput: {
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    prompt: 'Summarize failed agent runs from the proactive monitor.'
  }
})
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: FAIL because the contracts and persistence layer do not yet define proactive suggestions.

**Step 3: Add shared contracts for proactive suggestions**

In `src/shared/archiveContracts.ts`, add explicit types for:

```ts
export type AgentTriggerKind =
  | 'governance.failed_runs_detected'
  | 'review.safe_group_available'
  | 'ingestion.failed_enrichment_job'

export type AgentSuggestionStatus =
  | 'suggested'
  | 'dismissed'
  | 'executed'

export type AgentSuggestionRecord = {
  suggestionId: string
  triggerKind: AgentTriggerKind
  status: AgentSuggestionStatus
  role: AgentRole
  taskKind: AgentTaskKind
  taskInput: RunAgentTaskInput
  dedupeKey: string
  sourceRunId: string | null
  executedRunId: string | null
  createdAt: string
  updatedAt: string
  lastObservedAt: string
}
```

Also add:

```ts
export type ListAgentSuggestionsInput = {
  status?: AgentSuggestionStatus
  role?: AgentRole
  limit?: number
}

export type DismissAgentSuggestionInput = {
  suggestionId: string
}

export type RunAgentSuggestionInput = {
  suggestionId: string
  confirmationToken?: string
}
```

Extend `ArchiveApi` with `listAgentSuggestions(...)`, `dismissAgentSuggestion(...)`, and `runAgentSuggestion(...)`.

**Step 4: Add SQLite storage and persistence helpers**

Create `src/main/services/migrations/023_agent_runtime_proactive_suggestions.sql` with:

- `agent_suggestions`
- unique index on `dedupe_key`
- indexes on `status`, `role`, and `last_observed_at`

Persist `task_input_json` as the canonical executable payload.

In `src/main/services/agentPersistenceService.ts`, add helpers shaped like:

```ts
upsertAgentSuggestion(db, {
  triggerKind,
  role,
  taskKind,
  taskInput,
  dedupeKey,
  sourceRunId
})

listAgentSuggestions(db, input)
dismissAgentSuggestion(db, { suggestionId })
markAgentSuggestionExecuted(db, { suggestionId, runId })
getAgentSuggestion(db, { suggestionId })
```

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentPersistenceService.ts src/main/services/migrations/023_agent_runtime_proactive_suggestions.sql tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
git commit -m "feat: persist proactive agent suggestions"
```

### Task 2: Generate Deterministic Suggestions From Existing Runtime Signals

**Files:**
- Create: `src/main/services/agentProactiveTriggerService.ts`
- Modify: `src/main/services/agents/reviewAgentService.ts`
- Modify: `src/main/services/reviewWorkbenchReadService.ts`
- Modify: `src/main/services/enrichmentReadService.ts`
- Modify: `tests/unit/main/reviewAgentService.test.ts`
- Create: `tests/unit/main/agentProactiveTriggerService.test.ts`

**Step 1: Write the failing trigger-evaluation tests**

Add tests that prove:

- failed agent runs create one governance suggestion
- an available safe group creates one review suggestion
- failed enrichment jobs create one rerun suggestion per job
- dedupe keys stay stable across multiple evaluation cycles

Use expectations shaped like:

```ts
expect(suggestions).toContainEqual(expect.objectContaining({
  triggerKind: 'review.safe_group_available',
  taskInput: {
    role: 'review',
    taskKind: 'review.suggest_safe_group_action',
    prompt: 'Check for a safe review group that is ready for approval.'
  }
}))
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts
```

Expected: FAIL because there is no proactive trigger service and no shared trigger vocabulary yet.

**Step 3: Build the trigger-evaluation service**

Create `src/main/services/agentProactiveTriggerService.ts` with one exported function:

```ts
export function evaluateAgentProactiveSuggestions(db: ArchiveDatabase): Array<{
  triggerKind: AgentTriggerKind
  role: AgentRole
  taskKind: AgentTaskKind
  taskInput: RunAgentTaskInput
  dedupeKey: string
  sourceRunId?: string | null
}>
```

Use only current authoritative read models:

- failed runs from `listAgentRuns(db, { status: 'failed' })`
- safe-group opportunities from `listReviewConflictGroups(db)`
- failed enrichment jobs from `listEnrichmentJobs(db, { status: 'failed' })`

Keep prompts deterministic and operator-readable.

**Step 4: Tighten the review-agent summary contract where needed**

If the tests expose weak safe-group phrasing, make the smallest change in `src/main/services/agents/reviewAgentService.ts` so the proactive prompt and the review-agent response align cleanly. Do not add auto-approval behavior here.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/agentProactiveTriggerService.ts src/main/services/agents/reviewAgentService.ts src/main/services/reviewWorkbenchReadService.ts src/main/services/enrichmentReadService.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts
git commit -m "feat: generate proactive suggestions from runtime signals"
```

### Task 3: Refresh Suggestions in the Background and Execute Them Through the Existing Runtime

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Create: `src/main/services/agentProactiveRunnerService.ts`
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/agentRuntimeService.test.ts`
- Create: `tests/unit/main/agentProactiveRunnerService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing runtime and IPC tests**

Add tests that prove:

- the runtime can refresh suggestions by evaluating and upserting them
- `runAgentSuggestion(...)` loads the stored `taskInput` and delegates to `runTask(...)`
- executing a suggestion records `executedRunId`
- dismiss and list operations are exposed through IPC, preload, and renderer archive API

Use expectations shaped like:

```ts
expect(runtime.runSuggestion({ suggestionId })).toMatchObject({
  status: 'completed'
})
expect(updatedSuggestion?.executedRunId).toBe(runId)
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the runtime and bridge layers do not expose proactive inbox operations.

**Step 3: Extend the runtime with suggestion operations**

In `src/main/services/agentRuntimeService.ts`, add:

```ts
refreshSuggestions(): AgentSuggestionRecord[]
listSuggestions(input?: ListAgentSuggestionsInput): AgentSuggestionRecord[]
dismissSuggestion(input: DismissAgentSuggestionInput): AgentSuggestionRecord | null
runSuggestion(input: RunAgentSuggestionInput): Promise<RunAgentTaskResult>
```

Implementation rules:

- `refreshSuggestions()` calls `evaluateAgentProactiveSuggestions(...)`, then `upsertAgentSuggestion(...)`
- `runSuggestion(...)` delegates to the existing `runTask(...)`
- `runSuggestion(...)` forwards `confirmationToken` only when supplied
- successful execution marks the suggestion as executed and stores `executedRunId`

**Step 4: Add a lightweight main-process proactive runner**

Create `src/main/services/agentProactiveRunnerService.ts` following the same pattern as `createEnrichmentRunner(...)`:

- open DB
- run migrations
- call `runtime.refreshSuggestions()`
- poll on a safe interval such as `15_000ms`
- never execute suggestions automatically in this phase

Register it in `src/main/index.ts` and stop it in `before-quit`.

**Step 5: Expose the proactive inbox through IPC and the renderer bridge**

In `src/main/ipc/agentIpc.ts`, register:

- `archive:listAgentSuggestions`
- `archive:dismissAgentSuggestion`
- `archive:runAgentSuggestion`
- `archive:refreshAgentSuggestions`

Mirror them through `src/preload/index.ts` and `src/renderer/archiveApi.ts`.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentRuntimeService.ts src/main/services/agentProactiveRunnerService.ts src/main/ipc/agentIpc.ts src/main/index.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: refresh and execute proactive agent suggestions"
```

### Task 4: Surface the Proactive Inbox in Agent Console

**Files:**
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`
- Create: `tests/e2e/agent-console-proactive-inbox-flow.spec.ts`
- Create: `docs/release/agent-runtime-phase-four-checklist.md`

**Step 1: Write the failing renderer and e2e tests**

Add tests that prove:

- `Agent Console` renders proactive suggestions in a dedicated inbox section
- the operator can refresh suggestions
- the operator can run a suggestion and see the resulting run in history
- the operator can dismiss a suggestion
- execution of a confirmation-gated suggestion still routes through the existing confirmation affordance

Use expectations shaped like:

```tsx
expect(screen.getByText('Proactive inbox')).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Run suggestion' })).toBeEnabled()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-proactive-inbox-flow.spec.ts
```

Expected: FAIL because the console does not yet render or act on suggestions.

**Step 3: Add the proactive inbox UI**

Update `src/renderer/pages/AgentConsolePage.tsx` so the page:

- loads `listAgentSuggestions({ status: 'suggested' })` on mount
- shows trigger kind, target role, task kind, and prompt summary
- lets the operator `Refresh`, `Run`, or `Dismiss`
- refreshes run history and suggestion state after each action

Keep the UX consistent with phase three:

- do not hide execution preview
- do not bypass confirmation gates
- keep the run-history panel authoritative for what actually executed

Add i18n strings for:

- proactive inbox title and empty state
- trigger labels
- run/dismiss/refresh buttons
- success and error states

**Step 4: Add a release checklist for the new behavior**

Create `docs/release/agent-runtime-phase-four-checklist.md` covering:

- background suggestion refresh
- failed-run governance suggestion
- safe-group review suggestion
- failed-enrichment rerun suggestion
- dismiss behavior
- run-history linkage
- targeted regression commands

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx tests/unit/renderer/agentConsolePage.test.tsx tests/e2e/agent-console-proactive-inbox-flow.spec.ts docs/release/agent-runtime-phase-four-checklist.md
git commit -m "feat: add proactive inbox to agent console"
```

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts
```

Expected:

- all targeted tests pass
- the proactive runner never executes destructive actions on its own
- the operator can always explain why a suggestion appeared by inspecting trigger kind and prompt

## Done Criteria

- the system surfaces suggestions without waiting for the user to author a prompt first
- all suggestion executions still go through the hardened runtime path
- replay and audit trails show which proactive suggestion led to which run
- proactivity increases meaningfully while human control remains intact
