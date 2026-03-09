# Private Archive Vault MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a desktop-first MVP that imports chat, image, and document batches; freezes originals locally; records batch and audit metadata in SQLite; flags duplicates; and provides a basic batch browser and search UI.

**Architecture:** Use a single Electron application with a React renderer and Node-powered main-process services. Keep originals and derived artifacts in an app-managed local vault, persist metadata and audit records in SQLite, and run import parsing through an in-process queue so failed parsing never loses originals.

**Tech Stack:** Electron, React, TypeScript, Vite, SQLite (`better-sqlite3`), `zod`, `vitest`, `playwright`, `exifreader`, `pdf-parse`, `mammoth`

---

## Assumptions

- Start from the current empty repository plus the validated design doc in `docs/plans/2026-03-09-private-archive-vault-design.md`.
- Use `npm` instead of `pnpm` to avoid adding a package-manager dependency choice to the first implementation pass.
- Scope this first implementation to **local-only MVP behavior**; optional cloud backup/sync is explicitly deferred.
- Support only these first-pass formats:
  - Chat: `.json`, `.txt`
  - Images: `.jpg`, `.jpeg`, `.png`, `.heic`
  - Documents: `.pdf`, `.docx`, `.txt`
- Use a content-addressed vault path like `vault/originals/<sha256-prefix>/<sha256>.<ext>`.
- Keep OCR, vector search, face recognition, and voice features out of this plan.

## Execution Prerequisites

- Before executing this plan, create an isolated workspace with `@superpowers:using-git-worktrees`.
- Execute each task with `@superpowers:test-driven-development` discipline.
- Before claiming any task complete, run the listed verification command and apply `@superpowers:verification-before-completion`.
- Commit after each task; the commit messages below are intentionally small and frequent.

## Target Repository Layout

```text
.
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ vitest.config.ts
├─ playwright.config.ts
├─ .gitignore
├─ src/
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc/
│  │  │  ├─ archiveIpc.ts
│  │  │  └─ searchIpc.ts
│  │  └─ services/
│  │     ├─ appPaths.ts
│  │     ├─ auditLogService.ts
│  │     ├─ db.ts
│  │     ├─ migrations/
│  │     │  ├─ 001_init.sql
│  │     │  └─ 002_search_views.sql
│  │     ├─ vaultService.ts
│  │     ├─ importBatchService.ts
│  │     ├─ dedupService.ts
│  │     ├─ parserRegistry.ts
│  │     ├─ parsers/
│  │     │  ├─ chatJsonParser.ts
│  │     │  ├─ textChatParser.ts
│  │     │  ├─ imageParser.ts
│  │     │  └─ documentParser.ts
│  │     ├─ peopleService.ts
│  │     ├─ relationService.ts
│  │     ├─ searchService.ts
│  │     └─ deleteService.ts
│  ├─ preload/
│  │  └─ index.ts
│  ├─ renderer/
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ pages/
│  │  │  ├─ ImportPage.tsx
│  │  │  ├─ BatchListPage.tsx
│  │  │  ├─ BatchDetailPage.tsx
│  │  │  └─ SearchPage.tsx
│  │  └─ components/
│  │     ├─ ImportDropzone.tsx
│  │     ├─ BatchList.tsx
│  │     ├─ BatchDetail.tsx
│  │     ├─ FileTable.tsx
│  │     └─ SearchFilters.tsx
│  └─ shared/
│     ├─ archiveContracts.ts
│     ├─ archiveTypes.ts
│     └─ ipcSchemas.ts
├─ tests/
│  ├─ fixtures/
│  │  ├─ imports/
│  │  │  ├─ sample-chat.json
│  │  │  ├─ sample-chat.txt
│  │  │  ├─ sample-image.jpg
│  │  │  ├─ sample-doc.pdf
│  │  │  └─ sample-doc.docx
│  ├─ unit/
│  │  ├─ main/
│  │  ├─ renderer/
│  │  └─ shared/
│  └─ e2e/
│     └─ import-batch.spec.ts
└─ docs/
   └─ plans/
```

## Scope Guardrails

This plan intentionally builds **trusted archive plumbing first**:

- Yes: import, freeze, hash, audit, metadata, search, light people anchors
- No: cloud sync, OCR, embeddings, conversational agent, relationship graph visualization, collaboration

### Task 1: Bootstrap the Electron App Shell and Test Harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/shared/archiveTypes.ts`
- Test: `tests/unit/shared/appShell.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { APP_NAME, SUPPORTED_IMPORT_KINDS } from '../../../src/shared/archiveTypes'

describe('app shell constants', () => {
  it('exposes the MVP import kinds', () => {
    expect(APP_NAME).toBe('ForgetMe')
    expect(SUPPORTED_IMPORT_KINDS).toEqual(['chat', 'image', 'document'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/appShell.test.ts`
