# Import Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the current import page from a file-picker trigger into a complete import workbench with preflight validation, drag-and-drop selection, import progress/result feedback, and clearer next-step actions.

**Architecture:** Keep the existing `createImportBatch` backend write path intact and layer a dedicated import preflight/read model on top. The renderer should own temporary file selection and drag state, while the main process remains the source of truth for supported formats, batch creation, and persisted batch summaries.

**Tech Stack:** Electron, React, TypeScript, Zod, Vitest, Playwright

---

### Task 1: Centralize Supported Import Capabilities

**Files:**
- Modify: `src/shared/archiveTypes.ts`
- Modify: `src/main/ipc/archiveIpc.ts`
- Modify: `src/main/services/parserRegistry.ts`
- Modify: `src/renderer/pages/ImportPage.tsx`
- Test: `tests/unit/shared/appShell.test.ts`

**Step 1: Write the failing test**

Add a shared-contract style test that asserts the supported import extensions and labels are exposed from one shared source.

```ts
import { describe, expect, it } from 'vitest'
import { SUPPORTED_IMPORT_EXTENSIONS, SUPPORTED_IMPORT_FILTER_EXTENSIONS } from '../../../src/shared/archiveTypes'

describe('import capability constants', () => {
  it('exposes one canonical supported extension list', () => {
    expect(SUPPORTED_IMPORT_EXTENSIONS).toEqual(['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'])
    expect(SUPPORTED_IMPORT_FILTER_EXTENSIONS).toEqual(['json', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'pdf', 'docx'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/appShell.test.ts`  
Expected: FAIL because the shared constants do not exist yet.

**Step 3: Write minimal implementation**

Move supported extension definitions into `src/shared/archiveTypes.ts` and consume them from:

- `src/main/ipc/archiveIpc.ts` for `dialog.showOpenDialog`
- `src/main/services/parserRegistry.ts` for parser routing
- `src/renderer/pages/ImportPage.tsx` for client-side preflight display logic

Keep `.txt` behavior intact: chat by default, document only when explicitly preferred.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/appShell.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveTypes.ts src/main/ipc/archiveIpc.ts src/main/services/parserRegistry.ts src/renderer/pages/ImportPage.tsx tests/unit/shared/appShell.test.ts
git commit -m "refactor: centralize import capability constants"
```

---

### Task 2: Add Import Preflight Contracts and IPC

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/main/ipc/archiveIpc.ts`
- Create: `src/main/services/importPreflightService.ts`
- Test: `tests/unit/shared/phaseTwoContracts.test.ts`
- Test: `tests/unit/main/importPreflightService.test.ts`

**Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from 'vitest'
import { importPreflightInputSchema } from '../../../src/shared/ipcSchemas'

describe('import preflight schemas', () => {
  it('accepts a non-empty file path list', () => {
    expect(importPreflightInputSchema.parse({ sourcePaths: ['/tmp/chat.txt'] })).toBeTruthy()
  })
})
```

**Step 2: Write the failing service test**

```ts
import { describe, expect, it } from 'vitest'
import { buildImportPreflight } from '../../../src/main/services/importPreflightService'

