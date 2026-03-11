# Phase 6B1 People-Centric Inbox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first people-centric review inbox so operators can select a person and review that person's pending items in the existing review workbench.

**Architecture:** Extend the current review workbench read model with a grouped people-inbox summary, expose it over review IPC/API, and render a new inbox sidebar in `ReviewWorkbenchPage`. Keep all existing approve/reject/undo write paths unchanged.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, existing review workbench stack

---

## Assumptions

- Phase 6A2 provider boundary baseline is committed and verified.
- We stay in the current isolated worktree.
- This slice is `6B1`, not `6B2` or `6B3`: no batch decisions, no conflict-group detail view, no keyboard flow.
- The workbench still reads pending items from `review_queue` and reuses current evidence / impact preview services.

## Execution Prerequisites

- Use `@superpowers:test-driven-development` before each implementation step.
- Use `@superpowers:verification-before-completion` before claiming the slice is complete.
- Keep changes limited to read model, IPC/API contracts, and renderer workbench UI.

## Target Repository Changes

```text
src/main/ipc/reviewIpc.ts
src/main/services/reviewWorkbenchReadService.ts
src/preload/index.ts
src/renderer/archiveApi.ts
src/renderer/components/ReviewInboxSidebar.tsx
src/renderer/pages/ReviewWorkbenchPage.tsx
src/shared/archiveContracts.ts
tests/unit/main/reviewWorkbenchReadService.test.ts
tests/unit/renderer/reviewWorkbenchPage.test.tsx
README.md
```

### Task 1: Add People Inbox Read Model and Contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/reviewWorkbenchReadService.ts`
- Test: `tests/unit/main/reviewWorkbenchReadService.test.ts`

**Step 1: Write the failing test**

Add a test that seeds two pending workbench items for one canonical person and one pending item for another person, then asserts:

- one summary row per person
- `pendingCount` is grouped correctly
- `fieldKeys` are deduplicated
- `conflictCount` reflects only conflicting items
- `hasContinuousSequence` is `true` when a person has 2+ pending items
- `nextQueueItemId` picks the earliest pending queue item for that person

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`
Expected: FAIL because `listReviewInboxPeople()` and its contract do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `ReviewInboxPersonSummary` contract
- `listReviewInboxPeople(db)` in `reviewWorkbenchReadService.ts`
- deterministic sort order: `pendingCount desc`, then `canonicalPersonName asc`, then `nextQueueItemId asc`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/main/services/reviewWorkbenchReadService.ts tests/unit/main/reviewWorkbenchReadService.test.ts
git commit -m "feat: add people-centric review inbox read model"
```

### Task 2: Expose People Inbox Over Review IPC/API

**Files:**
- Modify: `src/main/ipc/reviewIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Test: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

Extend the renderer page test to stub `listReviewInboxPeople()` and assert the page requests inbox summaries on mount.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: FAIL because `archiveApi.listReviewInboxPeople` is not wired.

**Step 3: Write minimal implementation**

Expose `archive:listReviewInboxPeople` through IPC, preload, and renderer fallback API.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: PASS for the new API expectation.

**Step 5: Commit**

```bash
git add src/main/ipc/reviewIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx
git commit -m "feat: expose people-centric review inbox api"
```

### Task 3: Render the People Inbox in Review Workbench

**Files:**
- Create: `src/renderer/components/ReviewInboxSidebar.tsx`
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Test: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

Add a renderer test that:

- provides two inbox people summaries and two workbench items from different people
- verifies the `People Inbox` heading and grouped counts render
- clicks one person and verifies only that person's workbench item remains visible
- verifies detail reloads for the selected person's first pending queue item

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: FAIL because no inbox UI/filtering exists.

**Step 3: Write minimal implementation**

Implement:

- `ReviewInboxSidebar`
- selected person state in `ReviewWorkbenchPage`
- filtered sidebar items by selected person
- queue-item fallback logic when current selection is outside the chosen person context

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ReviewInboxSidebar.tsx src/renderer/pages/ReviewWorkbenchPage.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx
git commit -m "feat: add people-centric review workbench inbox"
```

### Task 4: Update README and Verify the Slice

**Files:**
- Modify: `README.md`

**Step 1: Update docs**

Add a short `Phase 6B1 People-Centric Inbox` note under the current operational section or phase roadmap summary.

**Step 2: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx
npm run build
```

Expected: PASS

**Step 3: Optionally run broader regression**

Run:

```bash
npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: note people-centric review inbox baseline"
```
