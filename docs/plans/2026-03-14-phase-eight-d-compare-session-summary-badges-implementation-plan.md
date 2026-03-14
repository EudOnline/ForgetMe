# Phase 8D Compare Session Summary Badges Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Saved Compare Sessions` easier to scan by exposing compact compare-session metadata: target composition, judge summary, and failed-run count.

**Architecture:** Extend `MemoryWorkspaceCompareSessionSummary` with a compact renderer-friendly metadata block computed from saved compare runs. Reuse the runs that `listMemoryWorkspaceCompareSessions(...)` already loads for recommendations, so no new persistence schema is needed. Render the new metadata as small text badges beneath each saved compare session button.

**Tech Stack:** TypeScript, React, Vitest, existing compare service/renderer stack.

---

### Task 1: Add failing shared and service tests

**Files:**
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

1. compare session summaries expose metadata for:
   - `targetLabels`
   - `failedRunCount`
   - `judge.enabled`
   - `judge.status`
2. service summaries compute:
   - target labels from saved runs
   - `failedRunCount`
   - `judge.status = mixed` when run-level judge states differ

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because compare summaries do not expose metadata yet.

### Task 2: Implement compare session summary metadata

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`

**Step 1: Write minimal implementation**

Add a summary metadata shape:

- `targetLabels: string[]`
- `failedRunCount: number`
- `judge.enabled: boolean`
- `judge.status: 'disabled' | 'completed' | 'failed' | 'mixed'`

Compute it from compare runs using these rules:

- `targetLabels`: unique labels in ordinal order
- `failedRunCount`: count of compare runs with `status: 'failed'`
- `judge.enabled`: true when any run has a non-skipped or provider/model-backed judge snapshot
- `judge.status`:
  - `disabled` when judge is not enabled
  - `completed` when all enabled runs are `completed`
  - `failed` when all enabled runs are `failed`
  - `mixed` otherwise

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

### Task 3: Add renderer coverage and badges

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing renderer test**

Cover:

1. saved compare sessions render:
   - target labels summary
   - judge summary
   - failed run count when non-zero

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the compare session list only shows title/question today.

**Step 3: Write minimal renderer implementation**

Render compact text badges under each saved compare session button:

- `Targets: ...`
- `Judge: ...`
- `Failed runs: N` only when `N > 0`

### Task 4: Document the behavior

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Update docs**

Clarify that saved compare sessions now expose summary metadata for quick scanning before selection.

### Task 5: Focused verification

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
```

Expected: PASS
