# Phase 6B3 Safe Batch Approval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first safe group-level batch approval flow with decision-batch journaling and batch undo, while keeping existing single-item review semantics intact.

**Architecture:** Introduce a minimal `decision_batches` + `decision_batch_items` write model in the main process, expose batch approve / undo APIs through IPC, and add a confirmation-based batch action in `Review Workbench` plus batch-aware undo history rendering.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, Playwright, existing review queue / workbench services

---

## Assumptions

- `6B2` compare/navigation is already committed and verified.
- First `6B3` slice is limited to safe batch approval for the currently selected group only.
- Safe batch rule is hard-enforced by the backend: `>= 2 pending + no conflict + same group + item type = profile_attribute_candidate`.
- Batch reject, cross-group batching, and standalone replay pages are out of scope.

## Target Repository Changes

```text
src/main/db.ts
src/main/services/reviewQueueService.ts
src/main/ipc/reviewIpc.ts
src/preload/index.ts
src/shared/archiveContracts.ts
src/renderer/pages/ReviewWorkbenchPage.tsx
src/renderer/pages/ReviewQueuePage.tsx
src/renderer/components/UndoHistoryTable.tsx
tests/unit/main/*.test.ts
tests/unit/renderer/*.test.tsx
tests/e2e/review-workbench-single-item-flow.spec.ts
README.md
```

### Task 1: Add failing contract and service tests for decision batches

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseFiveContracts.test.ts` or create a phase-six contract test beside existing phase-six tests
- Modify: `tests/unit/main/reviewQueueService.test.ts`
- Modify: `tests/unit/main/reviewWorkbenchReadService.test.ts` if safe-batch eligibility is surfaced in read models

**Step 1: Write the failing tests**

Add tests that cover:

- parsing / typing of a decision-batch summary record
- `approveSafeReviewGroup(...)` rejects conflict groups, structured-field groups, and single-item groups
- `approveSafeReviewGroup(...)` creates a decision batch and linked member rows for a valid safe group
- `undoDecision(...)` can undo a batch journal via existing single-item undo semantics

**Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewQueueService.test.ts tests/unit/shared/phaseSixContracts.test.ts
```

Expected: FAIL because batch contracts and write-path logic do not exist yet.

### Task 2: Add DB schema and main-process batch services

**Files:**
- Modify: `src/main/db.ts`
- Modify: `src/main/services/reviewQueueService.ts`
- Modify any adjacent service/helper files that contain reusable approve / undo internals

**Step 1: Write minimal implementation**

Implement:

- schema for `decision_batches` and `decision_batch_items`
- batch-safe eligibility revalidation in main process
- `approveSafeReviewGroup({ groupKey, actor })`
- extend `undoDecision(journalId)` so batch journals reuse the existing undo path
- batch summary return shape for UI rendering

**Step 2: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewQueueService.test.ts tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/shared/phaseSixContracts.test.ts
```

Expected: PASS

### Task 3: Expose batch APIs through IPC and preload

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/ipc/reviewIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: renderer / contract tests that verify API availability

**Step 1: Write failing API tests**

Add tests for:

- fallback API contains the batch approve method
- preload / IPC wiring exposes the new method

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the methods are not exposed yet.

**Step 3: Implement minimal API wiring**

Add:

- `approveSafeReviewGroup(input)`

**Step 4: Re-run tests**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

### Task 4: Add renderer tests for safe-batch entry and confirmation flow

**Files:**
- Modify: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`
- Modify: `tests/unit/renderer/reviewWorkbenchActions.test.tsx` if action-refresh behavior needs regression coverage

**Step 1: Write failing tests**

Add assertions that:

- safe profile-attribute current group shows `Batch Approve`
- structured-field or conflict group does not show it
- clicking the button shows a confirmation summary with item count / field / batch journal note
- confirming calls the batch approve API and refreshes the current group context
- undo history displays a batch record and can trigger the existing undo entry point

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
```

Expected: FAIL because batch UI and batch-aware undo rendering do not exist yet.

### Task 5: Implement renderer batch flow

**Files:**
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Modify: `src/renderer/pages/ReviewQueuePage.tsx`
- Modify: `src/renderer/components/UndoHistoryTable.tsx`
- Create small batch-specific helper component only if needed

**Step 1: Write minimal implementation**

Implement:

- safe-batch visibility derived from current selected group + backend-reported or renderer-safe summary
- confirmation-state UI for `Batch Approve`
- batch approve action + refresh behavior
- batch-aware undo history row rendering and `Undo Batch` through the existing `undoDecision(journalId)` path

**Step 2: Run targeted renderer tests**

Run:

```bash
npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
```

Expected: PASS

### Task 6: Add end-to-end coverage and update docs

**Files:**
- Modify: `tests/e2e/review-workbench-single-item-flow.spec.ts`
- Modify: `README.md`

**Step 1: Add / update e2e flow**

Cover:

- entering a safe group
- batch approving the group
- seeing a batch journal entry
- undoing the batch
- confirming items return to pending review

**Step 2: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewQueueService.test.ts tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
npx playwright test tests/e2e/review-workbench-single-item-flow.spec.ts
npm run build
```

Expected: PASS

### Task 7: Full verification and commit

**Step 1: Run full verification**

Run:

```bash
npm run test:unit
npm run build
```

Expected: PASS

**Step 2: Commit**

```bash
git add README.md docs/plans/2026-03-12-phase-six-b3-safe-batch-approval-design.md docs/plans/2026-03-12-phase-six-b3-safe-batch-approval-implementation-plan.md src/main/db.ts src/main/ipc/reviewIpc.ts src/main/services/reviewQueueService.ts src/preload/index.ts src/shared/archiveContracts.ts src/renderer/pages/ReviewWorkbenchPage.tsx src/renderer/pages/ReviewQueuePage.tsx src/renderer/components/UndoHistoryTable.tsx tests/unit/main tests/unit/renderer tests/e2e/review-workbench-single-item-flow.spec.ts

git commit -m "feat: add safe batch review approval"
```
