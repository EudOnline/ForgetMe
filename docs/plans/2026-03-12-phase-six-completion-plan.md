# Phase 6 Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining Phase 6 roadmap scope by adding optional encrypted export packages, recovery-drill verification with failure diffs, and searchable/replayable decision-journal history.

**Architecture:** Extend the existing preservation flow instead of introducing a parallel backup format: keep the current directory export as the source of truth, layer optional encrypted artifacts and drill reporting on top of it, and reuse the decision journal as the canonical replay/search log for review decisions. The renderer stays thin and drives new main-process services through the existing IPC boundary.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Node.js `crypto`/`fs`, Vitest, Playwright, existing archive IPC + review services

---

## Assumptions

- Phase 6A1 baseline export / restore is already shipped and verified.
- Phase 6A2 provider-boundary audit baseline is already shipped and verified.
- Phase 6B1 people inbox, 6B2 conflict-group navigation, and the first 6B3 safe-batch slice are already shipped and verified.
- Phase 6 completion must satisfy the acceptance criteria in `docs/plans/2026-03-11-phase-six-preservation-operator-efficiency-design.md`.
- Persona simulation, voice cloning, cloud sync, and automatic approval of high-risk identity fields remain out of scope.

## Target Repository Changes

```text
docs/plans/2026-03-12-phase-six-completion-plan.md
README.md
src/main/ipc/archiveIpc.ts
src/main/ipc/reviewIpc.ts
src/main/ipc/searchIpc.ts
src/main/services/backupExportService.ts
src/main/services/journalService.ts
src/main/services/restoreService.ts
src/main/services/searchService.ts
src/preload/index.ts
src/renderer/archiveApi.ts
src/renderer/pages/PreservationPage.tsx
src/renderer/pages/ReviewQueuePage.tsx
src/renderer/pages/SearchPage.tsx
src/shared/archiveContracts.ts
src/shared/ipcSchemas.ts
tests/e2e/preservation-flow.spec.ts
tests/e2e/review-workbench-safe-batch-flow.spec.ts
tests/unit/main/backupExportService.test.ts
tests/unit/main/restoreService.test.ts
tests/unit/main/searchService.test.ts
tests/unit/main/reviewQueueService.test.ts
tests/unit/shared/phaseSixContracts.test.ts
tests/unit/renderer/archiveApi.test.ts
tests/unit/renderer/preservationPage.test.tsx
tests/unit/renderer/reviewQueuePage.test.tsx
tests/unit/renderer/searchPage.test.tsx
```

## Scope Guardrails

In scope:

- optional password-based encrypted export artifact
- restore support for encrypted packages
- reusable recovery drill report with diff details
- journal search and replay entry points for review decisions
- README status / verification updates for final Phase 6 behavior

Out of scope:

- remote backup storage
- streaming encryption for giant archives
- persona reconstruction or agent simulation
- cross-session sync
- generic audit explorer beyond decision-journal replay/search

### Task 1: Add encrypted-export contracts and failing preservation tests

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseSixContracts.test.ts`
- Modify: `tests/unit/main/backupExportService.test.ts`
- Modify: `tests/unit/main/restoreService.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Add tests that cover:

- `createBackupExport(...)` accepts optional encryption input and returns encryption metadata
- encrypted export writes an encrypted artifact plus metadata instead of exposing plain copied DB/vault contents as the only portable package
- `restoreBackupExport(...)` requires the correct password for encrypted packages
- IPC schemas accept `encryptionPassword` / restore password input
- fallback API exposes the expanded preservation methods

**Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because encryption contracts and behavior do not exist yet.

### Task 2: Implement optional encrypted export / restore

**Files:**
- Modify: `src/main/services/backupExportService.ts`
- Modify: `src/main/services/restoreService.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/archiveIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`

**Step 1: Write minimal implementation**

Implement:

- optional `encryptionPassword` input for export
- password-derived encryption for a portable archive artifact using Node crypto primitives
- export metadata that records whether the package is plain or encrypted
- restore support for decrypting into a temp area before the existing copy + verification path runs
- clear failure on wrong password or corrupt encrypted payload

Keep:

- current manifest-driven verification model
- current directory export layout as the source structure before encryption is applied
- local-only behavior with no provider dependency

**Step 2: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

### Task 3: Add recovery-drill failing tests and report contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/main/restoreService.test.ts`
- Modify: `tests/unit/renderer/preservationPage.test.tsx`

**Step 1: Write the failing tests**

Add tests that cover:

- `restoreBackupExport(...)` returns a richer drill report with per-check diff details
- `runRecoveryDrill(...)` (or equivalent service entry point) performs restore + verification in one repeatable flow
- mismatch scenarios surface concrete expected/actual details for database counts, missing files, or hash mismatches
- preservation page renders recovery-drill results and failed-check detail blocks

**Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/restoreService.test.ts tests/unit/renderer/preservationPage.test.tsx
```

Expected: FAIL because drill reporting and diff detail rendering do not exist yet.

### Task 4: Implement recovery drill and preservation UI

**Files:**
- Modify: `src/main/services/restoreService.ts`
- Modify: `src/main/ipc/archiveIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/PreservationPage.tsx`
- Modify: `src/shared/archiveContracts.ts`

**Step 1: Write minimal implementation**

Implement:

- reusable drill/report helpers instead of ad-hoc check arrays
- diff-rich check details for hash mismatches, missing files, and table-count mismatches
- explicit preservation UI controls for encrypted export password, encrypted restore password, and recovery-drill execution
- report rendering that clearly separates pass/fail summary from evidence details

**Step 2: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/restoreService.test.ts tests/unit/renderer/preservationPage.test.tsx tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

### Task 5: Add decision replay/search failing tests

**Files:**
- Modify: `tests/unit/main/searchService.test.ts`
- Modify: `tests/unit/main/reviewQueueService.test.ts`
- Modify: `tests/unit/renderer/searchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`
- Modify: `tests/unit/shared/phaseSixContracts.test.ts`

**Step 1: Write the failing tests**

Add tests that cover:

- journal listing supports search filters and replay-friendly summaries
- review-related decisions become searchable through a dedicated search mode or result type
- review queue page can filter/replay journal entries from the existing history entry point
- search page can show decision-history hits distinctly from file hits

**Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/shared/phaseSixContracts.test.ts
```

Expected: FAIL because journal replay/search is not exposed yet.

### Task 6: Implement journal replay/search end to end

**Files:**
- Modify: `src/main/services/journalService.ts`
- Modify: `src/main/services/reviewQueueService.ts`
- Modify: `src/main/services/searchService.ts`
- Modify: `src/main/ipc/reviewIpc.ts`
- Modify: `src/main/ipc/searchIpc.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/ReviewQueuePage.tsx`
- Modify: `src/renderer/pages/SearchPage.tsx`

**Step 1: Write minimal implementation**

Implement:

- filtered decision-journal queries with keyword / decision-type / target-type support
- replay summaries that expose actor, timestamps, item counts, field keys, canonical person snapshots, undo state, and member journal references
- a renderer entry point to inspect replay details from review history
- search-page support for decision-history results without regressing file search

**Step 2: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

### Task 7: Add focused end-to-end coverage and docs

**Files:**
- Modify: `tests/e2e/preservation-flow.spec.ts` or create it if absent
- Modify: `tests/e2e/review-workbench-safe-batch-flow.spec.ts`
- Modify: `README.md`

**Step 1: Add / update e2e flows**

Cover:

- encrypted export from Preservation page
- restore / recovery drill with success report
- failed recovery drill surface for corrupted export fixture if practical
- safe batch approval followed by searchable replay / undo visibility

**Step 2: Run focused verification**

Run:

```bash
npm run build
npx playwright test tests/e2e/preservation-flow.spec.ts tests/e2e/review-workbench-safe-batch-flow.spec.ts
npm run test:unit -- tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts tests/unit/main/searchService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/preservationPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/searchPage.test.tsx
```

Expected: PASS

### Task 8: Full verification against Phase 6 acceptance criteria

**Step 1: Run full verification**

Run:

```bash
npm run test:unit
npm run build
npx playwright test
```

Expected: PASS

**Step 2: Re-read Phase 6 acceptance criteria**

Check each item in `docs/plans/2026-03-11-phase-six-preservation-operator-efficiency-design.md` and confirm:

- export package is verifiable and restorable
- encrypted export is optional and usable
- recovery drill is repeatable and diff-rich
- provider boundary remains auditable
- people-centric review flow remains intact
- safe batch approval still supports undo
- decision history can be searched and replayed

**Step 3: Prepare commit**

```bash
git add README.md docs/plans/2026-03-12-phase-six-completion-plan.md src/main/ipc/archiveIpc.ts src/main/ipc/reviewIpc.ts src/main/ipc/searchIpc.ts src/main/services/backupExportService.ts src/main/services/journalService.ts src/main/services/restoreService.ts src/main/services/searchService.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/pages/PreservationPage.tsx src/renderer/pages/ReviewQueuePage.tsx src/renderer/pages/SearchPage.tsx src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/e2e/preservation-flow.spec.ts tests/e2e/review-workbench-safe-batch-flow.spec.ts tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts tests/unit/main/searchService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/preservationPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/searchPage.test.tsx
git commit -m "feat: complete phase six preservation and replay flows"
```
