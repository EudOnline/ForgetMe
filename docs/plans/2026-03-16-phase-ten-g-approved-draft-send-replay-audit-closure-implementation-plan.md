# Phase 10G Approved Draft Send Replay & Audit Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add replayable decision-history visibility for successful approved-draft provider sends so operators can find, inspect, and revisit remote sends from global audit surfaces without widening the outbound feature set.

**Architecture:** Keep `persona_draft_provider_egress_artifacts / events` as the detailed source of truth, append a high-level `decision_journal` entry only for successful sends, reuse existing `Search` and `Review Queue` decision-history readers, and extend the `Approved Draft Handoff` panel with a compact latest-send audit detail view that reads the already-persisted boundary events.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite-backed services, Better SQLite3, Vitest, Playwright.

---

## Scope Decisions

- `Phase 10G approved draft send replay & audit closure` **does include**:
  - successful-send `decision_journal` entries for approved draft provider sends
  - readable journal labels / replay summaries for approved draft sends
  - search coverage for approved draft send journal history
  - replay detail visibility through existing decision-history surfaces
  - a compact latest-send audit detail view inside `Approved Draft Handoff`
  - regression coverage for saved-session / replayed approved turns

- `Phase 10G approved draft send replay & audit closure` **does not include**:
  - failed-send journaling
  - destination registries or provider pickers
  - publish/share links
  - retry orchestration
  - a new standalone outbound dashboard
  - refactoring enrichment and persona send audit tables into one schema

- `Phase 10G` policy rules:
  1. only successful sends write `decision_journal`
  2. detailed request / response / error facts stay in provider-boundary tables
  3. journal payload must link back to the provider send artifact
  4. renderer detail stays compact and local to the approved handoff panel

---

### Task 1: Add successful-send journal semantics and replay labels

**Files:**
- Modify: `src/main/services/approvedDraftProviderSendService.ts`
- Modify: `src/main/services/journalService.ts`
- Modify: `tests/unit/main/approvedDraftProviderSendService.test.ts`
- Modify: `tests/unit/main/searchService.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/main/approvedDraftProviderSendService.test.ts` to cover:

1. successful sends append a `decision_journal` entry with:
   - `decisionType = 'send_approved_persona_draft_to_provider'`
   - `targetType = 'persona_draft_review'`
   - `targetId = draftReviewId`
2. the journal payload includes:
   - `sourceTurnId`
   - `providerSendArtifactId`
   - `provider`
   - `model`
   - `policyKey`
   - `requestHash`
   - `sentAt`
3. failed sends still do **not** append a journal entry

Extend `tests/unit/main/searchService.test.ts` to seed a send journal entry and expect a result like:

```ts
expect(results).toContainEqual(expect.objectContaining({
  decisionType: 'send_approved_persona_draft_to_provider',
  targetType: 'persona_draft_review',
  replaySummary: 'Approved draft sent to provider · Persona draft review · turn-1 · siliconflow'
}))
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/searchService.test.ts
```

Expected: FAIL because successful sends do not journal yet and `journalService` does not know how to format the new decision type.

**Step 3: Write minimal implementation**

Update `src/main/services/approvedDraftProviderSendService.ts` so that on successful send it appends:

```ts
appendDecisionJournal(db, {
  decisionType: 'send_approved_persona_draft_to_provider',
  targetType: 'persona_draft_review',
  targetId: draftReviewId,
  operationPayload: {
    draftReviewId,
    sourceTurnId,
    providerSendArtifactId: artifactId,
    provider,
    model,
    policyKey,
    requestHash,
    sentAt: createdAt
  },
  undoPayload: {},
  actor: 'local-user'
})
```

Update `src/main/services/journalService.ts` so:

- `formatDecisionLabel(...)` maps the new decision type to `Approved draft sent to provider`
- `formatTargetLabel(...)` for `persona_draft_review` includes:
  - `sourceTurnId`
  - `provider` when present in the payload

Do **not** journal failed sends in this slice.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/searchService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftProviderSendService.ts src/main/services/journalService.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/searchService.test.ts
git commit -m "feat: journal approved draft provider sends"
```

---

### Task 2: Add compact latest-send audit detail to the approved handoff panel

**Files:**
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing test**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. when the latest approved draft provider send has events, the panel renders:
   - `Latest send audit`
   - one line per event type with timestamp
2. request / response payloads are viewable in a compact detail section

Example UI expectations:

```ts
expect(await screen.findByText('Latest send audit')).toBeInTheDocument()
expect(screen.getByText('request · 2026-03-16T08:00:00.000Z')).toBeInTheDocument()
expect(screen.getByText('response · 2026-03-16T08:00:01.000Z')).toBeInTheDocument()
expect(screen.getByText(/approved_persona_draft_handoff_artifact/)).toBeInTheDocument()
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the panel only shows high-level provider/model/status text.

