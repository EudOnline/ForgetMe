# Phase 10J Approved Draft Background Retry Queue & Launch Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight background retry queue and app-lifecycle retry runner for approved-draft provider sends so failed outbound sends can recover automatically without losing destination identity, retry lineage, or replay visibility.

**Architecture:** Extend approved-draft provider send artifacts with one new `automatic_retry` attempt kind and an optional background retry read model, persist one retry-job row per failed artifact, and run a single main-process polling runner that claims due jobs, reuses the existing send service, and surfaces queue state back through the existing send-history read path and Memory Workspace UI.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, Vitest, Playwright.

---

## Scope Decisions

- `Phase 10J approved draft background retry queue & launch recovery` **does include**:
  - `automatic_retry` as a first-class approved-draft send attempt kind
  - a lightweight retry queue persisted in SQLite
  - fixed-delay automatic retry with fixed max-attempt policy
  - a main-process retry runner started from `src/main/index.ts`
  - queue cancellation when operator triggers manual retry on the same failed artifact
  - queue state visible through the existing approved-draft send history read path
  - renderer polling so background recovery appears without a manual page refresh
  - deterministic unit/e2e coverage for automatic retry and launch recovery

- `Phase 10J approved draft background retry queue & launch recovery` **does not include**:
  - a generic outbound scheduler
  - exponential backoff
  - provider-specific retry policy
  - batch retry
  - a dedicated retry dashboard
  - queue pause/resume controls
  - custom destination CRUD
  - publish/share links

- `Phase 10J` policy rules:
  1. automatic retry must still respect `approved` review gating by rebuilding from the current review source of truth
  2. automatic retry inherits the failed artifact's `destinationId`; changing destination remains a new normal send
  3. automatic retry creates a new artifact and never mutates the failed artifact row
  4. background retry job rows are orchestration state only; provider request/response/error facts remain in the existing artifact/event tables
  5. manual retry takes precedence over queued background retry for the same failed artifact

---

### Task 1: Add shared automatic-retry contracts and artifact read-model fields

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts` to cover:

1. `ApprovedDraftProviderSendAttemptKind` now includes:
   - `initial_send`
   - `manual_retry`
   - `automatic_retry`
2. `ApprovedPersonaDraftProviderSendArtifact` carries:
   - `attemptKind`
   - `retryOfArtifactId`
   - `backgroundRetry`
3. `backgroundRetry` supports:
   - `pending`
   - `processing`
   - `completed`
   - `cancelled`
   - `failed`
   - `exhausted`

Add expectations such as:

```ts
expectTypeOf<ApprovedDraftProviderSendAttemptKind>().toEqualTypeOf<
  'initial_send' | 'manual_retry' | 'automatic_retry'
>()

