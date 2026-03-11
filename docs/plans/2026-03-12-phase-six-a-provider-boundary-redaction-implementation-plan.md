# Phase 6A Provider Boundary Redaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first provider-boundary baseline for remote multimodal calls by persisting egress audit records, applying a simple redaction policy, and removing absolute filesystem paths from model requests.

**Architecture:** Introduce a dedicated provider boundary layer between enrichment execution and `LiteLLM`. The first slice stays metadata-first: it sanitizes the outbound request envelope, writes `provider_egress_artifacts` and `provider_egress_events`, and records request / response / error payloads without attempting full image-level redaction.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, existing enrichment execution stack, existing `LiteLLM` gateway

---

## Assumptions

- Phase 6A1 export / restore baseline is committed and verified.
- The current remote model path still uses JSON-only requests through `callLiteLLM()`.
- This implementation slice does not attempt binary image uploads or pixel-level masking.
- The immediate security win is removing absolute path leakage and adding auditable boundary records.

## Execution Prerequisites

- Stay on the current isolated worktree.
- Use `@superpowers:test-driven-development` for every task.
- Use `@superpowers:verification-before-completion` before claiming any task is complete.
- Keep commits aligned to task boundaries.

## Target Repository Changes

```text
src/main/services/
  migrations/006_provider_boundary_redaction.sql
  providerBoundaryService.ts
  enrichmentExecutionService.ts
src/shared/
  archiveContracts.ts
  ipcSchemas.ts
src/renderer/
  archiveApi.ts
tests/unit/main/
  dbPhaseSixA2.test.ts
  providerBoundaryService.test.ts
  enrichmentExecutionService.test.ts
README.md
```

## Scope Guardrails

In scope:

- provider boundary schema
- basic redaction policy records
- sanitized metadata-only request envelope
- request / response / error audit persistence
- enrichment execution integration

Out of scope:

- image-byte masking
- OCR text redaction after response normalization
- UI audit explorer
- provider-specific upload APIs

### Task 1: Add Phase-6A2 Schema for Boundary Policies and Egress Audit

**Files:**
- Create: `src/main/services/migrations/006_provider_boundary_redaction.sql`
- Test: `tests/unit/main/dbPhaseSixA2.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-six-a2 migrations', () => {
  it('creates redaction policy and provider egress audit tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6a2-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'redaction_policies',
      'provider_egress_artifacts',
      'provider_egress_events'
    ]))
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPhaseSixA2.test.ts`  
Expected: FAIL because the migration does not exist.

**Step 3: Write minimal implementation**

Create the migration with:

- `redaction_policies`
- `provider_egress_artifacts`
- `provider_egress_events`
- indexes on policy key, job lookup, artifact event lookup

Do not add restore or UI tables in this step.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPhaseSixA2.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/006_provider_boundary_redaction.sql tests/unit/main/dbPhaseSixA2.test.ts
git commit -m "feat: add provider boundary schema"
```

### Task 2: Build the Provider Boundary Sanitization Service

**Files:**
- Create: `src/main/services/providerBoundaryService.ts`
- Test: `tests/unit/main/providerBoundaryService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildProviderBoundaryRequest } from '../../../src/main/services/providerBoundaryService'

describe('buildProviderBoundaryRequest', () => {
  it('removes absolute path fields and emits a metadata-only envelope', () => {
    const result = buildProviderBoundaryRequest({
      job: {
        id: 'job-1',
        fileId: 'f-1',
        fileName: 'transcript.pdf',
        frozenPath: '/tmp/transcript.pdf',
        fileSha256: 'hash-1',
        extension: '.pdf',
        mimeType: 'application/pdf',
        enhancerType: 'document_ocr',
        provider: 'siliconflow',
        model: 'model-a'
      }
    })

    expect(JSON.stringify(result.requestEnvelope)).not.toContain('/tmp/transcript.pdf')
    expect(result.redactionSummary.removedFields).toContain('frozenPath')
    expect(result.policyKey).toBe('document_ocr.remote_baseline')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/providerBoundaryService.test.ts`  
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `buildProviderBoundaryRequest({ job })`
- `persistProviderEgressRequest(db, ...)`
- `persistProviderEgressResponse(db, ...)`
- `persistProviderEgressError(db, ...)`

Use baseline policy keys:

- `document_ocr.remote_baseline`
- `image_understanding.remote_baseline`
- `chat_screenshot.remote_baseline`

The sanitized envelope should keep metadata references only and explicitly exclude `frozenPath`.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/providerBoundaryService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/providerBoundaryService.ts tests/unit/main/providerBoundaryService.test.ts
git commit -m "feat: add provider boundary service"
```

### Task 3: Integrate Boundary Audit Into Enrichment Execution

**Files:**
- Modify: `src/main/services/enrichmentExecutionService.ts`
- Test: `tests/unit/main/enrichmentExecutionService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { executeEnrichmentJob } from '../../../src/main/services/enrichmentExecutionService'

describe('executeEnrichmentJob boundary audit', () => {
  it('writes request and response egress rows for a successful provider call', async () => {
    const result = await executeEnrichmentJob(db, { jobId: 'job-1', callModel: async ({ requestEnvelope }) => ({ ... }) })
    expect(result.status).toBe('completed')
    expect((db.prepare('select count(*) as count from provider_egress_artifacts').get() as { count: number }).count).toBe(1)
    expect((db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('request') as { count: number }).count).toBe(1)
    expect((db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('response') as { count: number }).count).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichmentExecutionService.test.ts`  
Expected: FAIL because no boundary audit rows are written.

**Step 3: Write minimal implementation**

Update execution flow to:

- build a sanitized request envelope before provider call
- persist request artifact + request event
- pass sanitized metadata to the provider call layer
- persist response event on success
- persist error event on failure

Keep normalization and queueing behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichmentExecutionService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/enrichmentExecutionService.ts tests/unit/main/enrichmentExecutionService.test.ts
git commit -m "feat: audit provider boundary in enrichment execution"
```

## Final Verification Checklist

Before handing off, run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseSixA2.test.ts tests/unit/main/providerBoundaryService.test.ts tests/unit/main/enrichmentExecutionService.test.ts
npm run test:unit
npm run build
```

Expected results:

- focused phase-6A2 tests pass
- full unit suite stays green
- build succeeds