**Step 3: Write minimal implementation**

Update `ApprovedPersonaDraftHandoffPanel.tsx` to render, when `latestProviderSend` exists:

- a `Latest send audit` heading
- a compact list of the latest send events:
  - `${eventType} · ${createdAt}`
- a small payload inspector using `<details>` + `<pre>` for each event payload

Keep the UI narrow:

- no pagination
- no event selection state
- no standalone page
- only latest send detail in this slice

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add approved draft send audit detail"
```

---

### Task 3: Verify replayed approved turns keep send history and audit detail visible

**Files:**
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx` only if a shared fixture/helper is cleaner

**Step 1: Write the failing test**

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to cover:

1. a replayed saved session containing an approved sandbox turn
2. `getPersonaDraftReviewByTurn(...)` returning an approved review
3. `listApprovedPersonaDraftProviderSends(...)` returning one successful send with request/response events
4. the replayed turn shows:
   - `Approved Draft Handoff`
   - `Provider Boundary Send`
   - `response recorded`
   - `Latest send audit`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because replay coverage does not assert the new send detail yet.

**Step 3: Write minimal implementation**

If the replayed turn already renders the handoff/send state correctly, keep production code unchanged and only lock it in with regression coverage.

If a replay-specific gap appears, fix the smallest possible issue in:

- `src/renderer/pages/MemoryWorkspacePage.tsx`
- or `src/renderer/components/MemoryWorkspaceView.tsx`

Do **not** create a separate replay-only implementation path.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/components/MemoryWorkspaceView.tsx
git commit -m "test: cover replayed approved draft sends"
```

---

### Task 4: Verify send journal entries surface through decision-history UI and search

**Files:**
- Modify: `tests/unit/renderer/searchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`
- Reference: `src/renderer/pages/SearchPage.tsx`
- Reference: `src/renderer/pages/ReviewQueuePage.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/searchPage.test.tsx` to cover:

1. `searchDecisionJournal` returns a send journal hit
2. `SearchPage` renders the send replay summary

Extend `tests/unit/renderer/reviewQueuePage.test.tsx` to cover:

1. `listDecisionJournal` returns a send journal entry
2. selecting replay detail shows:
   - `Approved draft sent to provider`
   - the source turn/provider information from `operationPayload`

Example seeded replay summary:

```ts
'Approved draft sent to provider · Persona draft review · turn-sandbox-reviewed · siliconflow'
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: FAIL because the new send replay summary is not yet part of the seeded expectations.

**Step 3: Write minimal implementation**

If the generic pages already render the new journal data correctly, keep production code untouched and update only the tests.

If a small display polish is needed, make the narrowest change in:

- `src/renderer/pages/SearchPage.tsx`
- or `src/renderer/pages/ReviewQueuePage.tsx`

Do **not** add a persona-send-specific page in this slice.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx src/renderer/pages/SearchPage.tsx src/renderer/pages/ReviewQueuePage.tsx
git commit -m "test: surface approved draft send replay history"
```

---

### Task 5: Add focused end-to-end coverage for the replay/audit closure

**Files:**
- Modify: `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`
- Create: `tests/e2e/search-approved-draft-send-history.spec.ts` if the search flow is stable enough

**Step 1: Write the failing test**

Preferred baseline:

1. extend `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`
2. after clicking `Send approved draft`, also verify:
   - `Latest send audit`
   - request / response event rows are visible

Optional second e2e if stable and cheap:

1. open `Search`
2. search a keyword tied to the send journal entry
3. confirm the decision-history result includes the send replay summary

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: FAIL because the new audit detail strings are not rendered yet.

**Step 3: Write minimal implementation**

Keep fixture mode deterministic and reuse:

- `FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE=1`

Only add the smallest UI text needed for stable assertions.

**Step 4: Run the focused verification**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts tests/e2e/search-approved-draft-send-history.spec.ts
git commit -m "test: add approved draft send replay audit coverage"
```

---

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- all focused unit suites PASS
- the approved draft export flow still PASSes
- the approved draft provider-send flow PASSes with the new audit detail
- successful provider sends are now searchable and replayable through decision history

## Notes for the Implementer

- Keep detailed request / response / error payloads in provider-boundary tables; do not duplicate large payloads into `decision_journal`.
- Be careful with event ordering in the compact audit detail so request stays before response/error.
- If a generic page already renders the new journal data correctly, prefer test-only changes over unnecessary product code edits.
- Resist creating a new standalone audit page in this slice.
