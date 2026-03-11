# Phase 6B2 Conflict Groups + Continuous Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add field-level conflict groups to `Review Workbench` and keep continuous-review context within the selected group after approve/reject actions.

**Architecture:** Extend the review workbench read model with group summaries keyed by person + item type + field key, expose them over review IPC/API, and render a new conflict-group sidebar that filters workbench items and preserves group context across refreshes.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, Playwright, existing review workbench stack

---

## Assumptions

- Phase 6B1 people-centric inbox is committed and verified.
- This slice does not add new write-path semantics.
- Grouping is read-model only: `canonicalPersonId + itemType + fieldKey`.
- Continuous review means “stay in the selected group after actions,” not keyboard shortcuts or batch approval.

## Execution Prerequisites

- Use `@superpowers:test-driven-development` before each change.
- Use `@superpowers:verification-before-completion` before claiming the slice is done.
- Keep the scope limited to read models, IPC/API, renderer, docs, and tests.

## Target Repository Changes

```text
src/main/ipc/reviewIpc.ts
src/main/services/reviewWorkbenchReadService.ts
src/preload/index.ts
src/renderer/archiveApi.ts
src/renderer/components/ReviewConflictGroupSidebar.tsx
src/renderer/pages/ReviewWorkbenchPage.tsx
src/shared/archiveContracts.ts
src/shared/ipcSchemas.ts
tests/unit/main/reviewWorkbenchReadService.test.ts
tests/unit/renderer/reviewWorkbenchActions.test.tsx
tests/unit/renderer/reviewWorkbenchPage.test.tsx
README.md
```

### Task 1: Add Conflict Group Read Model and Contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/reviewWorkbenchReadService.ts`
- Test: `tests/unit/main/reviewWorkbenchReadService.test.ts`

**Step 1: Write the failing test**

Add a test that seeds one person with two pending `school_name` items containing different values and another pending `birth_date` item, then asserts:

- one group per `itemType + fieldKey`
- the `school_name` group has `pendingCount = 2`
- `distinctValues` contains both values
- `hasConflict = true` when values diverge
- `nextQueueItemId` resolves to the earliest queue item in that group

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`
Expected: FAIL because `ReviewConflictGroupSummary` / `listReviewConflictGroups()` do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `ReviewConflictGroupSummary`
- `listReviewConflictGroups(db)`
- deterministic sorting: `hasConflict desc`, then `pendingCount desc`, then `fieldKey asc`, then `groupKey asc`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`
Expected: PASS

### Task 2: Expose Conflict Groups Through IPC/API

**Files:**
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/reviewIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`

**Step 1: Write the failing renderer test**

Extend the workbench page test to stub `listReviewConflictGroups()` and assert the page loads conflict groups on mount.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: FAIL because the API is not wired.

**Step 3: Write minimal implementation**

Expose `archive:listReviewConflictGroups` end to end.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: PASS

### Task 3: Render Conflict Groups and Preserve Group Context

**Files:**
- Create: `src/renderer/components/ReviewConflictGroupSidebar.tsx`
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Test: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`
- Test: `tests/unit/renderer/reviewWorkbenchActions.test.tsx`

**Step 1: Write the failing tests**

Add renderer tests that:

- render one person with two groups
- click a group and verify only that group’s items remain visible
- after `Approve`, verify the page stays within the selected group if another group item remains
- if the selected group becomes empty, verify the page falls back to the selected person’s remaining items

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx`
Expected: FAIL because no group sidebar or group-context retention exists.

**Step 3: Write minimal implementation**

Implement:

- `ReviewConflictGroupSidebar`
- selected-group state in `ReviewWorkbenchPage`
- item filtering by selected person + selected group
- refresh fallback order: same group → same person → global pending

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx`
Expected: PASS

### Task 4: Update README and Verify Slice

**Files:**
- Modify: `README.md`

**Step 1: Update docs**

Add a short `Phase 6B2 Conflict Groups` note and mention that group-scoped continuous review is now the first continuous-review baseline.

**Step 2: Run verification**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run build
npx playwright test tests/e2e/review-workbench-single-item-flow.spec.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add README.md docs/plans/2026-03-12-phase-six-b2-conflict-groups-continuous-review-design.md docs/plans/2026-03-12-phase-six-b2-conflict-groups-continuous-review-implementation-plan.md src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/ipc/reviewIpc.ts src/main/services/reviewWorkbenchReadService.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/components/ReviewConflictGroupSidebar.tsx src/renderer/pages/ReviewWorkbenchPage.tsx tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
git commit -m "feat: add review conflict groups"
```
