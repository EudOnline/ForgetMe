# Phase 9B Advice Compare & Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend `Memory Workspace` compare and matrix flows so `Advice Mode` can be compared, judged, replayed, and audited with the same grounded guardrails as the new `9A` baseline ask flow.

**Architecture:** Reuse the `expressionMode` contract added in `9A` and thread it into compare session inputs, compare matrix orchestration, and compare persistence. Keep the baseline answer generation deterministic by continuing to call `askMemoryWorkspace(...)` as the source of truth, then let provider compare runs and judge prompts operate against either grounded or advice-shaped baselines without introducing persona, roleplay, or a second safety pipeline.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, Vitest, Playwright, existing `memoryWorkspaceCompareService` and `memoryWorkspaceCompareMatrixService`.

---

## Scope Decisions

- `Phase 9B advice compare & matrix` **does include**:
  - compare and matrix inputs that accept `expressionMode: 'grounded' | 'advice'`
  - persisted compare session / matrix summaries that record the selected mode
  - compare model prompts and judge prompts that understand when they are evaluating grounded advice phrasing instead of plain grounded summaries
  - renderer controls that reuse the existing `Response mode` choice for ask / compare / matrix actions
  - regression coverage for advice-mode compare runs, judge wording, and matrix orchestration

- `Phase 9B advice compare & matrix` **does not include**:
  - per-target mixed-mode compare runs inside one compare session
  - persona imitation, style cloning, or “answer as the person” compare targets
  - new scoring dimensions specific to style or emotional tone
  - app-wide saved compare-mode preferences

- `Phase 9B` policy rules:
  1. `advice` compare runs must still be grounded in the same cited archive context as `9A`
  2. compare judges may review advice phrasing quality, but they must still reject unsupported claims or persona framing
  3. a compare or matrix session created in `advice` mode must remain visibly auditable as advice-mode output after reload
  4. `grounded` compare behavior must remain unchanged

---

### Task 1: Add compare / matrix expression-mode contracts and persistence fields

**Files:**
- Create: `src/main/services/migrations/012_memory_workspace_compare_expression_mode.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- `RunMemoryWorkspaceCompareInput['expressionMode']`
- `RunMemoryWorkspaceCompareMatrixInput['expressionMode']`
- `MemoryWorkspaceCompareSessionSummary['expressionMode']`
- `MemoryWorkspaceCompareMatrixSummary['expressionMode']`
- schema parsing for compare + matrix payloads in both `grounded` and `advice` modes

Example test shape:

```ts
expect(runMemoryWorkspaceCompareInputSchema.parse({
  scope: { kind: 'global' },
  question: '现在该优先处理什么？',
  expressionMode: 'advice'
}).expressionMode).toBe('advice')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because compare and matrix contracts do not expose public expression-mode support yet.

**Step 3: Write minimal implementation**

Add:

- optional `expressionMode` on compare + matrix inputs, defaulting to `grounded`
- explicit `expressionMode` on compare session and matrix summaries
- migration `012` that:
  - adds `expression_mode` to `memory_workspace_compare_sessions`
  - adds `expression_mode` to `memory_workspace_compare_matrices`
  - backfills existing rows to `'grounded'`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/012_memory_workspace_compare_expression_mode.sql src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
git commit -m "feat: add advice mode contracts for compare sessions"
```

---

### Task 2: Thread expression mode through compare and matrix services

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `src/main/services/memoryWorkspaceCompareMatrixService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. `runMemoryWorkspaceCompare(...)` forwards `expressionMode` into `askMemoryWorkspace(...)`
2. local baseline compare runs persist `response.expressionMode`
3. compare session summaries reload with the same `expressionMode`
4. matrix runs pass the selected mode into each child compare session
5. matrix summaries reload with the same `expressionMode`
6. `promptHash` changes when only `expressionMode` changes

Example test shape:

```ts
const session = await runMemoryWorkspaceCompare(db, {
  scope: { kind: 'global' },
  question: '下一步最稳妥的建议是什么？',
  expressionMode: 'advice'
})

expect(session?.expressionMode).toBe('advice')
expect(session?.runs[0]?.response?.expressionMode).toBe('advice')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts
```

Expected: FAIL because compare and matrix orchestration are still hard-coded to grounded baseline generation.

**Step 3: Write minimal implementation**

Implement:

