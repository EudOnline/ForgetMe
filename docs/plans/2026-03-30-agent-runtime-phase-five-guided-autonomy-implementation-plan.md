# Agent Runtime Phase Five Guided Autonomy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent runtime meaningfully more proactive by prioritizing suggestions, generating follow-up work from outcomes, and optionally auto-running allowlisted low-risk suggestions without losing operator control.

**Architecture:** Extend the current supervised proactivity layer into a policy-governed queue. Persist richer suggestion metadata such as priority, rationale, follow-up provenance, and auto-run eligibility; add deterministic ranking and follow-up planners on top of existing authoritative read models and agent run outcomes; and let the background runner auto-execute only allowlisted safe suggestions when runtime settings explicitly permit it. Keep destructive actions confirmation-gated and operator-visible in `Agent Console`.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing IPC/preload bridge, Vitest, Playwright.

---

## Recommended Direction

Recommended: **guided autonomy**.

- Keep trigger discovery deterministic and auditable.
- Allow limited auto-execution only for allowlisted, non-destructive tasks.
- Generate follow-up work from concrete run outcomes instead of free-form planning.
- Keep `Agent Console` as the authoritative operator surface for reviewing and overriding runtime behavior.

Not recommended for this phase:

- unrestricted autonomous execution across all task kinds
- LLM-only planning without persisted rationale or provenance
- automatic execution of `review.apply_safe_group`, `review.apply_item_decision`, or `workspace.publish_draft`
- adding a second orchestration shell outside the current runtime and archive services

## Assumptions

- `main` already includes the merged phase-four runtime, proactive suggestions, proactive runner, and Agent Console inbox.
- The current runtime remains role-based and local-first; this phase should improve initiative, not replace the current architecture.
- Destructive review actions must remain confirmation-gated even when they appear as follow-up suggestions.
- The first autonomy increment should stay deterministic enough that an operator can explain why the system acted.

## Scope Guardrails

In scope:

- persist suggestion priority, rationale, cooldown, and follow-up provenance
- persist runtime autonomy settings in SQLite and expose them through IPC and renderer APIs
- rank and suppress suggestions so the inbox becomes ordered, less noisy, and more actionable
- generate deterministic follow-up suggestions from completed agent runs
- let the background runner auto-run only allowlisted low-risk suggestions when enabled
- show autonomy mode, priority, rationale, and auto-run history in `Agent Console`

Out of scope:

- self-directed destructive review execution
- generic multi-step agent tool use
- model-selected trigger families with opaque heuristics
- cloud dispatch, distributed workers, or remote execution
- replacing existing product surfaces with a chat-first operating model

## Proposed Autonomy Lanes

Use three execution lanes only:

1. `manual_only`
   All suggestions are operator-reviewed and operator-run.

2. `suggest_safe_auto_run`
   The runner may auto-run suggestions that are both allowlisted and marked `autoRunnable = true`.

3. `manual_follow_up_required`
   Follow-up suggestions may be generated automatically, but execution remains manual because the task is destructive or policy-sensitive.

Initial allowlist for safe auto-run:

- `governance.summarize_failures`
- `review.summarize_queue`
- `review.suggest_safe_group_action`
- `ingestion.rerun_enrichment`

Do not auto-run:

- `review.apply_safe_group`
- `review.apply_item_decision`
- `workspace.publish_draft`
- `governance.propose_policy_update`

## Suggested Follow-Up Set For Phase Five

Start with three deterministic follow-up families only:

1. `governance.failure_summary_ready`
   After a completed `governance.summarize_failures` run with at least one failed run still present, emit a manual `governance.propose_policy_update` suggestion.

2. `review.safe_group_action_ready`
   After a completed `review.suggest_safe_group_action` run that identifies a safe group key, emit a manual `review.apply_safe_group` suggestion prefilled with the group-specific prompt.

3. `ingestion.retry_still_failing`
   After a failed `ingestion.rerun_enrichment` run on the same job more than once, raise a high-priority governance summary suggestion instead of repeatedly surfacing the same retry prompt.

This keeps the system more proactive without turning it into an opaque planner.

## Execution Notes

