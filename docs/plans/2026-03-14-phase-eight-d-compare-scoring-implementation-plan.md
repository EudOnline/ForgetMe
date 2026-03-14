# Phase 8D Compare Scoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic scoring and recommendation layer on top of `Memory Workspace` compare sessions so compare runs become rankable, explainable, and reviewable without introducing a second remote judge model yet.

**Architecture:** Reuse the existing compare-session persistence and compute a stable rubric for each compare run from the saved response snapshot: guardrail decision, citations, source breadth, and whether the answer text preserves the required fallback/boundary language. Derive a session-level recommendation from those run evaluations, return it from the compare service, and render it in the `Memory Workspace` compare UI.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Playwright, existing compare runner and grounded guardrail contracts.

---

## Scope Decisions

- `compare scoring baseline` **does include**:
  - run-level rubric scores
  - session-level recommended run
  - deterministic recommendation rationale
  - renderer display for scores and winner
  - fixture-backed e2e coverage

- `compare scoring baseline` **does not include yet**:
  - remote judge model
  - pairwise debate / pairwise ranking
  - custom rubric editing in UI
  - score history across many compare sessions

### Task 1: Add compare scoring contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`

**Step 1: Write the failing tests**

Add contract coverage for:

- `MemoryWorkspaceCompareEvaluationDimension`
- `MemoryWorkspaceCompareRunEvaluation`
- `MemoryWorkspaceCompareRecommendation`
- `MemoryWorkspaceCompareRunRecord['evaluation']`
- `MemoryWorkspaceCompareSessionSummary['recommendation']`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because compare scoring contracts do not exist yet.

**Step 3: Write minimal implementation**

Add the new compare scoring types and wire them into run/session contracts.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

---

### Task 2: Implement deterministic compare scoring and recommendation

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. completed compare runs receive stable rubric evaluations
2. conflict / insufficient-evidence fallbacks are not treated as failures, but are scored lower than strong grounded answers
3. failed compare runs receive a failed evaluation band
4. compare sessions return a session-level recommendation
5. equal-score ties fall back to the safer deterministic baseline target

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because runs do not yet expose evaluations or recommendations.

**Step 3: Write minimal implementation**

Implement:

- rubric dimensions:
  - groundedness
  - traceability
  - guardrail alignment
  - usefulness
- total score + score band
- summary-text heuristics that verify fallback language is preserved
- session-level winner selection + rationale

Keep the scoring deterministic and local-only.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

---

### Task 3: Render scorecards and recommended result

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. compare results show total scores and score bands
2. each compare run shows rubric dimension rows
3. the compare panel shows a recommended result with rationale

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the compare UI does not yet render scoring metadata.

**Step 3: Write minimal implementation**

Render:

- total score
- score band
- dimension breakdown
- session-level recommended target and rationale

Keep the layout compact and consistent with the existing compare panel.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Document the baseline and extend e2e

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Modify: `tests/e2e/memory-workspace-compare-flow.spec.ts`

**Step 1: Write the failing e2e assertion**

Extend the compare flow to assert:

1. a recommended compare result is rendered
2. run score labels are visible

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: FAIL because the compare UI does not yet show scoring metadata.

**Step 3: Write minimal implementation refinements**

- document the deterministic scoring boundary
- stabilize compare score labels for UI testing

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: PASS
