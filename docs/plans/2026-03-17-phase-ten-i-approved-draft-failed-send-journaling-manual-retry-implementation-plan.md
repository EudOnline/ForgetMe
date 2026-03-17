# Phase 10I Approved Draft Failed Send Journaling & Manual Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add failed-send journaling and a narrow manual retry flow for approved-draft provider sends so operators can recover from outbound failures without losing destination identity or audit traceability.

**Architecture:** Extend the existing approved-draft provider send artifact model with attempt metadata (`attemptKind`, `retryOfArtifactId`), journal failed sends as first-class decision-history events, and add one explicit renderer retry action that reuses the failed artifact's destination while rebuilding the current approved handoff artifact from the review source of truth.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, Vitest, Playwright.

---

## Scope Decisions

- `Phase 10I approved draft failed-send journaling & manual retry` **does include**:
  - failed approved-draft send journal entries
  - attempt metadata on approved-draft provider send artifacts
  - one explicit `retryApprovedPersonaDraftProviderSend(...)` API
  - manual retry from the existing `Approved Draft Handoff` panel
  - search / replay visibility for failed and retried sends
  - deterministic e2e coverage for `error -> manual retry -> success`

- `Phase 10I approved draft failed-send journaling & manual retry` **does not include**:
  - background retry queue
  - auto-retry on app launch
  - batch retry
  - custom destination CRUD
  - publish / share links
  - a new outbound dashboard

- `Phase 10I` policy rules:
  1. retry must continue to respect `approved` review gating
  2. retry inherits the failed artifact's `destinationId`; changing destination remains a new normal send
  3. retry creates a new provider send artifact and never mutates the failed artifact row
  4. failed sends must become searchable and replayable through `decision_journal`

---

### Task 1: Add shared retry contracts and IPC shapes

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts` to cover:

1. a new `ApprovedDraftProviderSendAttemptKind` union:
   - `initial_send`
   - `manual_retry`
2. `ApprovedPersonaDraftProviderSendArtifact` and `SendApprovedPersonaDraftToProviderResult` carrying:
   - `attemptKind`
   - `retryOfArtifactId`
3. a new archive API method:
   - `retryApprovedPersonaDraftProviderSend(input: { artifactId: string })`
4. a new IPC schema:
   - `retryApprovedPersonaDraftProviderSendInputSchema`

Add expectations such as:

```ts
expect(artifact.attemptKind).toBe('manual_retry')
expect(artifact.retryOfArtifactId).toBe('pdpe-failed-1')
expectTypeOf<ArchiveApi['retryApprovedPersonaDraftProviderSend']>().toEqualTypeOf<
  (input: { artifactId: string }) => Promise<SendApprovedPersonaDraftToProviderResult | null>
>()
```

Extend `tests/unit/renderer/archiveApi.test.ts` to expect:

```ts
await expect(archiveApi.retryApprovedPersonaDraftProviderSend({
  artifactId: 'pdpe-failed-1'
})).resolves.toBeNull()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the retry contracts and archive API method do not exist yet.

**Step 3: Write minimal implementation**

Add to `src/shared/archiveContracts.ts`:

```ts
export type ApprovedDraftProviderSendAttemptKind = 'initial_send' | 'manual_retry'

export type RetryApprovedPersonaDraftProviderSendInput = {
  artifactId: string
}
```

Update:

- `ApprovedPersonaDraftProviderSendArtifact`
- `SendApprovedPersonaDraftToProviderResult`
- `ArchiveApi`

Add to `src/shared/ipcSchemas.ts`:

```ts
export const approvedDraftProviderSendArtifactIdSchema = z.string().min(1)
export const retryApprovedPersonaDraftProviderSendInputSchema = z.object({
  artifactId: approvedDraftProviderSendArtifactIdSchema
})
```

Update `src/renderer/archiveApi.ts` fallback and IPC bridge plus `src/preload/index.ts` to include:

```ts
retryApprovedPersonaDraftProviderSend: async () => null
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/renderer/archiveApi.ts src/preload/index.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft send retry contracts"
```

---

### Task 2: Persist retry attempt metadata and add failed-send journaling in the main service

