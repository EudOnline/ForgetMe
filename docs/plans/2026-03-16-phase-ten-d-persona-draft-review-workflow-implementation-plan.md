# Phase 10D Persona Draft Review Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight internal review workflow for `Memory Workspace` sandbox drafts so operators can edit, mark in review, approve, and reject a reviewed persona draft without mutating the original sandbox turn.

**Architecture:** Keep `Phase 10C` sandbox generation unchanged, but introduce a separate `persona_draft_reviews` persistence model keyed by `sourceTurnId`. Expose dedicated IPC actions for create / read / update / transition, render a `Draft Review` panel inside `Memory Workspace`, and record state transitions in `decision_journal` while leaving original turn `response_json` immutable.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, Better SQLite3, Vitest, Playwright, existing `Memory Workspace` and `decision_journal` services.

---

## Scope Decisions

- `Phase 10D persona draft review workflow` **does include**:
  - a new `persona_draft_reviews` table
  - shared contracts for persona draft review records and status transitions
  - create / read / update / transition services for sandbox-linked reviews
  - a `Draft Review` panel inside `Memory Workspace`
  - journal-backed `in_review`, `approved`, and `rejected` transitions

- `Phase 10D persona draft review workflow` **does not include**:
  - a normal open-ended persona ask mode
  - copy / export / send actions for approved drafts
  - review queue or safe batch integration
  - undo support for persona draft review decisions
  - OCR / doc evidence support beyond the existing chat-first sandbox evidence layer

- `Phase 10D` policy rules:
  1. original sandbox turn responses remain immutable source records
  2. persona draft reviews only attach to turns whose `workflowKind === 'persona_draft_sandbox'`
  3. review transitions must be explicit and journaled
  4. `approved` and `rejected` reviews are read-only in the baseline UI

---

### Task 1: Add persona draft review contracts and persistence schema

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Create: `src/main/services/migrations/015_memory_workspace_persona_draft_reviews.sql`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspacePersonaDraftReviewStatus = 'draft' | 'in_review' | 'approved' | 'rejected'`
- `MemoryWorkspacePersonaDraftReviewRecord`
- `getPersonaDraftReviewByTurn`, `createPersonaDraftReviewFromTurn`, `updatePersonaDraftReview`, `transitionPersonaDraftReview` IPC payload shapes

Example test shape:

```ts
const review: MemoryWorkspacePersonaDraftReviewRecord = {
  draftReviewId: 'review-1',
  sourceTurnId: 'turn-1',
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  workflowKind: 'persona_draft_sandbox',
  status: 'draft',
  baseDraft: '可审阅草稿：先把关键记录整理进归档。',
  editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
  reviewNotes: 'Tone is grounded, but needs a clearer closing line.',
  supportingExcerpts: ['ce-1', 'ce-3'],
  trace: [
    {
      traceId: 'trace-1',
      excerptIds: ['ce-1'],
      explanation: 'Opening sentence is grounded in excerpt ce-1.'
    }
  ],
  approvedJournalId: null,
  rejectedJournalId: null,
  createdAt: '2026-03-16T01:00:00.000Z',
  updatedAt: '2026-03-16T01:05:00.000Z'
}

expect(review.status).toBe('draft')
expect(review.workflowKind).toBe('persona_draft_sandbox')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because shared contracts do not yet expose persona draft review records or input schemas.

**Step 3: Write minimal implementation**

Add:

- `MemoryWorkspacePersonaDraftReviewStatus`
- `MemoryWorkspacePersonaDraftReviewRecord`
- input types for:
  - `getPersonaDraftReviewByTurn`
  - `createPersonaDraftReviewFromTurn`
  - `updatePersonaDraftReview`
  - `transitionPersonaDraftReview`

Create migration `015_memory_workspace_persona_draft_reviews.sql` with:

- `id`
- `source_turn_id` unique
- `scope_kind`
- `scope_target_id`
- `workflow_kind`
- `status`
- `base_draft`
- `edited_draft`
- `review_notes`
- `supporting_excerpts_json`
- `trace_json`
- `approved_journal_id`
- `rejected_journal_id`
- `created_at`
- `updated_at`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseEightContracts.test.ts src/main/services/migrations/015_memory_workspace_persona_draft_reviews.sql
git commit -m "feat: add persona draft review contracts"
```

---

### Task 2: Implement persona draft review service and journal-backed transitions

**Files:**
- Create: `src/main/services/memoryWorkspaceDraftReviewService.ts`
- Modify: `src/main/services/journalService.ts`
- Modify: `tests/unit/main/helpers/memoryWorkspaceScenario.ts`
- Create: `tests/unit/main/memoryWorkspaceDraftReviewService.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. `createPersonaDraftReviewFromTurn(turnId)` creates a review from a sandbox turn and copies draft + trace metadata
2. creating a review from a non-sandbox turn returns `null`
3. `updatePersonaDraftReview(...)` updates `editedDraft`, `reviewNotes`, and `updatedAt`
4. `transitionPersonaDraftReview(..., 'in_review')` journals `mark_persona_draft_in_review`
5. `transitionPersonaDraftReview(..., 'approved')` journals `approve_persona_draft_review`
6. `transitionPersonaDraftReview(..., 'rejected')` journals `reject_persona_draft_review`
7. illegal transitions are rejected, for example `approved -> draft`

Example test shape:

```ts
const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurnId })

expect(review?.status).toBe('draft')
expect(review?.editedDraft).toContain('归档')

const updated = updatePersonaDraftReview(db, {
  draftReviewId: review!.draftReviewId,
  editedDraft: '可审阅草稿：先整理归档，再继续补齐细节。',
  reviewNotes: 'Sharper and easier to reuse.'
})

expect(updated?.reviewNotes).toContain('Sharper')

const approved = transitionPersonaDraftReview(db, {
  draftReviewId: review!.draftReviewId,
  status: 'approved'
})

expect(approved?.status).toBe('approved')
expect(approved?.approvedJournalId).not.toBeNull()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceDraftReviewService.test.ts
```