expect(artifact.backgroundRetry).toEqual({
  status: 'pending',
  autoRetryAttemptIndex: 1,
  maxAutoRetryAttempts: 3,
  nextRetryAt: '2026-03-17T09:00:30.000Z',
  claimedAt: null
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts
```

Expected: FAIL because the automatic retry type and background retry read model do not exist yet.

**Step 3: Write minimal implementation**

Update `src/shared/archiveContracts.ts` to add:

```ts
export type ApprovedDraftProviderSendAttemptKind =
  | 'initial_send'
  | 'manual_retry'
  | 'automatic_retry'

export type ApprovedDraftProviderSendBackgroundRetryStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'exhausted'

export type ApprovedDraftProviderSendBackgroundRetry = {
  status: ApprovedDraftProviderSendBackgroundRetryStatus
  autoRetryAttemptIndex: number | null
  maxAutoRetryAttempts: number
  nextRetryAt: string | null
  claimedAt: string | null
}
```

Extend `ApprovedPersonaDraftProviderSendArtifact` with:

```ts
attemptKind: ApprovedDraftProviderSendAttemptKind
retryOfArtifactId: string | null
backgroundRetry: ApprovedDraftProviderSendBackgroundRetry | null
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts
git commit -m "feat: add approved draft auto-retry contracts"
```

---

### Task 2: Persist retry jobs and enqueue failed sends for background recovery

**Files:**
- Create: `src/main/services/migrations/019_persona_draft_send_retry_queue.sql`
- Modify: `src/main/services/approvedDraftProviderSendService.ts`
- Modify: `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts`
- Modify: `tests/unit/main/approvedDraftProviderSendService.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts` to expect a new table:

- `persona_draft_provider_send_retry_jobs`

with columns:

- `failed_artifact_id`
- `status`
- `auto_retry_attempt_index`
- `next_retry_at`
- `claimed_at`
- `retry_artifact_id`
- `last_error_message`

Extend `tests/unit/main/approvedDraftProviderSendService.test.ts` to cover:

1. an initial failed send enqueues one pending retry job:
   - `status = 'pending'`
   - `autoRetryAttemptIndex = 1`
2. a manual retry on the failed artifact cancels the old pending job before sending
3. an automatic retry failure can enqueue the next retry job with:
   - `autoRetryAttemptIndex = 2`
4. once max automatic retries are exhausted, the latest failed artifact exposes:
   - `backgroundRetry.status = 'exhausted'`
5. list/read-side history includes `backgroundRetry` for failed artifacts

Example expectations:

```ts
expect(history[0]).toMatchObject({
  attemptKind: 'initial_send',
  backgroundRetry: {
    status: 'pending',
    autoRetryAttemptIndex: 1,
    maxAutoRetryAttempts: 3
  }
})
```

```ts
expect(history[0]).toMatchObject({
  attemptKind: 'automatic_retry',
  backgroundRetry: {
    status: 'exhausted',
    autoRetryAttemptIndex: 3,
    maxAutoRetryAttempts: 3
  }
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts
```

Expected: FAIL because retry-job persistence and read-side queue state do not exist yet.

**Step 3: Write minimal implementation**

Add migration `019_persona_draft_send_retry_queue.sql`:

```sql
create table if not exists persona_draft_provider_send_retry_jobs (
  id text primary key,
  failed_artifact_id text not null unique,
  draft_review_id text not null,
  source_turn_id text not null,
  destination_id text,
  destination_label text,
  status text not null,
  auto_retry_attempt_index integer not null,
  next_retry_at text not null,
  claimed_at text,
  retry_artifact_id text,
  last_error_message text,
  created_at text not null,
  updated_at text not null
);
```

Update `src/main/services/approvedDraftProviderSendService.ts` so that:

- `ApprovedDraftProviderSendAttemptKind` supports `automatic_retry`
- fixed config helpers read:
  - `FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS`
  - `FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS`
- failed sends call a helper like:

```ts
enqueueApprovedDraftProviderSendRetryJob(db, {
  failedArtifactId: persisted.artifactId,
  draftReviewId: request.draftReviewId,
  sourceTurnId: request.sourceTurnId,
  destinationId: request.destinationId,
  destinationLabel: request.destinationLabel,
  failedAt,
  attemptKind: attempt.attemptKind
})
```

- queue eligibility logic:
  1. skip if a child retry artifact already exists for this failed artifact
  2. count lineage items where `attemptKind === 'automatic_retry'`
  3. if count is below max, insert one `pending` job with `auto_retry_attempt_index = count + 1`
  4. otherwise insert nothing and let read-side surface `exhausted`

- manual retry cancels any `pending` retry job for the target artifact before sending
- `listApprovedPersonaDraftProviderSends(...)` joins the retry-job table and attaches:
  - queue-backed `backgroundRetry`
  - derived `exhausted` state when the latest event is `error`, no queue row exists, and automatic retry max is already reached

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/019_persona_draft_send_retry_queue.sql src/main/services/approvedDraftProviderSendService.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts
git commit -m "feat: queue approved draft auto-retries"
```

---

### Task 3: Add a main-process retry runner and start it with the app

**Files:**
- Create: `src/main/services/approvedDraftProviderSendRetryRunnerService.ts`
- Modify: `src/main/index.ts`
- Create: `tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts` to cover:

1. `claimNextApprovedDraftProviderSendRetryJob(...)` claims the oldest due pending job and marks it `processing`
2. a completed automatic retry marks the job `completed` and records `retryArtifactId`
3. a failed automatic retry marks the job `failed` and stores the error message
4. `createApprovedDraftProviderSendRetryRunner(...)` starts an interval loop and stops cleanly
5. stale jobs are cancelled when:
   - the failed artifact already has a child retry artifact
   - or the artifact no longer exists

Example expectations:

```ts
expect(claimed).toEqual(expect.objectContaining({
  failedArtifactId: 'pdpe-failed-1',
  status: 'processing'
}))
```

```ts
await vi.advanceTimersByTimeAsync(20)
expect(runCycle).toHaveBeenCalledTimes(1)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts
```

Expected: FAIL because the retry runner service does not exist yet.

**Step 3: Write minimal implementation**

Create `src/main/services/approvedDraftProviderSendRetryRunnerService.ts` following the same lightweight pattern as `enrichmentRunnerService.ts`.

Add core helpers:

```ts
claimNextApprovedDraftProviderSendRetryJob(db)
completeApprovedDraftProviderSendRetryJob(db, input)
failApprovedDraftProviderSendRetryJob(db, input)
cancelApprovedDraftProviderSendRetryJob(db, input)
createApprovedDraftProviderSendRetryRunner({ appPaths, intervalMs?, runCycle? })
```

Default runner cycle should:

1. open the archive DB and run migrations
2. claim one due pending retry job
3. if none exists, return `false`
4. confirm the failed artifact still has:
   - latest event `error`
   - no child retry artifact
5. call the existing retry service using `attemptKind = 'automatic_retry'`
6. mark the job `completed` on success
7. mark the job `failed` on error

Update `src/main/index.ts` to:

- create the retry runner alongside `createEnrichmentRunner(...)`
- stop it during `before-quit`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftProviderSendRetryRunnerService.ts src/main/index.ts tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts
git commit -m "feat: run approved draft auto-retries in background"
```

---

### Task 4: Surface automatic retry outcomes in journal labels and Memory Workspace UI

**Files:**
- Modify: `src/main/services/journalService.ts`
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`
- Modify: `tests/unit/renderer/searchPage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to expect:

1. latest failed provider send can render:
   - `Auto retry: queued`
   - `Next retry:`
2. latest exhausted provider send can render:
   - `Auto retry exhausted after 3 attempts`
3. manual retry button is disabled when:
   - `backgroundRetry.status === 'processing'`
4. page polling refreshes provider-send history and updates the visible state

Extend `tests/unit/renderer/searchPage.test.tsx` and `tests/unit/renderer/reviewQueuePage.test.tsx` to cover automatic-retry labels:

- `Approved draft auto-retried to provider`
- `Approved draft auto-retry failed`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: FAIL because journal labels and handoff UI do not yet recognize automatic retry state.

**Step 3: Write minimal implementation**

Update `src/main/services/journalService.ts` so label formatting becomes:

```ts
send_approved_persona_draft_to_provider + automatic_retry
  -> "Approved draft auto-retried to provider"

send_approved_persona_draft_to_provider_failed + automatic_retry
  -> "Approved draft auto-retry failed"
```

Update `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx` so latest failed send can show:

- `Attempt: automatic retry`
- `Auto retry: queued · attempt 1 of 3`
- `Next retry: <timestamp>`
- `Auto retry: processing`
- `Auto retry exhausted after 3 attempts`

Also:

- rename the button text to `Retry failed send now`
- disable it when `backgroundRetry?.status === 'processing'`

Update `src/renderer/pages/MemoryWorkspacePage.tsx` to add a small polling effect:

1. when sandbox turns with approved reviews are visible, start an interval
2. on each tick, call `listApprovedPersonaDraftProviderSends({ draftReviewId })`
3. refresh only the relevant turns
4. clear the interval on unmount / scope change

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/journalService.ts src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
git commit -m "feat: show approved draft auto-retry state"
```

---

### Task 5: Add deterministic unit and e2e coverage for automatic retry and launch recovery

**Files:**
- Modify: `tests/unit/main/approvedDraftProviderSendService.test.ts`
- Modify: `tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts`
- Modify: `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`

**Step 1: Write the failing tests**

Extend `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts` with two deterministic scenarios:

1. `error -> automatic retry -> success`
   - set:
     - `FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE=1`
     - `FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE=1`
     - `FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS=0`
     - `FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS=100`
   - click `Send approved draft`
   - verify the page first shows `error recorded`
   - then, without clicking retry, verify it updates to:
     - `response recorded`
     - `Attempt: automatic retry`

2. launch recovery
   - first launch:
     - configure a delay longer than the test pause
     - create one failed send
     - close the app before auto retry executes
   - second launch with the same `FORGETME_E2E_USER_DATA_DIR`:
     - lower the delay / keep runner enabled
     - verify the previously queued retry is recovered automatically and the UI ends at:
       - `response recorded`
       - `Attempt: automatic retry`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: FAIL because background retry and launch recovery do not exist yet.

**Step 3: Write minimal implementation**

Use the existing fixture path and short env overrides; do not add a second fake provider.

If needed, make the fixture behavior reset cleanly between Electron launches so:

- the first send can fail once
- the next automatic retry can succeed deterministically

Ensure the page polling interval is short enough in test mode for the UI to observe the background result without manual interaction.

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: PASS

Then run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- PASS for auto-retry recovery
- PASS for launch recovery

**Step 5: Commit**

```bash
git add tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
git commit -m "test: cover approved draft auto-retry recovery"
```

---

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/approvedDraftProviderSendRetryRunnerService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/searchPage.test.tsx
```

Expected:

- all approved-draft send contract, persistence, runner, and renderer tests PASS

Then run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- approved draft handoff flow still PASSes
- approved draft provider send flow PASSes for:
  - manual send baseline
  - automatic retry recovery
  - launch recovery

---

## Notes For Implementation

- Reuse the existing destination identity from `10H`; do not invent a second retry-target model.
- Reuse the existing retry lineage from `10I`; do not overwrite failed artifacts or replay stale request JSON.
- Keep the queue slice approved-draft-specific; do not generalize it into a repository-wide scheduler in this phase.
- Make renderer polling narrow and cheap; only poll approved sandbox turns instead of the whole workspace state.
