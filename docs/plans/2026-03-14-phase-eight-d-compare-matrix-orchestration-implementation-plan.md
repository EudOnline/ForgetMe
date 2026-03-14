# Phase 8D Compare Matrix Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-pass batch matrix runner for `Memory Workspace` compare so operators can execute the same compare target set across many `scope + question` rows in one saved orchestration pass.

**Architecture:** Reuse the existing `runMemoryWorkspaceCompare(...)` service as the only row executor and add a thin parent `compare matrix session` layer above it. The matrix layer persists batch metadata plus row-level status, then runs rows sequentially so one failed row or target never aborts the remaining matrix. Renderer UX stays intentionally compact: a power-user textarea parser for structured rows, a run button, and a saved matrix history list.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, existing `memoryWorkspaceCompareService`, Vitest, Playwright.

---

## Scope Decisions

- `compare matrix v1` **does include**:
  - one saved matrix session containing many compare rows
  - rows made of `scope + question` with optional user label
  - sequential execution that reuses the existing compare runner per row
  - saved matrix summary/history plus row drilldown into child compare sessions
  - current compare target selection and judge settings reused for the whole matrix
  - fixture-friendly execution for deterministic unit/e2e coverage

- `compare matrix v1` **does not include yet**:
  - background jobs or resumable execution after app restart
  - true parallel remote execution
  - CSV import/export
  - matrix editing after run creation
  - judge-driven recommendation replacement
  - bulk scheduling across all people/groups automatically discovered by the app

- Input format stays intentionally small for v1:
  - one row per line in a textarea
  - line format: `scope | question`
  - optional label format: `label | scope | question`
  - scope tokens:
    - `global`
    - `person:<canonicalPersonId>`
    - `group:<anchorPersonId>`

---

## Assumptions

- Existing compare sessions, scoring, judge snapshots, target controls, and compare-session reuse are already implemented and verified.
- Existing `runMemoryWorkspaceCompare(...)` remains the canonical row executor; the matrix layer should orchestrate, not duplicate, compare logic.
- A compact structured-text entry flow is acceptable for the first batch slice because it supports multi-scope input without requiring a large new table editor.
- The matrix artifact is an operator workflow record, not a truth source and not a replacement for individual compare sessions.

---

### Task 1: Add matrix contracts and IPC schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Add contract/schema coverage for:

```ts
type MemoryWorkspaceCompareMatrixRowInput = {
  label?: string
  scope: MemoryWorkspaceScope
  question: string
}

type RunMemoryWorkspaceCompareMatrixInput = {
  title?: string
  rows: MemoryWorkspaceCompareMatrixRowInput[]
  judge?: RunMemoryWorkspaceCompareJudgeInput
  targets?: MemoryWorkspaceCompareTarget[]
}

type MemoryWorkspaceCompareMatrixRowRecord = {
  matrixRowId: string
  matrixSessionId: string
  ordinal: number
  label: string | null
  scope: MemoryWorkspaceScope
  question: string
  status: 'completed' | 'failed'
  errorMessage: string | null
  compareSessionId: string | null
  recommendedCompareRunId: string | null
  recommendedTargetLabel: string | null
  failedRunCount: number
  createdAt: string
}

type MemoryWorkspaceCompareMatrixSummary = {
  matrixSessionId: string
  title: string
  rowCount: number
  completedRowCount: number
  failedRowCount: number
  metadata: {
    targetLabels: string[]
    judge: MemoryWorkspaceCompareSessionJudgeSummary
  }
  createdAt: string
  updatedAt: string
}

type MemoryWorkspaceCompareMatrixDetail = MemoryWorkspaceCompareMatrixSummary & {
  rows: MemoryWorkspaceCompareMatrixRowRecord[]
}
```

Also cover API signatures:

```ts
runMemoryWorkspaceCompareMatrix: (input: RunMemoryWorkspaceCompareMatrixInput) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
listMemoryWorkspaceCompareMatrices: () => Promise<MemoryWorkspaceCompareMatrixSummary[]>
getMemoryWorkspaceCompareMatrix: (matrixSessionId: string) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because matrix contracts, schemas, and fallback API methods do not exist yet.

**Step 3: Write minimal implementation**

Add:

- matrix row/session shared types
- `runMemoryWorkspaceCompareMatrixInputSchema`
- `memoryWorkspaceCompareMatrixIdSchema`
- fallback API placeholders for matrix methods

Keep the contract intentionally small:

- no pagination yet
- no cancel/retry API yet
- no editable matrix rows yet

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

---

### Task 2: Add matrix persistence and orchestration service

**Files:**
- Create: `src/main/services/migrations/011_memory_workspace_compare_matrix.sql`
- Create: `src/main/services/memoryWorkspaceCompareMatrixService.ts`
- Modify: `src/main/services/migrations/index.ts`
- Create: `tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts`
- Reference: `src/main/services/memoryWorkspaceCompareService.ts`

**Step 1: Write the failing tests**

Create `tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts` covering:

1. running a matrix creates one parent matrix session and one child compare session per row
2. rows run sequentially and preserve input order
3. one failed row is persisted as failed while later rows still execute
4. row records keep `compareSessionId`, recommended target label, and failed-run count
5. listing/getting matrix sessions returns stable saved summaries/details

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts
```

