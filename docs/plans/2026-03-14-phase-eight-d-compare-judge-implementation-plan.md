# Phase 8D Compare Judge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional judge-model verdict layer to `Memory Workspace` compare runs so each saved compare result keeps the deterministic rubric as the primary recommendation signal while also surfacing a persisted remote review summary for human inspection.

**Architecture:** Extend compare run contracts and persistence with a compact `judge` snapshot stored per run. Keep the existing deterministic rubric and session recommendation unchanged as the safe primary signal; when judge is enabled, call a dedicated LiteLLM-backed judge prompt after a compare run is assembled, persist the verdict in a dedicated compare-judge table keyed by run id, and render the deterministic rubric and judge verdict side by side in the compare UI. If judge is disabled or fails, record that state explicitly instead of blocking compare completion.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, LiteLLM routing, Vitest, Playwright.

---

## Scope Decisions

- `compare judge v1` **does include**:
  - per-run persisted judge verdict JSON
  - explicit judge states for `completed`, `skipped`, and `failed`
  - LiteLLM-backed judge prompt with fixture fallback for e2e
  - compare UI rendering for deterministic rubric + judge verdict
  - focused unit and e2e coverage

- `compare judge v1` **does not include yet**:
  - judge-driven auto recommendation replacement
  - pairwise debate or tournament ranking
  - configurable judge settings in renderer UI
  - historical judge drift analytics across sessions

### Task 1: Add judge contracts and persistence shape

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Create: `src/main/services/migrations/010_memory_workspace_compare_judge.sql`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspaceCompareJudgeVerdict`
- `MemoryWorkspaceCompareRunRecord['judge']`
- skipped / failed / completed judge states

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because compare run contracts do not expose judge metadata yet.

**Step 3: Write minimal implementation**

Add:

- a compact per-run judge verdict type
- judge verdict field on compare runs
- migration that adds a dedicated persisted judge table keyed by compare run id

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

---

### Task 2: Add compare judge execution and persistence

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. compare runs persist a completed judge verdict when judge is enabled
2. judge failure does not fail the compare run and is saved as `failed`
3. judge-disabled flow is saved as `skipped`
4. deterministic recommendation still prefers the rubric winner even when judge disagrees

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because compare runs do not yet call or persist judge results.

**Step 3: Write minimal implementation**

Implement:

- judge config resolution from environment / fixture mode
- a narrow judge prompt that compares candidate output to the grounded baseline
- JSON parsing for verdict, score, rationale, strengths, and concerns
- persisted judge snapshots for `completed`, `failed`, and `skipped`
- non-blocking judge execution so compare sessions still finish safely

Keep session recommendation deterministic-only for v1.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

---

### Task 3: Render judge verdicts beside scorecards

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. compare runs render judge status and verdict summary
2. completed judge verdicts show score, rationale, strengths, and concerns
3. skipped / failed judge states render clear fallback messaging

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare UI does not yet show judge metadata.

**Step 3: Write minimal implementation**

Render a `Judge Verdict` panel per compare run that sits alongside the deterministic scorecard and clearly separates:

- deterministic rubric result
- judge status
- verdict score / label
- rationale and compact bullets for strengths / concerns

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Document behavior and extend end-to-end verification

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Modify: `tests/e2e/memory-workspace-compare-flow.spec.ts`

**Step 1: Write the failing e2e assertion**

Extend the compare flow to assert:

1. judge verdict UI is rendered for at least one compare run
2. deterministic recommendation remains visible

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: FAIL because compare UI does not yet expose judge details.

**Step 3: Write minimal implementation refinements**

- document the judge-vs-deterministic boundary in the phase 8 design doc
- stabilize labels/selectors for compare judge rendering

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: PASS