describe('buildImportPreflight', () => {
  it('classifies supported, unsupported, and duplicate candidates before import', async () => {
    const result = await buildImportPreflight({ appPaths, sourcePaths: ['/tmp/chat.txt', '/tmp/file.exe'] })
    expect(result.items).toHaveLength(2)
    expect(result.items[1].status).toBe('unsupported')
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/shared/phaseTwoContracts.test.ts tests/unit/main/importPreflightService.test.ts`  
Expected: FAIL because the contracts, schemas, IPC surface, and service do not exist.

**Step 4: Write minimal implementation**

Add shared types for:

- `ImportPreflightItem`
- `ImportPreflightSummary`
- `ImportPreflightResult`

Add a new IPC route:

- `archive:preflightImportBatch`

Implement `buildImportPreflight({ appPaths, sourcePaths })` so it:

- normalizes extension and file name
- labels each item as `supported`, `unsupported`, or `duplicate_candidate`
- exposes import kind hint (`chat`, `image`, `document`, `unknown`)
- summarizes total / supported / unsupported counts

Do not add actual file hashing in the renderer. Keep duplicate-candidate detection in the main process.

**Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/shared/phaseTwoContracts.test.ts tests/unit/main/importPreflightService.test.ts`  
Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/preload/index.ts src/renderer/archiveApi.ts src/main/ipc/archiveIpc.ts src/main/services/importPreflightService.ts tests/unit/shared/phaseTwoContracts.test.ts tests/unit/main/importPreflightService.test.ts
git commit -m "feat: add import preflight contracts and IPC"
```

---

### Task 3: Replace the Fake Dropzone with a Real Import Surface

**Files:**
- Modify: `src/renderer/components/ImportDropzone.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/unit/renderer/importPage.test.tsx`

**Step 1: Write the failing renderer test**

```ts
it('shows selected files, supported formats, and drag-active state in the import surface', async () => {
  render(<ImportPage />)
  expect(screen.getByText('Choose Files')).toBeInTheDocument()
  expect(screen.getByText('JSON, TXT, JPG, PNG, HEIC, PDF, DOCX')).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`  
Expected: FAIL because the current import surface is only a button.

**Step 3: Write minimal implementation**

Turn `ImportDropzone` into a real presentation component that supports:

- click to choose files
- drag enter / drag leave / drag over / drop affordance
- selected file count
- selected file chips or list rows
- remove-one and clear-all actions
- supported format helper copy

Renderer state should remain local until the user confirms import. Do not call `createImportBatch` on drop alone.

Style direction:

- use a clear dashed drop area with stronger contrast than generic cards
- make the drag-active state feel deliberate, not “cute”
- avoid generic empty-state card grids

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ImportDropzone.tsx src/renderer/i18n.tsx src/renderer/styles.css tests/unit/renderer/importPage.test.tsx
git commit -m "feat: add real import workbench selection surface"
```

---

### Task 4: Split Selection, Preflight, and Commit-to-Import in the Page State Model

**Files:**
- Modify: `src/renderer/pages/ImportPage.tsx`
- Modify: `src/renderer/archiveApi.ts`
- Test: `tests/unit/renderer/importPage.test.tsx`

**Step 1: Write the failing renderer test**

```ts
it('runs preflight before batch creation and only imports supported files after confirmation', async () => {
  const preflightImportBatch = vi.fn().mockResolvedValue({
    summary: { totalCount: 2, supportedCount: 1, unsupportedCount: 1, duplicateCandidateCount: 0 },
    items: [
      { fileName: 'chat.txt', status: 'supported', importKind: 'chat' },
      { fileName: 'tool.exe', status: 'unsupported', importKind: 'unknown' }
    ]
  })

  const createImportBatch = vi.fn().mockResolvedValue({ batchId: 'b1', sourceLabel: '1 file', createdAt: '2026-03-29T00:00:00.000Z', files: [], summary: { frozenCount: 1, parsedCount: 1, duplicateCount: 0, reviewCount: 0 } })

  vi.stubGlobal('window', {
    archiveApi: {
      listImportBatches: vi.fn().mockResolvedValue([]),
      selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt', '/tmp/tool.exe']),
      preflightImportBatch,
      createImportBatch
    }
  })

  render(<ImportPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
  expect(await screen.findByText('1 supported, 1 unsupported')).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`  
Expected: FAIL because the page still imports immediately after selection.

**Step 3: Write minimal implementation**

Refactor `ImportPage` state into explicit phases:

- `idle`
- `selected`
- `preflight_ready`
- `importing`
- `completed`
- `error`

Behavior:

- `Choose Files` populates selection
- selection triggers preflight
- unsupported files are surfaced before import
- user confirms import of supported files only
- `sourceLabel` for multi-file imports becomes summary-based, for example `3 files`

Do not silently import on selection anymore.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ImportPage.tsx src/renderer/archiveApi.ts tests/unit/renderer/importPage.test.tsx
git commit -m "feat: add import selection and preflight state model"
```

---

### Task 5: Add Import Result Summary and Next-Step Actions

**Files:**
- Modify: `src/renderer/pages/ImportPage.tsx`
- Modify: `src/renderer/components/BatchList.tsx`
- Modify: `src/renderer/components/BatchDetail.tsx`
- Modify: `src/renderer/i18n.tsx`
- Test: `tests/unit/renderer/importPage.test.tsx`
- Test: `tests/unit/renderer/batchDetail.test.tsx`

**Step 1: Write the failing renderer test**

```ts
it('shows import outcome summary and next actions after a completed import', async () => {
  render(<ImportPage onSelectBatch={vi.fn()} />)
  expect(await screen.findByText('Imported 3 files')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View Batch Detail' })).toBeInTheDocument()
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx tests/unit/renderer/batchDetail.test.tsx`  
Expected: FAIL because import completion only refreshes the batch list today.

**Step 3: Write minimal implementation**

Expose and render:

- imported file count
- parsed count
- duplicate count
- review count
- skipped / unsupported count

Add obvious next-step actions:

- `View Batch Detail`
- `Import More`
- optional `Open Review Queue` only if review count is non-zero

Also upgrade `BatchList` rows to show basic metadata, not just `sourceLabel`.

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx tests/unit/renderer/batchDetail.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ImportPage.tsx src/renderer/components/BatchList.tsx src/renderer/components/BatchDetail.tsx src/renderer/i18n.tsx tests/unit/renderer/importPage.test.tsx tests/unit/renderer/batchDetail.test.tsx
git commit -m "feat: add import result summary and next actions"
```

---

### Task 6: Add Drag-and-Drop + Dirty-Data End-to-End Coverage

**Files:**
- Modify: `tests/e2e/import-batch.spec.ts`
- Create: `tests/e2e/import-batch-dirty-data.spec.ts` (only if existing test shape is insufficient)

**Step 1: Write the failing E2E assertions**

Add coverage for:

- choosing multiple files with at least one unsupported file
- preflight summary appearing before import
- import confirmation only using supported files
- recent batch row showing summary metadata

Example assertions:

```ts
await expect(page.getByText('1 supported, 1 unsupported')).toBeVisible()
await page.getByRole('button', { name: 'Import Supported Files' }).click()
await expect(page.getByText('Imported 1 file')).toBeVisible()
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/import-batch.spec.ts`  
Expected: FAIL because the current flow imports immediately and does not show preflight.

**Step 3: Write minimal implementation**

Use the existing `FORGETME_E2E_FIXTURE` path plumbing or extend it to accept multiple paths through `path.delimiter`. Reuse the dirty-data fixture shape already exercised in unit tests where possible.

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- tests/e2e/import-batch.spec.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/import-batch.spec.ts tests/e2e/import-batch-dirty-data.spec.ts
git commit -m "test: cover import preflight and dirty-data flows"
```

---

### Task 7: Final Verification Gate

**Step 1: Run typecheck**

```bash
npm run test:typecheck
```

Expected: PASS

**Step 2: Run focused unit tests**

```bash
npm run test:unit -- tests/unit/main/importPreflightService.test.ts tests/unit/main/importBatchService.test.ts tests/unit/renderer/importPage.test.tsx tests/unit/renderer/batchDetail.test.tsx
```

Expected: PASS

**Step 3: Run smoke E2E**

```bash
npm run test:e2e -- tests/e2e/import-batch.spec.ts
```

Expected: PASS

**Step 4: Run production build**

```bash
npm run build
```

Expected: PASS

**Step 5: Commit the verification-only changes if needed**

No commit required unless verification uncovered a fix.

---

### Recommended Delivery Order

1. Land shared import capability constants.
2. Land import preflight contracts + main-process service.
3. Upgrade renderer selection surface without changing batch creation yet.
4. Refactor page state to require explicit import confirmation.
5. Add import result summary and next-step actions.
6. Expand E2E coverage for dirty-data and preflight flows.
7. Run the verification gate before merging.
