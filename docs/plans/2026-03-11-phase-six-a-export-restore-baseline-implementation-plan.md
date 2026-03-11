# Phase 6A Export Restore Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first preservation baseline for ForgetMe: export a complete local archive package with a manifest, restore it into a fresh app-data root, and surface a minimal operator UI for both actions.

**Architecture:** Keep phase 6A1 deliberately simple and local-first. Use a directory-based backup package instead of zip/encryption in this first slice so the implementation can rely on Node built-ins, preserve exact files, and make integrity verification easy to reason about. Do not add new database tables yet; produce export and restore reports on demand from services and JSON manifests, then layer a thin IPC and renderer surface on top.

**Tech Stack:** Electron, React, TypeScript, Node built-ins (`fs`, `path`, `crypto`, `node:sqlite`), Vitest, Playwright

---

## Assumptions

- Phase five is already merged and verified on `main`.
- The current app-data root remains the source of truth: `vault/`, `sqlite/archive.sqlite`, and generated reports under the local root.
- Phase 6A1 is intentionally limited to **directory-based export + restore baseline**.
- Encryption, provider redaction, and recovery-drill automation stay out of this implementation slice.
- Existing review, evidence, and profile tables must survive export and restore unchanged.

## Execution Prerequisites

- Create a dedicated worktree before implementation.
- Use `@superpowers:test-driven-development` for every task.
- Use `@superpowers:verification-before-completion` before claiming any task is complete.
- Keep commits small and aligned to task boundaries.
- Do not add archive compression or password handling in this plan.

## Target Repository Changes

```text
src/main/services/
  appPaths.ts
  vaultService.ts
  backupManifestService.ts
  backupExportService.ts
  restoreService.ts
src/main/ipc/
  preservationIpc.ts
src/preload/
  index.ts
src/renderer/
  App.tsx
  archiveApi.ts
  pages/PreservationPage.tsx
src/shared/
  archiveContracts.ts
  ipcSchemas.ts
tests/unit/shared/
  phaseSixContracts.test.ts
tests/unit/main/
  appPaths.test.ts
  backupManifestService.test.ts
  backupExportService.test.ts
  restoreService.test.ts
tests/unit/renderer/
  archiveApi.test.ts
  preservationPage.test.tsx
tests/e2e/
  preservation-export-restore-flow.spec.ts
README.md
```

## Scope Guardrails

In scope:

- export current local vault + SQLite snapshot into a directory package
- generate a machine-readable manifest with object and table counts
- restore an export package into a fresh target root
- run baseline integrity checks and return a restore report
- expose export / restore through IPC and a minimal page

Out of scope:

- encrypted export packages
- remote backup or sync
- provider egress artifacts / redaction policies
- scheduled recovery drills
- people-centric review efficiency work

## Package Shape

Use a directory export package like this for phase 6A1:

```text
<destination>/forgetme-export-2026-03-11T15-30-00/
  manifest.json
  database/archive.sqlite
  vault/originals/<sha-prefix>/<sha>.<ext>
```

The manifest should include at least:

- export format version
- app version
- created-at timestamp
- source root relative layout
- vault object entries with relative path, byte size, and SHA-256
- database snapshot relative path, byte size, and SHA-256
- table counts for the key archive tables

### Task 1: Add Phase-Six Contracts and Schemas for Preservation Operations

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseSixContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { backupExportInputSchema, restoreBackupInputSchema } from '../../../src/shared/ipcSchemas'