- Follow `@test-driven-development` for each task: write the failing test first, run it, implement the minimum, rerun, then commit.
- Follow `@verification-before-completion` before every completion claim and before every integration commit.
- Prefer persisted structured data over scraping display strings when deriving follow-up suggestions.
- Keep YAGNI pressure high. The goal is guided autonomy with clear safety boundaries, not a fully autonomous agent platform.

### Task 1: Persist Guided-Autonomy Metadata and Settings

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentPersistenceService.ts`
- Create: `src/main/services/migrations/024_agent_runtime_guided_autonomy.sql`
- Modify: `tests/unit/shared/agentRuntimeContracts.test.ts`
- Modify: `tests/unit/main/agentPersistenceService.test.ts`

**Step 1: Write the failing contract and persistence tests**

Add tests that prove:

- `AgentSuggestionRecord` now round-trips `priority`, `rationale`, `autoRunnable`, `followUpOfSuggestionId`, `attemptCount`, and `cooldownUntil`
- runtime settings can be created, updated, and listed through persistence helpers
- agent runs can store an `executionOrigin` such as `operator_manual`, `operator_suggestion`, or `auto_runner`
- follow-up suggestions preserve parent suggestion provenance and remain queryable for audit

Use expectations shaped like:

```ts
expect(suggestion).toMatchObject({
  priority: 'high',
  rationale: 'Repeated enrichment failures are blocking downstream review.',
  autoRunnable: true,
  followUpOfSuggestionId: null,
  attemptCount: 0,
  cooldownUntil: null
})
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: FAIL because the contracts and persistence layer do not yet define guided-autonomy metadata.

**Step 3: Extend shared contracts**

In `src/shared/archiveContracts.ts`, add:

```ts
export type AgentSuggestionPriority = 'low' | 'medium' | 'high' | 'critical'

export type AgentRunExecutionOrigin =
  | 'operator_manual'
  | 'operator_suggestion'
  | 'auto_runner'

export type AgentAutonomyMode =
  | 'manual_only'
  | 'suggest_safe_auto_run'

export type AgentRuntimeSettingsRecord = {
  settingsId: string
  autonomyMode: AgentAutonomyMode
  updatedAt: string
}
```

Extend `AgentSuggestionRecord` with:

```ts
priority: AgentSuggestionPriority
rationale: string
autoRunnable: boolean
followUpOfSuggestionId: string | null
attemptCount: number
cooldownUntil: string | null
```

Extend `AgentRunRecord` with:

```ts
executionOrigin: AgentRunExecutionOrigin
```

Add:

```ts
export type GetAgentRuntimeSettingsInput = {}
export type UpdateAgentRuntimeSettingsInput = {
  autonomyMode: AgentAutonomyMode
}
```

Extend `ArchiveApi` with `getAgentRuntimeSettings()` and `updateAgentRuntimeSettings(...)`.

**Step 4: Add SQLite storage and persistence helpers**

Create `src/main/services/migrations/024_agent_runtime_guided_autonomy.sql` with:

- additional `agent_suggestions` columns for priority, rationale, auto_runnable, follow_up_of_suggestion_id, attempt_count, cooldown_until, last_attempted_at
- an `execution_origin` column on `agent_runs`
- a singleton-style `agent_runtime_settings` table
- indexes on `priority`, `auto_runnable`, `cooldown_until`, and `follow_up_of_suggestion_id`

In `src/main/services/agentPersistenceService.ts`, add helpers shaped like:

```ts
getAgentRuntimeSettings(db)
upsertAgentRuntimeSettings(db, input)
incrementAgentSuggestionAttempt(db, { suggestionId, attemptedAt, cooldownUntil })
listRunnableAgentSuggestions(db, input)
```

Update `createAgentRun(...)` so callers can set `executionOrigin`.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentPersistenceService.ts src/main/services/migrations/024_agent_runtime_guided_autonomy.sql tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts
git commit -m "feat: persist guided autonomy metadata"
```

### Task 2: Rank Suggestions and Generate Follow-Up Work From Outcomes

**Files:**
- Create: `src/main/services/agentSuggestionRankingService.ts`
- Create: `src/main/services/agentSuggestionFollowupService.ts`
- Modify: `src/main/services/agentProactiveTriggerService.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Modify: `src/main/services/agents/reviewAgentService.ts`
- Modify: `src/main/services/agents/governanceAgentService.ts`
- Modify: `tests/unit/main/reviewAgentService.test.ts`
- Modify: `tests/unit/main/governanceAgentService.test.ts`
- Create: `tests/unit/main/agentSuggestionRankingService.test.ts`
- Create: `tests/unit/main/agentSuggestionFollowupService.test.ts`
- Modify: `tests/unit/main/agentRuntimeService.test.ts`