- `runMemoryWorkspaceCompare(...)` calling `askMemoryWorkspace(...)` with `expressionMode`
- compare session persistence reading/writing `expression_mode`
- matrix orchestration forwarding `expressionMode` into each child compare run
- matrix summary persistence reading/writing `expression_mode`
- prompt/session hashing including resolved expression mode

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceCompareService.ts src/main/services/memoryWorkspaceCompareMatrixService.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts
git commit -m "feat: thread advice mode through compare services"
```

---

### Task 3: Make compare synthesis and judge prompts advice-aware

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. provider compare runs derived from an advice baseline keep `response.expressionMode === 'advice'`
2. compare model prompts for advice mode say they are comparing grounded advice answers rather than plain grounded summaries
3. judge prompts for advice mode say they are judging a grounded advice answer against its grounded advice baseline
4. judge fixture rationales and concerns remain honest for advice mode and still flag unsafe framing
5. grounded-mode prompt wording remains unchanged

Example assertions:

```ts
expect(callLiteLLMPayload.messages[0].content).toContain('grounded advice answers')
expect(run.response?.expressionMode).toBe('advice')
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because compare model and judge prompts currently describe only grounded-answer comparisons.

**Step 3: Write minimal implementation**

Refine compare service behavior so that:

- advice-mode prompts explicitly describe grounded advice output
- judge instructions still prioritize groundedness, guardrail preservation, and anti-persona boundaries
- `buildComparedResponse(...)` keeps the baseline `expressionMode`
- fixture verdict text becomes mode-aware without changing decision semantics

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceCompareService.ts tests/unit/main/memoryWorkspaceCompareService.test.ts
git commit -m "feat: make advice compare prompts mode-aware"
```

---

### Task 4: Reuse response mode in compare / matrix UI and label saved sessions

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. clicking `Run compare` forwards the current `Response mode`
2. clicking `Run matrix compare` forwards the current `Response mode`
3. compare result cards show `Mode: advice` when the session was run in advice mode
4. saved compare-session and matrix buttons expose the recorded mode in their labels or metadata
5. grounded compare rendering remains unchanged when mode stays `grounded`

Example test shape:

```tsx
fireEvent.change(screen.getByLabelText('Response mode'), {
  target: { value: 'advice' }
})

fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

expect(runMemoryWorkspaceCompareMock).toHaveBeenCalledWith(expect.objectContaining({
  expressionMode: 'advice'
}))
expect(await screen.findByText('Mode: advice')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare and matrix UI still ignore the selected response mode.

**Step 3: Write minimal implementation**

Implement:

- renderer compare + matrix calls that pass the current `expressionMode`
- advice-mode labels on compare run cards
- concise advice-mode markers for saved compare sessions / matrix summaries
- any archive API typing updates needed to satisfy strict renderer tests

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/archiveApi.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: wire advice mode into compare ui"
```

---

### Task 5: Document the slice and verify with focused e2e

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Modify: `docs/plans/2026-03-15-phase-nine-advice-mode-design.md`
- Create: `tests/e2e/memory-workspace-advice-compare-flow.spec.ts`

**Step 1: Write the failing e2e test**

Cover:

1. open `Memory Workspace`
2. switch `Response mode` to `Advice`
3. run compare with fixture-backed targets
4. verify compare results show advice-mode labeling
5. run matrix compare in advice mode
6. verify saved compare / matrix entries preserve advice-mode labeling

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-advice-compare-flow.spec.ts
```

Expected: FAIL because compare and matrix flows do not yet preserve advice mode end-to-end.

**Step 3: Write minimal implementation refinements**

- document `9B` as the compare/matrix continuation of `9A`
- keep the scope explicit: advice expression only, no persona simulation
- stabilize any mode labels needed for deterministic e2e assertions

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts tests/e2e/memory-workspace-compare-matrix-flow.spec.ts tests/e2e/memory-workspace-advice-compare-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md docs/plans/2026-03-15-phase-nine-advice-mode-design.md tests/e2e/memory-workspace-advice-compare-flow.spec.ts
git commit -m "docs: define phase 9 advice compare slice"
```

---

## Notes for the Implementer

- Do not add per-target expression-mode overrides in `9B`; one compare session should have one resolved mode.
- Keep `judge` evaluation semantics grounded-first even when the answer text is advice-shaped.
- Avoid a second persistence source for mode; session summaries should store it explicitly, and run details should still keep it in `response.expressionMode`.
- If an old compare or matrix record predates the migration, treat missing mode as `grounded`.
- Keep existing `grounded` compare screenshots, labels, and test snapshots stable unless advice-mode coverage requires a new explicit marker.