Expected: FAIL with module resolution error because `src/shared/archiveTypes.ts` does not exist.

**Step 3: Write minimal implementation**

Create the app shell files and start with this shared module:

```ts
export const APP_NAME = 'ForgetMe'
export const SUPPORTED_IMPORT_KINDS = ['chat', 'image', 'document'] as const
export type ImportKind = (typeof SUPPORTED_IMPORT_KINDS)[number]
```

Also add `package.json` scripts for `dev`, `build`, `test:unit`, and `test:e2e`, plus a minimal `App.tsx` that renders `ForgetMe`.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/appShell.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json .gitignore electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts playwright.config.ts src/main/index.ts src/preload/index.ts src/renderer/main.tsx src/renderer/App.tsx src/shared/archiveTypes.ts tests/unit/shared/appShell.test.ts
git commit -m "chore: bootstrap desktop shell"
```

### Task 2: Create App Paths and Vault Layout Services

**Files:**
- Create: `src/main/services/appPaths.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/main/appPaths.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'

describe('ensureAppPaths', () => {
  it('creates the vault directory layout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-paths-'))
    const paths = ensureAppPaths(root)

    expect(paths.vaultOriginalsDir).toBe(path.join(root, 'vault', 'originals'))
    expect(fs.existsSync(paths.vaultOriginalsDir)).toBe(true)
    expect(fs.existsSync(paths.importReportsDir)).toBe(true)
    expect(fs.existsSync(paths.sqliteDir)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/appPaths.test.ts`
Expected: FAIL with `ensureAppPaths` not found.

**Step 3: Write minimal implementation**

```ts
export function ensureAppPaths(root: string) {
  const vaultDir = path.join(root, 'vault')
  const vaultOriginalsDir = path.join(vaultDir, 'originals')
  const importReportsDir = path.join(root, 'reports')
  const sqliteDir = path.join(root, 'sqlite')

  for (const dir of [vaultDir, vaultOriginalsDir, importReportsDir, sqliteDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return { root, vaultDir, vaultOriginalsDir, importReportsDir, sqliteDir }
}
```

In `src/main/index.ts`, call this service on startup using `app.getPath('userData')` in production and `./.local-dev/forgetme` in development.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/appPaths.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/appPaths.ts src/main/index.ts tests/unit/main/appPaths.test.ts
git commit -m "feat: create local vault directory layout"
```

### Task 3: Add SQLite Client and Initial Migrations

**Files:**
- Create: `src/main/services/db.ts`
- Create: `src/main/services/migrations/001_init.sql`
- Test: `tests/unit/main/db.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('database migrations', () => {
  it('creates the archive tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const tableNames = rows.map((row) => row.name)

    expect(tableNames).toEqual(expect.arrayContaining([
      'import_batches',
      'vault_files',
      'file_derivatives',
      'people',
      'relations',
      'audit_logs'
    ]))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/db.test.ts`
Expected: FAIL with missing `db.ts` module.

**Step 3: Write minimal implementation**

Implement `openDatabase` with `better-sqlite3` and `runMigrations` that executes `001_init.sql`.

`001_init.sql` should create:
- `import_batches`
- `vault_files`
- `file_derivatives`
- `people`
- `relations`
- `audit_logs`

Include only the columns needed for MVP:
- IDs
- timestamps
- batch status
- file hash
- source path
- frozen path
- mime type
- duplicate classification
- parser status
- audit action

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/db.ts src/main/services/migrations/001_init.sql tests/unit/main/db.test.ts
git commit -m "feat: add archive database schema"
```

### Task 4: Implement Batch Manifest Creation and Original Freeze Service

**Files:**
- Create: `src/main/services/vaultService.ts`
- Create: `src/main/services/importBatchService.ts`
- Create: `tests/fixtures/imports/sample-chat.txt`
- Test: `tests/unit/main/importBatchService.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('createImportBatch', () => {
  it('copies originals into the vault and creates a batch manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-'))
    const appPaths = ensureAppPaths(root)
    const sourceFile = path.resolve('tests/fixtures/imports/sample-chat.txt')

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [sourceFile],
      sourceLabel: 'manual-test'
    })

    expect(batch.files).toHaveLength(1)
    expect(fs.existsSync(batch.files[0].frozenAbsolutePath)).toBe(true)
    expect(fs.readFileSync(batch.manifestPath, 'utf8')).toContain('manual-test')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts`
Expected: FAIL with missing `createImportBatch`.

**Step 3: Write minimal implementation**

Implement:

```ts
export async function createImportBatch(input: {
  appPaths: AppPaths
  sourcePaths: string[]
  sourceLabel: string
}) {
  const batchId = crypto.randomUUID()
  const files = await Promise.all(input.sourcePaths.map((sourcePath) => freezeOriginal(input.appPaths, batchId, sourcePath)))
  const manifestPath = path.join(input.appPaths.importReportsDir, `${batchId}.json`)
  fs.writeFileSync(manifestPath, JSON.stringify({ batchId, sourceLabel: input.sourceLabel, files }, null, 2))
  return { batchId, manifestPath, files }
}
```

`freezeOriginal` should copy the file into the content-addressed vault path but should not delete or mutate the source file.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/vaultService.ts src/main/services/importBatchService.ts tests/fixtures/imports/sample-chat.txt tests/unit/main/importBatchService.test.ts
git commit -m "feat: freeze imported originals into vault"
```

### Task 5: Add File Hashing and Exact Duplicate Detection

**Files:**
- Create: `src/main/services/dedupService.ts`
- Modify: `src/main/services/vaultService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Test: `tests/unit/main/dedupService.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('exact duplicate detection', () => {
  it('marks the second identical file as duplicate_exact', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-dedup-'))
    const appPaths = ensureAppPaths(root)
    const file = path.resolve('tests/fixtures/imports/sample-chat.txt')

    const first = await createImportBatch({ appPaths, sourcePaths: [file], sourceLabel: 'first' })
    const second = await createImportBatch({ appPaths, sourcePaths: [file], sourceLabel: 'second' })

    expect(first.files[0].duplicateClass).toBe('unique')
    expect(second.files[0].duplicateClass).toBe('duplicate_exact')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dedupService.test.ts`
Expected: FAIL because duplicate classification is not implemented.

**Step 3: Write minimal implementation**

- Hash each frozen file with SHA-256.
- Store the hash in `vault_files`.
- Before inserting a new file record, query for an existing row with the same hash.
- Classify as `unique` or `duplicate_exact`; do not delete duplicates.

Minimal duplicate classifier:

```ts
export function classifyExactDuplicate(existingCount: number) {
  return existingCount > 0 ? 'duplicate_exact' : 'unique'
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dedupService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/dedupService.ts src/main/services/vaultService.ts src/main/services/importBatchService.ts tests/unit/main/dedupService.test.ts
git commit -m "feat: classify exact duplicate imports"
```

### Task 6: Add Parser Registry for Chat, Image, and Document Metadata

**Files:**
- Create: `src/main/services/parserRegistry.ts`
- Create: `src/main/services/parsers/chatJsonParser.ts`
- Create: `src/main/services/parsers/textChatParser.ts`
- Create: `src/main/services/parsers/imageParser.ts`
- Create: `src/main/services/parsers/documentParser.ts`
- Create: `tests/fixtures/imports/sample-chat.json`
- Create: `tests/fixtures/imports/sample-image.jpg`
- Create: `tests/fixtures/imports/sample-doc.pdf`
- Create: `tests/fixtures/imports/sample-doc.docx`
- Test: `tests/unit/main/parserRegistry.test.ts`

**Step 1: Write the failing test**

```ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFrozenFile } from '../../../src/main/services/parserRegistry'

describe('parseFrozenFile', () => {
  it('extracts lightweight metadata for supported file types', async () => {
    const chat = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-chat.json'))
    const image = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-image.jpg'))
    const doc = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-doc.pdf'))

    expect(chat.kind).toBe('chat')
    expect(chat.summary.messageCount).toBeGreaterThan(0)
    expect(image.kind).toBe('image')
    expect(image.summary).toHaveProperty('width')
    expect(doc.kind).toBe('document')
    expect(doc.summary).toHaveProperty('pageCount')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/parserRegistry.test.ts`
Expected: FAIL because parser registry does not exist.

**Step 3: Write minimal implementation**

Implement a registry that routes by extension:

- `.json` and `.txt` -> chat parsers
- `.jpg`, `.jpeg`, `.png`, `.heic` -> image parser
- `.pdf`, `.docx`, `.txt` -> document parser only when the caller explicitly marks the import as document

Concrete first-pass parser behavior:
- Chat JSON: count messages and collect participant display names from a simple `messages[]` shape
- Text chat: count non-empty lines and infer participants as empty list
- Image: read dimensions and EXIF if present
- PDF: read page count and first 500 characters of extracted text
- DOCX: read first 500 characters of extracted text

Persist parser results to `file_derivatives` as JSON blobs.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/parserRegistry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/parserRegistry.ts src/main/services/parsers/chatJsonParser.ts src/main/services/parsers/textChatParser.ts src/main/services/parsers/imageParser.ts src/main/services/parsers/documentParser.ts tests/fixtures/imports/sample-chat.json tests/fixtures/imports/sample-image.jpg tests/fixtures/imports/sample-doc.pdf tests/fixtures/imports/sample-doc.docx tests/unit/main/parserRegistry.test.ts
git commit -m "feat: parse initial import metadata"
```

### Task 7: Persist People Anchors, Relations, and Batch Reports

**Files:**
- Create: `src/main/services/peopleService.ts`
- Create: `src/main/services/relationService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Test: `tests/unit/main/peopleService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { collectPeopleAnchors } from '../../../src/main/services/peopleService'

describe('collectPeopleAnchors', () => {
  it('turns chat participants into stable people anchors', () => {
    const anchors = collectPeopleAnchors({
      parsedFiles: [
        {
          fileId: 'file-1',
          kind: 'chat',
          summary: { participants: ['Alice', 'Bob'], messageCount: 4 }
        }
      ]
    })

    expect(anchors.map((anchor) => anchor.displayName)).toEqual(['Alice', 'Bob'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/peopleService.test.ts`
Expected: FAIL because `collectPeopleAnchors` does not exist.

**Step 3: Write minimal implementation**

Implement:

```ts
export function collectPeopleAnchors(input: { parsedFiles: Array<{ fileId: string; kind: string; summary: any }> }) {
  return input.parsedFiles
    .filter((file) => file.kind === 'chat')
    .flatMap((file) => (file.summary.participants ?? []).map((displayName: string) => ({
      displayName,
      sourceType: 'chat_participant',
      confidence: 0.8,
      sourceFileId: file.fileId
    })))
}
```

Also persist:
- `people` rows for each unique anchor
- `relations` rows connecting `person -> file` and `file -> batch`
- JSON batch report summarizing frozen count, parsed count, duplicate count, and review-needed count

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/peopleService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/peopleService.ts src/main/services/relationService.ts src/main/services/importBatchService.ts tests/unit/main/peopleService.test.ts
git commit -m "feat: persist people anchors and batch reports"
```

### Task 8: Expose Archive IPC Contracts and Build the Import/Batch UI

**Files:**
- Create: `src/shared/archiveContracts.ts`
- Create: `src/shared/ipcSchemas.ts`
- Create: `src/main/ipc/archiveIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/pages/ImportPage.tsx`
- Create: `src/renderer/pages/BatchListPage.tsx`
- Create: `src/renderer/pages/BatchDetailPage.tsx`
- Create: `src/renderer/components/ImportDropzone.tsx`
- Create: `src/renderer/components/BatchList.tsx`
- Create: `src/renderer/components/BatchDetail.tsx`
- Create: `src/renderer/components/FileTable.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/importPage.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportPage } from '../../../src/renderer/pages/ImportPage'

describe('ImportPage', () => {
  it('shows the import action and latest batches', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn()
      }
    })

    render(<ImportPage />)

    expect(screen.getByText('Import Batch')).toBeInTheDocument()
    expect(screen.getByText('Recent Batches')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`
Expected: FAIL because renderer page and preload API do not exist.

**Step 3: Write minimal implementation**

- Define IPC contracts for:
  - `selectImportFiles`
  - `createImportBatch`
  - `listImportBatches`
  - `getImportBatch`
- Validate payloads with `zod`.
- In preload, expose `window.archiveApi`.
- In renderer, add three simple pages:
  - `ImportPage`
  - `BatchListPage`
  - `BatchDetailPage`

Keep the UI plain and functional; do not add design polish yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/importPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/ipc/archiveIpc.ts src/preload/index.ts src/main/index.ts src/renderer/pages/ImportPage.tsx src/renderer/pages/BatchListPage.tsx src/renderer/pages/BatchDetailPage.tsx src/renderer/components/ImportDropzone.tsx src/renderer/components/BatchList.tsx src/renderer/components/BatchDetail.tsx src/renderer/components/FileTable.tsx src/renderer/App.tsx tests/unit/renderer/importPage.test.tsx
git commit -m "feat: add batch import and archive UI"
```

### Task 9: Implement Basic Search, Filter, Export Audit, and Logical Delete

**Files:**
- Create: `src/main/services/searchService.ts`
- Create: `src/main/services/deleteService.ts`
- Create: `src/main/services/auditLogService.ts`
- Create: `src/main/services/migrations/002_search_views.sql`
- Create: `src/main/ipc/searchIpc.ts`
- Create: `src/renderer/pages/SearchPage.tsx`
- Create: `src/renderer/components/SearchFilters.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/main/searchService.test.ts`
- Test: `tests/unit/main/deleteService.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { searchArchive } from '../../../src/main/services/searchService'
import { logicalDeleteBatch } from '../../../src/main/services/deleteService'

describe('archive search', () => {
  it('filters by keyword and file kind', async () => {
    const results = await searchArchive({ query: 'Alice', fileKinds: ['chat'] })
    expect(results.every((item) => item.fileKind === 'chat')).toBe(true)
  })
})

describe('logicalDeleteBatch', () => {
  it('marks a batch deleted and writes an audit row', async () => {
    const result = await logicalDeleteBatch({ batchId: 'batch-1', actor: 'local-user' })
    expect(result.status).toBe('deleted')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/main/deleteService.test.ts`
Expected: FAIL because search and delete services do not exist.

**Step 3: Write minimal implementation**

- Add a search view or query over `vault_files`, `file_derivatives`, `people`, and `relations`.
- Support filters for keyword, file kind, batch ID, duplicate class, and person name.
- Implement `logicalDeleteBatch` to:
  - mark the batch and associated file rows as deleted
  - keep originals on disk
  - write an `audit_logs` row with action `delete.logical`
- Add an export-audit action that records `export.preview` even if the actual ZIP export remains deferred.

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/main/deleteService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/searchService.ts src/main/services/deleteService.ts src/main/services/auditLogService.ts src/main/services/migrations/002_search_views.sql src/main/ipc/searchIpc.ts src/renderer/pages/SearchPage.tsx src/renderer/components/SearchFilters.tsx src/renderer/App.tsx tests/unit/main/searchService.test.ts tests/unit/main/deleteService.test.ts
git commit -m "feat: add archive search and delete audit"
```

### Task 10: Add End-to-End Verification, Fixture Imports, and Operator Docs

**Files:**
- Create: `tests/e2e/import-batch.spec.ts`
- Modify: `playwright.config.ts`
- Create: `README.md`
- Modify: `docs/plans/2026-03-09-private-archive-vault-design.md`

**Step 1: Write the failing end-to-end test**

```ts
import { test, expect } from '@playwright/test'

test('imports a fixture batch and shows it in the recent batches list', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Import Batch').click()
  await page.getByText('sample-chat.txt').waitFor()
  await expect(page.getByText('Recent Batches')).toBeVisible()
})
```

**Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
Expected: FAIL because the app is not yet wired for the full import flow.

**Step 3: Write minimal implementation**

- Wire the Playwright launch command to boot the Electron app.
- Add a deterministic dev-only import fixture path for the test environment.
- Write `README.md` covering:
  - local setup
  - test commands
  - app data directory behavior
  - supported import formats
  - deletion semantics (`logical delete` only in MVP)
- Update the design doc with a short note linking to the implementation plan.

**Step 4: Run the full verification suite**

Run:
- `npm run test:unit`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
- `npm run build`

Expected:
- Unit tests PASS
- End-to-end import flow PASS
- Production build exits 0

**Step 5: Commit**

```bash
git add tests/e2e/import-batch.spec.ts playwright.config.ts README.md docs/plans/2026-03-09-private-archive-vault-design.md
git commit -m "docs: finalize mvp implementation handoff"
```

## Definition of Done

The MVP is ready for manual dogfooding when all of the following are true:

- A user can select multiple files and create an import batch from the desktop UI.
- Original files are copied into a stable vault path without mutating the source files.
- Every imported file gets a hash, duplicate classification, and batch record.
- Supported chat, image, and document files produce lightweight parsed metadata.
- A batch detail page shows original file records, parser status, and duplicate status.
- Basic people anchors appear for chat participant names.
- Search can filter by keyword, file kind, duplicate class, and person name.
- Logical delete is audited and reversible at the metadata layer.
- Unit tests, one end-to-end import test, and production build all pass.

## Deferred Work

Do not pull these into the first implementation pass:

- Cloud backup or sync
- OCR
- Embeddings or vector database
- Face recognition or face clustering
- Audio/video ingestion
- Persona generation or independent agents
- Group simulation or graph visualization

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-09-private-archive-vault-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session in a git worktree with `superpowers:executing-plans`, then execute this plan task-by-task with checkpoints

If you want, I can do either next.