**Step 1: Write the failing ranking and follow-up tests**

Add tests that prove:

- failed enrichment retries rank above informational governance summaries when they block downstream work
- repeated failed reruns cool down instead of reappearing aggressively every refresh cycle
- a completed safe-group recommendation can emit a `review.apply_safe_group` follow-up suggestion with manual execution mode
- a completed governance failure summary can emit a `governance.propose_policy_update` follow-up suggestion with rationale
- follow-up suggestions dedupe against both trigger family and parent suggestion

Use expectations shaped like:

```ts
expect(followups).toContainEqual(expect.objectContaining({
  triggerKind: 'review.safe_group_available',
  taskKind: 'review.apply_safe_group',
  autoRunnable: false,
  followUpOfSuggestionId: parentSuggestionId,
  priority: 'high'
}))
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentSuggestionRankingService.test.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: FAIL because ranking and follow-up planning services do not yet exist.

**Step 3: Build deterministic ranking and follow-up planners**

Create `src/main/services/agentSuggestionRankingService.ts` with one exported function shaped like:

```ts
export function rankAgentSuggestions(
  suggestions: AgentSuggestionSeed[],
  context: {
    existingSuggestions: AgentSuggestionRecord[]
    now: string
  }
): RankedAgentSuggestionSeed[]
```

Rules:

- assign `critical` to repeated enrichment failures with no successful rerun
- assign `high` to actionable review safe groups and governance policy follow-ups
- assign `medium` to governance summaries
- assign `low` only to informational summaries with no blocking signal
- set `cooldownUntil` on repeated failed rerun suggestions to reduce thrash

Create `src/main/services/agentSuggestionFollowupService.ts` with one exported function shaped like:

```ts
export function deriveAgentSuggestionFollowups(
  db: ArchiveDatabase,
  input: {
    runId: string
    parentSuggestionId?: string | null
  }
): RankedAgentSuggestionSeed[]
```

Only use persisted run details, authoritative queue state, and deterministic parsing of known agent responses.

**Step 4: Integrate ranking and follow-up generation into the runtime**

In `src/main/services/agentRuntimeService.ts`:

- update `refreshSuggestions()` to merge base trigger suggestions with ranked metadata
- update `runSuggestion(...)` so successful runs optionally derive and persist follow-up suggestions
- increment attempt counts and apply cooldowns when a suggestion run fails
- set `executionOrigin` appropriately for manual task runs and suggestion runs

Keep follow-up creation deterministic and auditable.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentSuggestionRankingService.test.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/agentRuntimeService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/agentSuggestionRankingService.ts src/main/services/agentSuggestionFollowupService.ts src/main/services/agentProactiveTriggerService.ts src/main/services/agentRuntimeService.ts src/main/services/agents/reviewAgentService.ts src/main/services/agents/governanceAgentService.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentSuggestionRankingService.test.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/agentRuntimeService.test.ts
git commit -m "feat: rank proactive suggestions and derive follow-up work"
```

### Task 3: Add a Policy-Governed Safe Auto-Run Lane

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Modify: `src/main/services/agentProactiveRunnerService.ts`
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Create: `tests/unit/main/agentAutonomyPolicy.test.ts`
- Modify: `tests/unit/main/agentProactiveRunnerService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing safe-auto-run tests**

Add tests that prove:

- the runner reads current runtime settings before auto-running anything
- only allowlisted `autoRunnable` suggestions with no confirmation requirement are auto-executed
- `manual_only` mode never auto-runs suggestions
- auto-run attempts set `executionOrigin = 'auto_runner'`
- failed auto-run attempts increment attempt count and apply cooldowns

Use expectations shaped like:

```ts
expect(result.run?.executionOrigin).toBe('auto_runner')
expect(disallowedSuggestion.executedRunId).toBeNull()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentAutonomyPolicy.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because runtime settings and auto-run gating are not implemented.