describe('phase-six preservation schemas', () => {
  it('accepts backup export input', () => {
    expect(backupExportInputSchema.parse({ destinationRoot: '/tmp/export-root' })).toBeTruthy()
  })

  it('accepts restore input', () => {
    expect(restoreBackupInputSchema.parse({ exportRoot: '/tmp/export-1', targetRoot: '/tmp/restore-root' })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseSixContracts.test.ts`  
Expected: FAIL because the phase-six schemas and contracts do not exist.

**Step 3: Write minimal implementation**

Add shared contracts for:

- `BackupManifest`
- `BackupManifestEntry`
- `BackupExportResult`
- `RestoreCheckResult`
- `RestoreRunResult`

Add schemas for:

- `backupExportInputSchema`
- `restoreBackupInputSchema`
- `directoryPathSchema` if needed for reuse

Keep the input model intentionally narrow:

- export only needs `destinationRoot`
- restore only needs `exportRoot`, `targetRoot`, and optional `overwrite`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseSixContracts.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseSixContracts.test.ts
git commit -m "feat: add phase six preservation contracts"
```

### Task 2: Extend App Paths for Preservation Reports and Reuse File Hashing

**Files:**
- Modify: `src/main/services/appPaths.ts`
- Modify: `src/main/services/vaultService.ts`
- Test: `tests/unit/main/appPaths.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'

describe('ensureAppPaths', () => {
  it('creates preservation report directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-paths-'))
    const paths = ensureAppPaths(root)

    expect(fs.existsSync(paths.importReportsDir)).toBe(true)
    expect(fs.existsSync(paths.preservationReportsDir)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/appPaths.test.ts`  
Expected: FAIL because `preservationReportsDir` does not exist.

**Step 3: Write minimal implementation**

Extend `ensureAppPaths(root)` with:

- `preservationReportsDir`

Also extract or export reusable SHA-256 file hashing so the backup services do not duplicate hashing logic already embedded in `vaultService.ts`.

Do not add export staging directories yet; export destinations come from the operator-selected path.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/appPaths.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/appPaths.ts src/main/services/vaultService.ts tests/unit/main/appPaths.test.ts
git commit -m "refactor: prepare preservation path utilities"
```

### Task 3: Build the Backup Manifest Snapshot Service

**Files:**
- Create: `src/main/services/backupManifestService.ts`
- Test: `tests/unit/main/backupManifestService.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { buildBackupManifest } from '../../../src/main/services/backupManifestService'

describe('buildBackupManifest', () => {
  it('captures vault objects, database snapshot metadata, and key table counts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-manifest-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const manifest = buildBackupManifest({ appPaths })

    expect(manifest.formatVersion).toBe('phase6a1')
    expect(manifest.vaultEntries[0]?.relativePath).toContain('vault/originals/ab/abcdef.txt')
    expect(manifest.databaseSnapshot.relativePath).toBe('database/archive.sqlite')
    expect(manifest.tableCounts.vault_files).toBeTypeOf('number')
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/backupManifestService.test.ts`  
Expected: FAIL because the manifest service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `buildBackupManifest({ appPaths })`

The manifest should:

- hash the current SQLite file
- enumerate every file under `vault/originals`
- record each entry as `{ relativePath, fileSize, sha256 }`
- query table counts for the core archive tables
- stamp `formatVersion`, `createdAt`, and app version

Keep the table-count list explicit. Start with:

- `import_batches`
- `vault_files`
- `canonical_people`
- `review_queue`
- `decision_journal`
- `enrichment_jobs`
- `enriched_evidence`
- `structured_field_candidates`
- `person_profile_attributes`

If a table does not exist yet in an older fixture, return `0` rather than crashing.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/backupManifestService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/backupManifestService.ts tests/unit/main/backupManifestService.test.ts
git commit -m "feat: add backup manifest snapshot service"
```

### Task 4: Build the Directory Export Writer

**Files:**
- Create: `src/main/services/backupExportService.ts`
- Test: `tests/unit/main/backupExportService.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createBackupExport } from '../../../src/main/services/backupExportService'

describe('createBackupExport', () => {
  it('writes a manifest, database snapshot, and vault copy into a new export directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-export-src-'))
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-export-dst-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const result = await createBackupExport({ appPaths, destinationRoot })

    expect(fs.existsSync(path.join(result.exportRoot, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(result.exportRoot, 'database', 'archive.sqlite'))).toBe(true)
    expect(fs.existsSync(path.join(result.exportRoot, 'vault', 'originals', 'ab', 'abcdef.txt'))).toBe(true)
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/backupExportService.test.ts`  
Expected: FAIL because the export service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `createBackupExport({ appPaths, destinationRoot })`

Behavior:

- create a new timestamped export directory under `destinationRoot`
- call `buildBackupManifest`
- copy `sqlite/archive.sqlite` to `database/archive.sqlite`
- copy `vault/originals` recursively into the export package
- write `manifest.json` at the package root
- return counts and paths in `BackupExportResult`

Use `fs.cpSync(..., { recursive: true })` for the vault copy. Do not introduce compression.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/backupExportService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/backupExportService.ts tests/unit/main/backupExportService.test.ts
git commit -m "feat: add directory backup export service"
```

### Task 5: Build Restore and Integrity Verification

**Files:**
- Create: `src/main/services/restoreService.ts`
- Test: `tests/unit/main/restoreService.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createBackupExport } from '../../../src/main/services/backupExportService'
import { restoreBackupExport } from '../../../src/main/services/restoreService'

describe('restoreBackupExport', () => {
  it('restores an export package into a fresh target root and verifies counts', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-src-'))
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-export-'))
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-target-'))
    const appPaths = ensureAppPaths(sourceRoot)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const exported = await createBackupExport({ appPaths, destinationRoot: exportRoot })
    const result = await restoreBackupExport({ exportRoot: exported.exportRoot, targetRoot, overwrite: true })

    expect(result.status).toBe('restored')
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true)
    expect(fs.existsSync(path.join(targetRoot, 'sqlite', 'archive.sqlite'))).toBe(true)
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/restoreService.test.ts`  
Expected: FAIL because the restore service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `restoreBackupExport({ exportRoot, targetRoot, overwrite })`
- `verifyRestoredBackup({ exportRoot, targetRoot })`

Behavior:

- require `manifest.json` to exist
- reject a non-empty target unless `overwrite === true`
- recreate the standard app layout with `ensureAppPaths(targetRoot)`
- copy the database snapshot and vault files into the target root
- open the restored database and compare table counts against the manifest
- compare vault entry count and file hashes against the manifest
- return a `RestoreRunResult` with a list of named checks

For phase 6A1, keep restore verification synchronous and local. Do not persist restore history in SQLite yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/restoreService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/restoreService.ts tests/unit/main/restoreService.test.ts
git commit -m "feat: add backup restore verification service"
```

### Task 6: Expose Preservation Operations Through IPC and Renderer API

**Files:**
- Create: `src/main/ipc/preservationIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArchiveApi } from '../../../src/renderer/archiveApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('archiveApi preservation methods', () => {
  it('exposes export and restore methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.createBackupExport({ destinationRoot: '/tmp/export-root' })).resolves.toEqual(null)
    await expect(archiveApi.restoreBackupExport({ exportRoot: '/tmp/export-1', targetRoot: '/tmp/restore-root' })).resolves.toEqual(null)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/archiveApi.test.ts`  
Expected: FAIL because the fallback API does not expose preservation methods.

**Step 3: Write minimal implementation**

Add a dedicated IPC module:

- `registerPreservationIpc(appPaths)`

Expose these handlers:

- `archive:createBackupExport`
- `archive:restoreBackupExport`
- `archive:selectBackupExportDestination`
- `archive:selectBackupExportSource`
- `archive:selectRestoreTargetDirectory`

Support E2E overrides through environment variables so Playwright can drive the flow without native dialogs:

- `FORGETME_E2E_BACKUP_DESTINATION_DIR`
- `FORGETME_E2E_BACKUP_SOURCE_DIR`
- `FORGETME_E2E_RESTORE_TARGET_DIR`

Wire the same methods through preload and renderer fallback stubs.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/archiveApi.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/preservationIpc.ts src/main/index.ts src/preload/index.ts src/renderer/archiveApi.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose preservation operations over ipc"
```

### Task 7: Add the Preservation Page and Navigation

**Files:**
- Create: `src/renderer/pages/PreservationPage.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/preservationPage.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreservationPage } from '../../../src/renderer/pages/PreservationPage'

describe('PreservationPage', () => {
  it('renders export and restore actions', () => {
    render(<PreservationPage />)

    expect(screen.getByRole('button', { name: 'Export Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore Archive' })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/preservationPage.test.tsx`  
Expected: FAIL because the page does not exist.

**Step 3: Write minimal implementation**

Create a simple page that lets the operator:

- choose an export destination directory
- run export and see the last `BackupExportResult`
- choose an export package directory
- choose a restore target directory
- run restore and see the last `RestoreRunResult`

Add one new top-level nav item in `App.tsx`:

- `Preservation`

Keep the UI intentionally compact. Do not add job history tables yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/preservationPage.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/PreservationPage.tsx src/renderer/App.tsx tests/unit/renderer/preservationPage.test.tsx
git commit -m "feat: add preservation page"
```

### Task 8: Verify the End-to-End Preservation Flow and Update Docs

**Files:**
- Create: `tests/e2e/preservation-export-restore-flow.spec.ts`
- Modify: `README.md`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('exports and restores a local archive package from the Preservation page', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-user-'))
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-export-'))
  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-restore-'))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: path.resolve('tests/fixtures/imports/sample-chat.txt'),
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_BACKUP_DESTINATION_DIR: exportDir,
      FORGETME_E2E_RESTORE_TARGET_DIR: restoreDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'sample-chat.txt' })).toBeVisible()

  await page.getByText('Preservation').click()
  await page.getByRole('button', { name: 'Export Archive' }).click()
  await expect(page.getByText('Export completed')).toBeVisible()
  await page.getByRole('button', { name: 'Restore Archive' }).click()
  await expect(page.getByText('Restore checks passed')).toBeVisible()

  await electronApp.close()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts`  
Expected: FAIL because the preservation page and IPC flow do not exist.

**Step 3: Write minimal implementation**

Make the E2E test pass without broadening scope:

- make the page show clear status text like `Export completed` and `Restore checks passed`
- ensure the test can restore the most recent export directory without manual file picking
- document the new Preservation page and verification command in `README.md`

Add a short README section for phase 6A baseline with:

- what gets exported
- current limitation: directory package, no encryption yet
- how to run the focused unit and E2E checks

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts`  
Expected: PASS

Then run broader verification:

- `npm run test:unit`
- `npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/preservation-export-restore-flow.spec.ts README.md
git commit -m "docs: add preservation export restore baseline"
```

## Final Verification Checklist

Before handing off or merging, run:

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts
npm run build
```

Expected results:

- all unit tests pass
- the new preservation E2E flow passes
- Electron build succeeds

## Deferred Follow-Ups

Explicitly defer these to later phase-6 tasks:

- encrypted export packages
- provider-boundary redaction artifacts
- recovery-drill automation and saved drill history
- restore history persistence in SQLite
- batch-review and operator-efficiency improvements