Expected: FAIL because the persona draft review service does not exist yet.

**Step 3: Write minimal implementation**

Implement `memoryWorkspaceDraftReviewService.ts` with:

- `getPersonaDraftReviewByTurn(db, { turnId })`
- `createPersonaDraftReviewFromTurn(db, { turnId })`
- `updatePersonaDraftReview(db, { draftReviewId, editedDraft, reviewNotes })`
- `transitionPersonaDraftReview(db, { draftReviewId, status })`

Service rules:

- only sandbox turns with `response.personaDraft` can create a review
- only one review may exist per `sourceTurnId`
- `editedDraft` starts from `baseDraft`
- `draft` and `in_review` may be edited
- `approved` and `rejected` are read-only
- only explicit status transitions write journal entries

Update `journalService.ts` formatting helpers so new decision types render readable labels in `Decision Journal`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceDraftReviewService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceDraftReviewService.ts src/main/services/journalService.ts tests/unit/main/helpers/memoryWorkspaceScenario.ts tests/unit/main/memoryWorkspaceDraftReviewService.test.ts
git commit -m "feat: add persona draft review service"
```

---

### Task 3: Wire IPC, preload, and renderer API bindings

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Cover:

1. `archiveApi` exposes:
   - `getPersonaDraftReviewByTurn`
   - `createPersonaDraftReviewFromTurn`
   - `updatePersonaDraftReview`
   - `transitionPersonaDraftReview`
2. fallback archive API stubs return `null` or safe no-op objects for these methods

Example test shape:

```ts
expect(typeof api.getPersonaDraftReviewByTurn).toBe('function')
expect(typeof api.createPersonaDraftReviewFromTurn).toBe('function')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the new persona draft review IPC methods are not yet exposed.

**Step 3: Write minimal implementation**

Add IPC handlers:

- `archive:getPersonaDraftReviewByTurn`
- `archive:createPersonaDraftReviewFromTurn`
- `archive:updatePersonaDraftReview`
- `archive:transitionPersonaDraftReview`

Parse inputs with Zod in `ipcSchemas.ts`, then wire through preload and renderer API.

Keep renderer fallback behavior deterministic:

- `get...` returns `null`
- `create...` returns `null`
- `update...` returns `null`
- `transition...` returns `null`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: wire persona draft review ipc"
```

---

### Task 4: Render the Draft Review panel inside Memory Workspace

**Files:**
- Create: `src/renderer/components/PersonaDraftReviewPanel.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. sandbox turns without a review show `Start draft review`
2. clicking `Start draft review` creates the review and shows editable draft + notes fields
3. `Save draft edits` persists `editedDraft` and `reviewNotes`
4. `Mark in review` changes the status badge to `in review`
5. `Approve draft` changes the status badge to `approved` and disables editing
6. replayed sandbox turns still show the linked review state

Example test shape:

```tsx
expect(screen.getByRole('button', { name: 'Start draft review' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Start draft review' }))
expect(await screen.findByLabelText('Draft review notes')).toBeInTheDocument()
fireEvent.change(screen.getByLabelText('Draft review body'), {
  target: { value: '可审阅草稿：先整理归档，再继续补齐细节。' }
})
fireEvent.click(screen.getByRole('button', { name: 'Mark in review' }))
expect(await screen.findByText('Status: in review')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because `Memory Workspace` does not yet render or manage persona draft reviews.

**Step 3: Write minimal implementation**

Add a small `PersonaDraftReviewPanel` that renders:

- status
- editable body textarea
- notes textarea
- `Save draft edits`
- `Mark in review`
- `Approve draft`
- `Reject draft`

`MemoryWorkspacePage.tsx` should:

- load review state by `turnId` for sandbox turns
- lazily create a review when `Start draft review` is clicked
- keep local optimistic state minimal and always rehydrate from API after mutations
- disable editing when status is `approved` or `rejected`

Do **not**:

- overwrite `response.personaDraft.draft`
- auto-create reviews on page load
- add copy / export buttons

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/PersonaDraftReviewPanel.tsx src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: add persona draft review panel"
```

---

### Task 5: Add end-to-end review coverage and finalize docs

**Files:**
- Create: `tests/e2e/memory-workspace-persona-draft-review-flow.spec.ts`
- Modify: `docs/plans/2026-03-16-phase-ten-d-persona-draft-review-workflow-design.md`

**Step 1: Write the failing e2e assertions**

Cover one full operator journey:

1. open `Reviewed draft sandbox`
2. click `Start draft review`
3. edit the draft body
4. mark it `in review`
5. approve it
6. confirm the panel becomes read-only and shows `approved`

**Step 2: Run tests to verify they fail**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-persona-draft-review-flow.spec.ts
```

Expected: FAIL because the draft review workflow UI does not yet exist.

**Step 3: Write minimal implementation refinements**

Refine only what the e2e needs:

- stable button labels
- stable field labels
- stable status text
- deterministic fixture-safe review flow

Update the design doc if implementation clarifies any final wording decisions.

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceDraftReviewService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-persona-draft-review-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-persona-draft-review-flow.spec.ts docs/plans/2026-03-16-phase-ten-d-persona-draft-review-workflow-design.md
git commit -m "test: add persona draft review workflow coverage"
```

---

Plan complete and saved to `docs/plans/2026-03-16-phase-ten-d-persona-draft-review-workflow-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