**Step 3: Implement safe auto-run policy**

In `src/main/services/agentRuntimeService.ts`, add:

```ts
getRuntimeSettings(): AgentRuntimeSettingsRecord
updateRuntimeSettings(input: UpdateAgentRuntimeSettingsInput): AgentRuntimeSettingsRecord
runNextAutoRunnableSuggestion(): Promise<RunAgentTaskResult | null>
```

Rules:

- load runtime settings from SQLite
- only auto-run suggestions when `autonomyMode === 'suggest_safe_auto_run'`
- never auto-run destructive tasks or any suggestion lacking `autoRunnable = true`
- claim at most one auto-runnable suggestion per cycle in this phase

In `src/main/services/agentProactiveRunnerService.ts`:

- after `refreshSuggestions()`, call `runNextAutoRunnableSuggestion()`
- keep concurrency at one
- swallow and audit failures without crashing the runner

**Step 4: Expose runtime settings through IPC and the renderer bridge**

In `src/main/ipc/agentIpc.ts`, register:

- `archive:getAgentRuntimeSettings`
- `archive:updateAgentRuntimeSettings`

Mirror them through `src/preload/index.ts` and `src/renderer/archiveApi.ts`.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentAutonomyPolicy.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentRuntimeService.ts src/main/services/agentProactiveRunnerService.ts src/main/ipc/agentIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/agentAutonomyPolicy.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add policy-governed safe auto-run lane"
```

### Task 4: Surface Guided Autonomy Controls and Audit in Agent Console

**Files:**
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`
- Create: `tests/e2e/agent-console-guided-autonomy-flow.spec.ts`
- Create: `docs/release/agent-runtime-phase-five-checklist.md`

**Step 1: Write the failing renderer and e2e tests**

Add tests that prove:

- `Agent Console` shows current autonomy mode
- the operator can switch between `manual_only` and `suggest_safe_auto_run`
- suggestions render priority, rationale, follow-up provenance, and auto-run eligibility
- auto-run results appear in run history with a visible `auto_runner` origin label
- destructive follow-up suggestions still route through the existing confirmation affordance

Use expectations shaped like:

```tsx
expect(screen.getByText('Autonomy mode')).toBeInTheDocument()
expect(screen.getByText('Priority: high')).toBeInTheDocument()
expect(screen.getByText('Execution origin: auto_runner')).toBeInTheDocument()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-guided-autonomy-flow.spec.ts
```

Expected: FAIL because the console does not yet surface guided-autonomy metadata or controls.

**Step 3: Add guided-autonomy UI**

Update `src/renderer/pages/AgentConsolePage.tsx` so the page:

- loads runtime settings on mount
- shows autonomy mode with an explicit operator toggle
- shows suggestion priority, rationale, and follow-up lineage
- marks auto-runnable suggestions clearly
- shows run origin in run history and run detail
- refreshes suggestions and history after any settings change or auto-run event

Keep the UX consistent with phase four:

- do not hide manual review affordances
- do not bypass confirmation gates
- keep run history authoritative for what actually happened

Add i18n strings for:

- autonomy mode labels
- priority labels
- run origin labels
- follow-up lineage labels
- update success and error states

**Step 4: Add a release checklist**

Create `docs/release/agent-runtime-phase-five-checklist.md` covering:

- settings persistence
- manual-only mode behavior
- safe auto-run mode behavior
- follow-up suggestion creation
- cooldown and retry behavior
- auto-run audit visibility
- targeted regression commands

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts tests/e2e/agent-console-guided-autonomy-flow.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx tests/unit/renderer/agentConsolePage.test.tsx tests/e2e/agent-console-guided-autonomy-flow.spec.ts docs/release/agent-runtime-phase-five-checklist.md
git commit -m "feat: add guided autonomy controls to agent console"
```

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts tests/unit/main/agentSuggestionRankingService.test.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/agentAutonomyPolicy.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts tests/e2e/agent-console-guided-autonomy-flow.spec.ts
```

Run:

```bash
npm run build
```

Expected:

- all targeted tests pass
- auto-run never executes destructive review tasks
- follow-up suggestions are visible, deduplicated, and auditable
- the operator can switch back to `manual_only` at any time
