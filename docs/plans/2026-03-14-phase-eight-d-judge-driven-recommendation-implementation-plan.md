# Phase 8D Judge-Driven Recommendation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let `Memory Workspace` compare sessions promote a judge-backed winner to the recommended result only when the judge evidence is complete, clearly safer, and more specific than the deterministic baseline.

**Architecture:** Keep the deterministic rubric as the default ranking path, then add a narrow post-ranking policy that can replace the recommendation with a `judge-assisted` winner when all completed runs have completed judge verdicts, exactly one run is clearly strongest under judge outcomes, and that winner is still grounded and non-failed. Extend shared compare recommendation contracts so both persistence consumers and renderer UI can show whether the recommendation came from the deterministic rubric or a conservative judge-assisted override.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite-backed compare services, Vitest, Playwright.

---

## Policy Decisions

- `judge-driven recommendation v1` **does include**:
  - explicit recommendation source metadata on compare sessions
  - conservative judge-assisted override of the deterministic winner
  - rationale text that explains why judge override happened or why deterministic remained primary
  - renderer labeling for deterministic vs judge-assisted recommendation source
  - focused unit and e2e coverage for recommendation switching boundaries

- `judge-driven recommendation v1` **does not include**:
  - user-configurable recommendation strategy toggles
  - partial-judge or best-effort override when some verdicts are skipped/failed
  - tournament ranking across more than one judge policy
  - separate persistence tables beyond the existing compare session snapshot

- `judge-assisted override` should only happen when all of the following are true:
  1. at least one provider/model candidate completed successfully
  2. every completed run has a `judge.status === 'completed'`
  3. exactly one completed run has the best judge bucket and score
  4. the judge winner has `decision === 'aligned'`
  5. the deterministic winner is not already that same run
  6. the judge winner still has a non-`failed` deterministic evaluation band

- Otherwise, keep the deterministic recommendation.

### Task 1: Extend recommendation contracts for source metadata

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`

**Step 1: Write the failing tests**

Add contract coverage for:

- `MemoryWorkspaceCompareRecommendation['source']`
- supported source values `deterministic` and `judge_assisted`
- optional recommendation metadata needed by renderer labels

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because compare recommendation contracts do not expose recommendation source metadata yet.

**Step 3: Write minimal implementation**

Add recommendation source fields to the shared compare recommendation shape without changing existing call signatures.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

---

### Task 2: Add judge-assisted recommendation policy in compare service

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. deterministic recommendation stays primary when judge is incomplete, failed, skipped, tied, or picks a non-`aligned` run
2. judge-assisted recommendation replaces the deterministic winner when a single provider/model run is clearly `aligned` and judge-complete across all runs
3. judge-assisted rationale explains why the winner replaced the baseline
4. persisted session reload keeps the same recommendation source and winner

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because recommendation building is deterministic-only.

**Step 3: Write minimal implementation**

Implement:

- deterministic ordering helper reuse as the fallback baseline
- judge ranking bucket helper (`aligned` > `needs_review` > `not_grounded`)
- conservative override gate that requires full judge completion and a unique, safe judge winner
- recommendation source + rationale generation for deterministic vs judge-assisted outcomes

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

---

### Task 3: Surface recommendation source in compare UI

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. recommended result panel shows recommendation source label
2. judge-assisted recommendation shows distinct copy from deterministic recommendation
3. existing deterministic recommendation copy still renders for old/default path

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare UI does not distinguish recommendation source.

**Step 3: Write minimal implementation**

Render concise recommendation-source text in the panel, keeping labels stable for tests and visible to matrix/replay users.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Update docs and extend end-to-end coverage

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Modify: `tests/e2e/memory-workspace-compare-flow.spec.ts`

**Step 1: Write the failing e2e assertion**

Extend the compare flow to assert:

1. recommendation source copy is rendered
2. judge-assisted wording appears in the fixture path when judge winner differs from deterministic baseline

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: FAIL because the current compare panel does not show source-specific wording.

**Step 3: Write minimal implementation refinements**

- update the phase 8 design doc to mark conservative judge-assisted replacement implemented
- stabilize visible labels/selectors for compare recommendation source

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts tests/e2e/memory-workspace-compare-matrix-flow.spec.ts
```

Expected: PASS