Expected: FAIL because matrix persistence and orchestration do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- parent matrix-session table + row table migration
- `runMemoryWorkspaceCompareMatrix(db, input, options?)`
- `listMemoryWorkspaceCompareMatrices(db)`
- `getMemoryWorkspaceCompareMatrix(db, { matrixSessionId })`

Execution rules:

- loop rows in order
- call existing `runMemoryWorkspaceCompare(...)` for each row
- persist one row record per input row
- if row execution throws, mark only that row failed and continue
- reuse a single matrix-level target/judge snapshot for summary metadata

Keep orchestration thin:

- no duplicate scoring logic
- no duplicate judge logic
- no direct remote calls from matrix service
- no writes to truth tables

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts
```

Expected: PASS

---

### Task 3: Add structured row parser and renderer controls

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Extend renderer coverage for:

1. matrix panel accepts structured textarea input
2. valid rows call `runMemoryWorkspaceCompareMatrix(...)` with parsed scopes/questions
3. invalid lines show a parse error and do not run
4. saved matrix summaries render completed/failed row counts
5. clicking a matrix row can load the saved child compare session into the existing compare detail area

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because matrix controls and parsing UI do not exist yet.

**Step 3: Write minimal implementation**

Add a compact `Compare Matrix` panel to `Memory Workspace`:

- textarea with helper text and examples
- optional matrix title input
- `Run matrix compare` button
- parse/validation error block
- saved matrix history list
- row list showing status, scope, question, and recommended target

Parser rules:

- trim blank lines
- support `scope | question`
- support `label | scope | question`
- validate `person:` and `group:` ids are non-empty
- preserve input order exactly

Drilldown behavior:

- selecting a saved matrix row with a `compareSessionId` loads that child compare session through the existing compare-session reader
- do not duplicate compare result rendering; reuse current compare detail display

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Wire IPC, preload, and renderer API

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/archiveApi.test.ts` with:

```ts
await expect(archiveApi.runMemoryWorkspaceCompareMatrix({
  rows: [{ scope: { kind: 'global' }, question: '现在最值得关注什么？' }]
})).resolves.toBeNull()
await expect(archiveApi.listMemoryWorkspaceCompareMatrices()).resolves.toEqual([])
await expect(archiveApi.getMemoryWorkspaceCompareMatrix('matrix-1')).resolves.toBeNull()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because matrix IPC/API methods do not exist yet.

**Step 3: Write minimal implementation**

Add handlers:

- `archive:runMemoryWorkspaceCompareMatrix`
- `archive:listMemoryWorkspaceCompareMatrices`
- `archive:getMemoryWorkspaceCompareMatrix`

Route them through the new matrix service and expose them in preload + renderer API.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 5: Add focused e2e and update Phase 8 docs

**Files:**
- Create: `tests/e2e/memory-workspace-compare-matrix-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Write the failing e2e test**

Cover:

1. open `Memory Workspace`
2. enter two matrix rows with different scopes
3. run matrix compare
4. see saved matrix summary with row counts
5. open one matrix row and inspect the child compare session results

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-matrix-flow.spec.ts
```

Expected: FAIL because matrix UI and orchestration flow do not exist yet.

**Step 3: Write minimal implementation refinements**

- stabilize helper text and labels for matrix parsing
- ensure matrix summaries render predictable status labels
- document the `compare matrix v1` boundary in the phase 8 design doc

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareMatrixService.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts tests/e2e/memory-workspace-compare-matrix-flow.spec.ts
```

Expected: PASS

---

## Implementation Notes

- Do **not** bypass `runMemoryWorkspaceCompare(...)`; matrix orchestration should compose existing compare behavior rather than fork it.
- Keep matrix execution sequential for v1 even if remote targets are slow; predictable persistence and failure isolation matter more than speed here.
- Matrix rows should store enough metadata for quick scan, but the canonical deep detail remains the child compare session.
- Use the current compare target/judge controls as matrix-wide settings to avoid adding per-row configuration complexity.
- Invalid textarea lines should fail fast before any row executes.

## Final Verification Checklist

- Operators can run one saved matrix across many `scope + question` rows
- Every row creates or references a child compare session
- One failed row does not abort the matrix
- Saved matrix history shows row counts and judge/target metadata
- Matrix UI can reopen a child compare result using the existing compare detail path
- Unit tests and e2e cover parsing, persistence, and drilldown
