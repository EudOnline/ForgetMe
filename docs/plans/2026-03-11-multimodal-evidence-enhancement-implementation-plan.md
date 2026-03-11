# Multimodal Evidence Enhancement Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build phase three of ForgetMe so document OCR and image understanding produce reviewable multimodal evidence, with low-risk results flowing automatically into the evidence layer and high-risk structured fields flowing through the existing review queue.

**Architecture:** Extend the current local archive with enrichment jobs, raw artifacts, enriched evidence, and structured field candidates. Route all model calls through `LiteLLM`, normalize outputs into generic and typed schemas, then classify fields by risk before sending them either to the evidence layer or to phase-two review + journal flows.

**Tech Stack:** Electron, React, TypeScript, Node `node:sqlite`, Zod, Vitest, Playwright, `LiteLLM`, existing ForgetMe archive services

---

## Assumptions

- Phase one and phase two are already merged on `main` and verified.
- Phase three remains local-first; remote models are used as inference providers, not as system-of-record storage.
- `LiteLLM` is the single integration surface for third-party model providers.
- High-risk structured fields must reuse the existing review queue and decision journal patterns from phase two.
- Keep implementation incremental; do not attempt audio, video, cloud sync, or persona generation in this phase.

## Execution Prerequisites

- Create a dedicated worktree before implementation.
- Use `@superpowers:test-driven-development` for each task.
- Use `@superpowers:verification-before-completion` before claiming any task or batch is complete.
- Keep commits small and aligned to task boundaries.

## Target Repository Changes

```text
src/main/services/
  modelGatewayService.ts
  enrichmentDispatchService.ts
  enrichmentJobService.ts
  documentOcrService.ts
  imageUnderstandingService.ts
  fieldRiskService.ts
  enrichmentReviewService.ts
  enrichedSearchService.ts
  migrations/004_multimodal_evidence.sql
src/main/ipc/
  enrichmentIpc.ts
src/renderer/pages/
  EnrichmentJobsPage.tsx
  DocumentEvidencePage.tsx
src/renderer/components/
  EnrichmentJobTable.tsx
  StructuredFieldCandidateTable.tsx
  OCRTextPanel.tsx
  LayoutBlockList.tsx
  ImageSummaryCard.tsx
src/shared/
  archiveContracts.ts
  ipcSchemas.ts
tests/unit/main/
  dbPhaseThree.test.ts
  modelGatewayService.test.ts
  fieldRiskService.test.ts
  documentOcrService.test.ts
  imageUnderstandingService.test.ts
  enrichmentReviewService.test.ts
  enrichedSearchService.test.ts
tests/unit/renderer/
  enrichmentJobsPage.test.tsx
  documentEvidencePage.test.tsx
tests/e2e/
  multimodal-review-flow.spec.ts
```

## Scope Guardrails

In scope:

- `LiteLLM`-based model gateway
- OCR and image understanding job orchestration
- generic + typed extraction outputs
- field-level risk classification
- high-risk structured field review queue integration
- approved field consumption in search and person detail

Out of scope:

- audio / video enhancement
- face clustering
- cloud sync / backup
- persona agents
- collaboration workflows

### Task 1: Add Phase-Three Schema for Enrichment Jobs, Artifacts, Evidence, and Field Candidates

**Files:**
- Create: `src/main/services/migrations/004_multimodal_evidence.sql`
- Test: `tests/unit/main/dbPhaseThree.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-three migrations', () => {
  it('creates enrichment tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase3-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'enrichment_jobs',
      'enrichment_artifacts',
      'enriched_evidence',
      'structured_field_candidates'
    ]))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPhaseThree.test.ts`
Expected: FAIL because `004_multimodal_evidence.sql` does not exist.

**Step 3: Write minimal implementation**

Create tables for:

- `enrichment_jobs`
- `enrichment_artifacts`
- `enriched_evidence`
- `structured_field_candidates`

Also add indexes on:

- job status
- file id + enhancer type
- candidate status
- risk level

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPhaseThree.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/004_multimodal_evidence.sql tests/unit/main/dbPhaseThree.test.ts
git commit -m "feat: add phase three enrichment schema"
```

### Task 2: Add LiteLLM Model Gateway and Provider Config

**Files:**
- Create: `src/main/services/modelGatewayService.ts`
- Modify: `src/main/services/appPaths.ts`
- Test: `tests/unit/main/modelGatewayService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveModelRoute } from '../../../src/main/services/modelGatewayService'

