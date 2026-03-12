# Phase 6B2 Conflict Compare + Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a conflict-group compare panel and lightweight continuous navigation controls to `Review Workbench` without changing existing write-path semantics.

**Architecture:** Reuse the current people-inbox + conflict-group filtered `visibleItems` on the renderer side to derive compare summaries and navigation state. Add one compare component, one navigation component, and page-level keyboard handling.

**Tech Stack:** Electron, React, TypeScript, Vitest, existing review workbench renderer stack

---

## Assumptions

- Phase 6B2 conflict groups baseline is committed and verified.
- Compare summaries can be derived from `visibleItems`; no new DB schema or IPC contract is needed.
- Keyboard navigation is limited to current visible scope only.

## Target Repository Changes

```text
src/renderer/components/ReviewConflictCompareCard.tsx
src/renderer/components/ReviewContinuousNavigationBar.tsx
src/renderer/pages/ReviewWorkbenchPage.tsx
tests/unit/renderer/reviewWorkbenchPage.test.tsx
README.md
```

### Task 1: Add Compare Panel and Navigation Tests

**Files:**
- Test: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`

**Step 1: Write the failing tests**

Add assertions that:

- selecting a conflict group renders `Conflict Compare`
- the panel shows both distinct values and their counts
- clicking `Next` / `Previous` changes the selected item
- pressing `j` / `k` changes the selected item within the current scope

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: FAIL because compare panel and navigation controls do not exist.

### Task 2: Add Compare and Navigation Components

**Files:**
- Create: `src/renderer/components/ReviewConflictCompareCard.tsx`
- Create: `src/renderer/components/ReviewContinuousNavigationBar.tsx`
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`

**Step 1: Write minimal implementation**

Implement:

- compare summary derived from current group + visible items
- prev / next buttons derived from `visibleItems`
- `j` / `k` and arrow-key navigation via `window` keydown handler

**Step 2: Run targeted tests**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`
Expected: PASS

### Task 3: Update README and Verify Slice

**Files:**
- Modify: `README.md`

**Step 1: Update docs**

Add a short note that conflict-group compare and keyboard navigation now exist within 6B2.

**Step 2: Run verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run build
npx playwright test tests/e2e/review-workbench-single-item-flow.spec.ts
npm run test:unit
```

Expected: PASS

**Step 3: Commit**

```bash
git add README.md docs/plans/2026-03-12-phase-six-b2-conflict-compare-navigation-design.md docs/plans/2026-03-12-phase-six-b2-conflict-compare-navigation-implementation-plan.md src/renderer/components/ReviewConflictCompareCard.tsx src/renderer/components/ReviewContinuousNavigationBar.tsx src/renderer/pages/ReviewWorkbenchPage.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx
git commit -m "feat: add review compare navigation"
```