**Files:**
- Create: `src/main/services/migrations/018_persona_draft_send_retry_attempts.sql`
- Modify: `src/main/services/approvedDraftProviderSendService.ts`
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts`
- Modify: `tests/unit/main/approvedDraftProviderSendService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts` to expect:

- `attempt_kind`
- `retry_of_artifact_id`

Extend `tests/unit/main/approvedDraftProviderSendService.test.ts` to cover:

1. initial sends persist:
   - `attemptKind = 'initial_send'`
   - `retryOfArtifactId = null`
2. failed sends write a failed journal entry:
   - `decisionType = 'send_approved_persona_draft_to_provider_failed'`
   - payload includes `errorMessage`, `destinationId`, `attemptKind`
3. retrying a failed artifact:
   - returns a new successful send result
   - preserves the failed artifact's `destinationId`
   - persists `attemptKind = 'manual_retry'`
   - persists `retryOfArtifactId = '<failed artifact id>'`
4. retrying a non-failed or missing artifact returns `null`
5. listing provider sends returns attempt metadata for both initial and retried artifacts

Example expectations:

```ts
expect(history[0]).toMatchObject({
  attemptKind: 'manual_retry',
  retryOfArtifactId: 'pdpe-failed-1',
  destinationId: 'openrouter-qwen25-72b'
})
```

Extend `tests/unit/main/memoryWorkspaceIpc.test.ts` to expect:

```ts
const handler = handlerMap.get('archive:retryApprovedPersonaDraftProviderSend')
await expect(handler?.({}, { artifactId: 'pdpe-failed-1' })).resolves.toEqual(
  expect.objectContaining({
    attemptKind: 'manual_retry',
    retryOfArtifactId: 'pdpe-failed-1'
  })
)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because retry attempt columns, retry API wiring, and failed-send journaling do not exist yet.

**Step 3: Write minimal implementation**

Add migration `018_persona_draft_send_retry_attempts.sql`:

```sql
alter table persona_draft_provider_egress_artifacts add column attempt_kind text;
alter table persona_draft_provider_egress_artifacts add column retry_of_artifact_id text;
```

Update `approvedDraftProviderSendService.ts` so:

- request persistence stores:
  - `attempt_kind`
  - `retry_of_artifact_id`
- normal sends default to:
  - `attemptKind = 'initial_send'`
  - `retryOfArtifactId = null`
- failed sends append a journal entry with:
  - `decisionType = 'send_approved_persona_draft_to_provider_failed'`
  - `errorMessage`
  - `destinationId`
  - `destinationLabel`
  - `attemptKind`
  - `retryOfArtifactId`
- successful sends include `attemptKind` and `retryOfArtifactId` in the success journal payload
- add:

```ts
export async function retryApprovedPersonaDraftProviderSend(
  db: ArchiveDatabase,
  input: { artifactId: string }
): Promise<SendApprovedPersonaDraftToProviderResult | null>
```

The retry helper should:

1. load the failed artifact row
2. confirm its latest event is `error`
3. reuse its `draftReviewId` and `destinationId`
4. call `sendApprovedPersonaDraftToProvider(...)` with:
   - `attemptKind: 'manual_retry'`
   - `retryOfArtifactId: <failed artifact id>`

Update `memoryWorkspaceIpc.ts` to add:

- `ipcMain.removeHandler('archive:retryApprovedPersonaDraftProviderSend')`
- `ipcMain.handle('archive:retryApprovedPersonaDraftProviderSend', ...)`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/018_persona_draft_send_retry_attempts.sql src/main/services/approvedDraftProviderSendService.ts src/main/ipc/memoryWorkspaceIpc.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "feat: journal approved draft send failures"
```

---

### Task 3: Add failed-send and retry-aware journal formatting across search and replay

**Files:**
- Modify: `src/main/services/journalService.ts`
- Modify: `tests/unit/main/searchService.test.ts`
- Modify: `tests/unit/renderer/searchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/main/searchService.test.ts` to cover:

1. failed send replay summaries:

```ts
expect(results).toContainEqual(expect.objectContaining({
  decisionType: 'send_approved_persona_draft_to_provider_failed',
  replaySummary: 'Approved draft send failed · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
}))
```

2. retried success replay summaries:

```ts
expect(results).toContainEqual(expect.objectContaining({
  decisionType: 'send_approved_persona_draft_to_provider',
  replaySummary: 'Approved draft resent to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
}))
```

Update renderer expectations in:

- `tests/unit/renderer/searchPage.test.tsx`
- `tests/unit/renderer/reviewQueuePage.test.tsx`

to look for:

- `Approved draft send failed`
- `Approved draft resent to provider`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: FAIL because journal labels and replay summaries do not yet recognize failed or retried approved-draft sends.

**Step 3: Write minimal implementation**

Update `journalService.ts` so that:

- `send_approved_persona_draft_to_provider_failed` maps to:
  - `Approved draft send failed`
  - or `Approved draft resend failed` when `attemptKind === 'manual_retry'`
- `send_approved_persona_draft_to_provider` maps to:
  - `Approved draft sent to provider`
  - or `Approved draft resent to provider` when `attemptKind === 'manual_retry'`
- `persona_draft_review` target labels still prefer `destinationLabel` when present

Keep the logic narrow:

- do not change unrelated decision types
- do not change undo semantics
- do not introduce a new replay page

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/journalService.ts tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
git commit -m "feat: label approved draft send failures and retries"
```