describe('resolveModelRoute', () => {
  it('routes OCR work through a LiteLLM provider config', () => {
    const route = resolveModelRoute({
      taskType: 'document_ocr',
      preferredProvider: 'siliconflow'
    })

    expect(route.provider).toBe('siliconflow')
    expect(route.baseURL).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/modelGatewayService.test.ts`
Expected: FAIL because the gateway service does not exist.

**Step 3: Write minimal implementation**

Implement:

- provider config loading from env
- route selection by task type
- timeout defaults
- retry defaults
- a `callLiteLLM` wrapper that returns normalized metadata

Do not add streaming, batching, or cost dashboards yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/modelGatewayService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/modelGatewayService.ts src/main/services/appPaths.ts tests/unit/main/modelGatewayService.test.ts
git commit -m "feat: add litellm model gateway"
```

### Task 3: Dispatch Enrichment Jobs After Import Completion

**Files:**
- Create: `src/main/services/enrichmentDispatchService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Test: `tests/unit/main/enrichmentDispatchService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { chooseEnhancerType } from '../../../src/main/services/enrichmentDispatchService'

describe('chooseEnhancerType', () => {
  it('routes image files to image understanding and PDF files to document OCR', () => {
    expect(chooseEnhancerType({ extension: '.jpg', fileName: 'photo.jpg' })).toBe('image_understanding')
    expect(chooseEnhancerType({ extension: '.pdf', fileName: 'score.pdf' })).toBe('document_ocr')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichmentDispatchService.test.ts`
Expected: FAIL because the dispatch service does not exist.

**Step 3: Write minimal implementation**

Implement:

- enhancer selection by extension and filename hints
- job row creation
- duplicate job suppression
- import flow hook after parser completion

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichmentDispatchService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/enrichmentDispatchService.ts src/main/services/importBatchService.ts tests/unit/main/enrichmentDispatchService.test.ts
git commit -m "feat: dispatch enrichment jobs after import"
```

### Task 4: Build Document OCR Service with Typed Extraction and Generic Fallback

**Files:**
- Create: `src/main/services/documentOcrService.ts`
- Test: `tests/unit/main/documentOcrService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeDocumentExtraction } from '../../../src/main/services/documentOcrService'

describe('normalizeDocumentExtraction', () => {
  it('produces typed fields and generic OCR output for id cards', () => {
    const result = normalizeDocumentExtraction({
      documentType: 'id_card',
      rawText: '姓名 张三\n公民身份号码 1234',
      fields: { full_name: '张三', national_id_number: '1234' }
    })

    expect(result.generic.rawText).toContain('姓名')
    expect(result.typed.documentType).toBe('id_card')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/documentOcrService.test.ts`
Expected: FAIL because the OCR service does not exist.

**Step 3: Write minimal implementation**

Implement:

- generic OCR output normalization
- typed schemas for `id_card`, `driver_license`, `transcript`
- artifact writes for raw text and layout blocks
- evidence writes for generic low-risk outputs
- field candidate writes for typed sensitive fields

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/documentOcrService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/documentOcrService.ts tests/unit/main/documentOcrService.test.ts
git commit -m "feat: add typed document ocr extraction"
```

### Task 5: Build Image and Screenshot Understanding Service

**Files:**
- Create: `src/main/services/imageUnderstandingService.ts`
- Test: `tests/unit/main/imageUnderstandingService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeImageExtraction } from '../../../src/main/services/imageUnderstandingService'

describe('normalizeImageExtraction', () => {
  it('creates a screenshot text result and image summary fallback', () => {
    const result = normalizeImageExtraction({
      imageType: 'chat_screenshot',
      summary: 'Two chat bubbles are visible',
      transcriptText: 'Alice: hi\nBob: hello'
    })

    expect(result.generic.imageSummary).toContain('chat bubbles')
    expect(result.generic.rawText).toContain('Alice')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/imageUnderstandingService.test.ts`
Expected: FAIL because the image service does not exist.

**Step 3: Write minimal implementation**

Implement:

- generic image summary normalization
- chat screenshot text normalization
- date / location / participant fragment extraction
- evidence writes for low-risk outputs
- candidate writes for high-risk fields

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/imageUnderstandingService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/imageUnderstandingService.ts tests/unit/main/imageUnderstandingService.test.ts
git commit -m "feat: add image understanding extraction"
```

### Task 6: Add Field-Level Risk Classification and Review Queue Integration

**Files:**
- Create: `src/main/services/fieldRiskService.ts`
- Create: `src/main/services/enrichmentReviewService.ts`
- Test: `tests/unit/main/fieldRiskService.test.ts`
- Test: `tests/unit/main/enrichmentReviewService.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { classifyFieldRisk } from '../../../src/main/services/fieldRiskService'

describe('classifyFieldRisk', () => {
  it('marks national id numbers as high risk and generic OCR text as low risk', () => {
    expect(classifyFieldRisk({ fieldKey: 'national_id_number' })).toBe('high')
    expect(classifyFieldRisk({ fieldKey: 'raw_text' })).toBe('low')
  })
})
```

```ts
import { describe, expect, it } from 'vitest'
import { queueStructuredFieldCandidate } from '../../../src/main/services/enrichmentReviewService'

describe('queueStructuredFieldCandidate', () => {
  it('adds a pending high-risk field to the shared review queue', () => {
    const item = queueStructuredFieldCandidate({
      candidateId: 'fc-1',
      fieldKey: 'national_id_number',
      confidence: 0.92
    })

    expect(item.itemType).toBe('structured_field_candidate')
    expect(item.status).toBe('pending')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/main/fieldRiskService.test.ts tests/unit/main/enrichmentReviewService.test.ts`
Expected: FAIL because the services do not exist.

**Step 3: Write minimal implementation**

Implement:

- field key to risk mapping
- automatic routing rules
- reuse of existing `review_queue`
- reuse of existing `decision_journal`
- approval / rejection / undo for structured field candidates

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/main/fieldRiskService.test.ts tests/unit/main/enrichmentReviewService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/fieldRiskService.ts src/main/services/enrichmentReviewService.ts tests/unit/main/fieldRiskService.test.ts tests/unit/main/enrichmentReviewService.test.ts
git commit -m "feat: add field-level risk review routing"
```

### Task 7: Feed Approved Enrichment Results into Search and Person Views

**Files:**
- Create: `src/main/services/enrichedSearchService.ts`
- Modify: `src/main/services/searchService.ts`
- Modify: `src/main/services/timelineService.ts`
- Test: `tests/unit/main/enrichedSearchService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildEnrichedSearchRow } from '../../../src/main/services/enrichedSearchService'

describe('buildEnrichedSearchRow', () => {
  it('includes approved enriched text and approved field values in search haystacks', () => {
    const row = buildEnrichedSearchRow({
      fileName: 'id-card.jpg',
      enrichedTexts: ['张三'],
      approvedFields: ['北京大学']
    })

    expect(row.haystack).toContain('张三')
    expect(row.haystack).toContain('北京大学')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichedSearchService.test.ts`
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement:

- search haystack augmentation
- approved structured field reads for person detail
- timeline evidence augmentation from approved document and screenshot signals

Do not attempt full graph-attribute redesign yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichedSearchService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/enrichedSearchService.ts src/main/services/searchService.ts src/main/services/timelineService.ts tests/unit/main/enrichedSearchService.test.ts
git commit -m "feat: consume approved enriched evidence"
```

### Task 8: Expose Phase-Three IPC for Jobs, Evidence, and Review Actions

**Files:**
- Create: `src/main/ipc/enrichmentIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseThreeContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { enrichmentJobFilterSchema } from '../../../src/shared/ipcSchemas'

describe('phase-three ipc schemas', () => {
  it('accepts enrichment job status filters', () => {
    expect(enrichmentJobFilterSchema.parse({ status: 'pending' })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseThreeContracts.test.ts`
Expected: FAIL because phase-three contracts do not exist.

**Step 3: Write minimal implementation**

Expose handlers for:

- `listEnrichmentJobs`
- `getDocumentEvidence`
- `rerunEnrichmentJob`
- `listStructuredFieldCandidates`
- `approveStructuredFieldCandidate`
- `rejectStructuredFieldCandidate`
- `undoStructuredFieldDecision`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseThreeContracts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/enrichmentIpc.ts src/main/index.ts src/preload/index.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseThreeContracts.test.ts
git commit -m "feat: expose phase three enrichment ipc"
```

### Task 9: Add Enrichment Jobs and Document Evidence UI

**Files:**
- Create: `src/renderer/pages/EnrichmentJobsPage.tsx`
- Create: `src/renderer/pages/DocumentEvidencePage.tsx`
- Create: `src/renderer/components/EnrichmentJobTable.tsx`
- Create: `src/renderer/components/StructuredFieldCandidateTable.tsx`
- Create: `src/renderer/components/OCRTextPanel.tsx`
- Create: `src/renderer/components/LayoutBlockList.tsx`
- Create: `src/renderer/components/ImageSummaryCard.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/enrichmentJobsPage.test.tsx`
- Test: `tests/unit/renderer/documentEvidencePage.test.tsx`

**Step 1: Write the failing tests**

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnrichmentJobsPage } from '../../../src/renderer/pages/EnrichmentJobsPage'

describe('EnrichmentJobsPage', () => {
  it('shows queued and completed enrichment jobs', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listEnrichmentJobs: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'pending', enhancerType: 'document_ocr' }])
      }
    })

    render(<EnrichmentJobsPage />)
    expect(await screen.findByText('document_ocr')).toBeInTheDocument()
  })
})
```

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentEvidencePage } from '../../../src/renderer/pages/DocumentEvidencePage'

describe('DocumentEvidencePage', () => {
  it('shows OCR text and pending field candidates', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        getDocumentEvidence: vi.fn().mockResolvedValue({
          rawText: '姓名 张三',
          fieldCandidates: [{ id: 'fc-1', fieldKey: 'national_id_number', status: 'pending' }]
        })
      }
    })

    render(<DocumentEvidencePage fileId="file-1" />)
    expect(await screen.findByText('姓名 张三')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/documentEvidencePage.test.tsx`
Expected: FAIL because the pages do not exist.

**Step 3: Write minimal implementation**

Build:

- enrichment jobs list page
- document evidence detail page
- OCR text panel
- layout block list
- structured field candidate table

Keep the UI simple and evidence-first.

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/documentEvidencePage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/EnrichmentJobsPage.tsx src/renderer/pages/DocumentEvidencePage.tsx src/renderer/components/EnrichmentJobTable.tsx src/renderer/components/StructuredFieldCandidateTable.tsx src/renderer/components/OCRTextPanel.tsx src/renderer/components/LayoutBlockList.tsx src/renderer/components/ImageSummaryCard.tsx src/renderer/App.tsx tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/documentEvidencePage.test.tsx
git commit -m "feat: add phase three enrichment ui"
```

### Task 10: Add End-to-End Multimodal Review Flow and Final Docs

**Files:**
- Create: `tests/e2e/multimodal-review-flow.spec.ts`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-11-multimodal-evidence-enhancement-design.md`

**Step 1: Write the failing end-to-end test**

```ts
import { test, expect } from '@playwright/test'

test('reviews a high-risk OCR field and shows it on the person profile', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Enrichment Jobs').click()
  await page.getByText('Approve').click()
  await page.getByText('People').click()
  await expect(page.getByText('北京大学')).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts`
Expected: FAIL because the enrichment flow is not fully wired.

**Step 3: Write minimal implementation**

- Add deterministic phase-three test fixtures
- Ensure review queue can surface high-risk structured field candidates
- Ensure approved field consumption appears on person detail or search
- Update README with provider config and risk policy notes

**Step 4: Run full verification suite**

Run:

- `npm run test:unit`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
- `npm run test:e2e -- tests/e2e/person-review-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts`
- `npm run build`

Expected:

- all unit tests PASS
- all end-to-end tests PASS
- production build exits 0

**Step 5: Commit**

```bash
git add tests/e2e/multimodal-review-flow.spec.ts README.md docs/plans/2026-03-11-multimodal-evidence-enhancement-design.md
git commit -m "docs: finalize phase three multimodal handoff"
```

## Definition of Done

Phase three is ready for manual dogfooding when all of the following are true:

- document OCR jobs can run through a `LiteLLM` gateway
- ID card, driver license, and transcript files produce typed extraction results
- chat screenshots and image files produce generic enhancement evidence
- low-risk evidence auto-enters the enhancement layer
- high-risk structured fields enter the shared review queue
- approved field decisions can be undone
- search and person views can consume approved enhanced evidence
- unit tests, end-to-end flows, and production build all pass

## Deferred Work

Do not pull these into phase three:

- audio / video enhancement
- face recognition and clustering
- full graph-attribute redesign
- sync and backup
- persona or agent generation

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-11-multimodal-evidence-enhancement-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session in a git worktree with `superpowers:executing-plans`, then execute this plan task-by-task with checkpoints

If you want, I can do either next.