---

### Task 4: Add manual retry controls and latest failure detail in Memory Workspace

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. when the latest send event is `error`, the panel shows:
   - `error recorded`
   - latest error message
   - `Retry failed send`
2. clicking retry calls:

```ts
retryApprovedPersonaDraftProviderSend({
  artifactId: 'pdpe-failed-1'
})
```

3. after retry succeeds, the panel refreshes and shows:
   - `response recorded`
   - `Attempt: manual retry`
   - the same `destinationLabel`

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to cover:

1. replayed approved turns show:
   - latest failure summary when the latest artifact failed
   - attempt metadata when the latest artifact is a retry
2. retry lineage is visible through read-side summary only; do not add a replay-only state machine

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the handoff panel does not yet expose a retry action or failure-focused summary.

**Step 3: Write minimal implementation**

Update `MemoryWorkspacePage.tsx` to add:

- `archiveApi.retryApprovedPersonaDraftProviderSend` binding
- `handleRetryApprovedDraftProviderSend(turnId: string)` that:
  - finds the latest provider send for the turn
  - only proceeds when the latest event is `error`
  - calls `retryApprovedPersonaDraftProviderSend({ artifactId })`
  - refreshes provider sends afterward

Update `ApprovedPersonaDraftHandoffPanel.tsx` to render:

- `Attempt: initial send` / `Attempt: manual retry`
- latest error message when the latest event payload has `message`
- `Retry failed send` only when the latest event type is `error`

Update `MemoryWorkspaceView.tsx` to pass:

- `onRetryApprovedDraftSend`

Keep the UI narrow:

- retry does not open a modal
- retry does not edit destination
- normal `Send approved draft` continues to use the selector for a new send

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/components/MemoryWorkspaceView.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: add approved draft send retry control"
```

---

### Task 5: Add focused end-to-end coverage for failed send recovery

**Files:**
- Modify: `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`
- Modify: `src/main/services/approvedDraftProviderSendService.ts`

**Step 1: Write the failing e2e assertions**

Extend the provider-send flow to assert:

1. the first send can deterministically fail in fixture mode
2. the panel shows:
   - `error recorded`
   - the fixture error message
   - `Retry failed send`
3. clicking retry:
   - records a new successful send
   - keeps the same destination label
   - shows `Attempt: manual retry`

**Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: FAIL because fixture mode cannot yet produce a deterministic `error -> retry -> success` sequence and the UI has no retry action.

**Step 3: Write minimal implementation**

Add one deterministic fixture escape hatch in `approvedDraftProviderSendService.ts`, for example:

```ts
if (process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE === '1' && fixtureAttemptCount === 0) {
  fixtureAttemptCount++
  throw new Error('provider fixture offline')
}
```

Then update the e2e spec to launch Electron with:

```ts
FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE=1
FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE=1
```

Keep the fixture path deterministic:

- first send fails once
- the next retry succeeds

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftProviderSendService.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
git commit -m "test: cover approved draft send retry flow"
```

---

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- all focused unit suites PASS
- approved draft handoff export flow still PASSes
- approved draft provider-send flow PASSes with `error -> retry -> success`
- failed sends are searchable and replayable
- retry attempts create new artifacts with explicit linkage to the failed attempt they recover

## Notes for the Implementer

- Reuse the existing destination identity from `10H`; do not invent a second retry destination model.
- Retry should rebuild the current approved handoff artifact from `draftReviewId`; it should not replay stale request JSON.
- Keep failed-send journal integration narrow and do not widen it into a full outbound lifecycle engine.
- Do not introduce background scheduling in this slice; manual retry is the point of this phase.
