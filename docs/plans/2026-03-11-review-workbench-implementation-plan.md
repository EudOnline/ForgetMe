# Review Workbench Phase 5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-item review workbench for `structured_field_candidate` and `profile_attribute_candidate` that shows evidence trace, formal-profile impact preview, and safe approve/reject/undo actions.

**Architecture:** Keep the existing review write path (`review_queue`, `decision_journal`, approval services) intact and add phase-five read/preview services on top. The new UI should consume one aggregated workbench payload instead of stitching multiple IPC calls in the renderer.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, Playwright

---

### Task 1: Add Phase-Five Contracts for Review Workbench Reads

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseFiveContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { reviewWorkbenchItemSchema, reviewWorkbenchFilterSchema } from '../../../src/shared/ipcSchemas'

describe('phase-five workbench schemas', () => {
  it('accepts queue-item detail input', () => {
    expect(reviewWorkbenchItemSchema.parse({ queueItemId: 'rq-1' })).toBeTruthy()
  })

  it('accepts workbench filter input', () => {
    expect(reviewWorkbenchFilterSchema.parse({ itemType: 'structured_field_candidate', hasConflict: true })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseFiveContracts.test.ts`  
Expected: FAIL because the phase-five schemas and contracts do not exist.

**Step 3: Write minimal implementation**

Add new shared contracts for:

- `ReviewWorkbenchListItem`
- `ReviewWorkbenchDetail`
- `ReviewImpactPreview`
- `ReviewEvidenceTrace`

Add new schemas for:

- `reviewWorkbenchItemSchema`
- `reviewWorkbenchFilterSchema`

Do not add batch-review contracts yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseFiveContracts.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseFiveContracts.test.ts
git commit -m "feat: add review workbench contracts"
```

### Task 2: Build the Review Impact Engine

**Files:**
- Create: `src/main/services/reviewImpactService.ts`
- Test: `tests/unit/main/reviewImpactService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildReviewImpactPreview } from '../../../src/main/services/reviewImpactService'

describe('buildReviewImpactPreview', () => {
  it('shows a projected formal attribute when a structured field can deterministically project', () => {
    const result = buildReviewImpactPreview(db, { queueItemId: 'rq-structured-1' })
    expect(result.approveImpact.kind).toBe('project_formal_attribute')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewImpactService.test.ts`  
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `buildReviewImpactPreview(db, { queueItemId })`
- `approveImpact`
- `rejectImpact`
- `undoImpact`

Support only:

- `structured_field_candidate`
- `profile_attribute_candidate`

Preview should describe:

- affected canonical person
- new / conflicting / unchanged formal attribute
- source evidence and candidate references

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewImpactService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/reviewImpactService.ts tests/unit/main/reviewImpactService.test.ts
git commit -m "feat: add review impact preview engine"
```

### Task 3: Add Evidence Trace Aggregation for Review Items

**Files:**
- Create: `src/main/services/reviewEvidenceTraceService.ts`
- Test: `tests/unit/main/reviewEvidenceTraceService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getReviewEvidenceTrace } from '../../../src/main/services/reviewEvidenceTraceService'

describe('getReviewEvidenceTrace', () => {
  it('returns source file, evidence, and upstream candidate context for a profile candidate', () => {
    const result = getReviewEvidenceTrace(db, { queueItemId: 'rq-profile-1' })
    expect(result.sourceFile?.fileId).toBe('f-1')
    expect(result.sourceEvidence?.evidenceId).toBe('ee-1')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewEvidenceTraceService.test.ts`  
Expected: FAIL because the trace service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `getReviewEvidenceTrace(db, { queueItemId })`

Return a normalized trace object containing:

- `queueItem`
- `candidate`
- `sourceFile`
- `sourceEvidence`
- `sourceCandidate`
- `sourceJournal`

Do not try to handle merge/event candidates in this phase.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewEvidenceTraceService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/reviewEvidenceTraceService.ts tests/unit/main/reviewEvidenceTraceService.test.ts
git commit -m "feat: add review evidence trace service"
```

### Task 4: Build the Review Workbench Read Model

**Files:**
- Create: `src/main/services/reviewWorkbenchReadService.ts`
- Test: `tests/unit/main/reviewWorkbenchReadService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getReviewWorkbenchItem, listReviewWorkbenchItems } from '../../../src/main/services/reviewWorkbenchReadService'

describe('review workbench read model', () => {
  it('returns a structured workbench payload for a single queue item', () => {
    const result = getReviewWorkbenchItem(db, { queueItemId: 'rq-1' })
    expect(result.impactPreview.approveImpact.kind).toBeTruthy()
    expect(result.trace.sourceFile?.fileId).toBe('f-1')
  })

  it('lists structured and profile items with basic filters', () => {
    const result = listReviewWorkbenchItems(db, { itemType: 'structured_field_candidate' })
    expect(result[0]?.itemType).toBe('structured_field_candidate')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`  
Expected: FAIL because the read service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `listReviewWorkbenchItems(db, filter)`
- `getReviewWorkbenchItem(db, { queueItemId })`

Compose these from:

- queue item metadata
- candidate summary
- evidence trace
- impact preview
- current formal profile context

Keep filtering minimal:

- `itemType`
- `status`
- `canonicalPersonId`
- `fieldKey`
- `hasConflict`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/reviewWorkbenchReadService.ts tests/unit/main/reviewWorkbenchReadService.test.ts
git commit -m "feat: add review workbench read service"
```

### Task 5: Expose Workbench Reads Through IPC and Renderer API

**Files:**
- Modify: `src/main/ipc/reviewIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseFiveContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { reviewWorkbenchItemSchema } from '../../../src/shared/ipcSchemas'

describe('phase-five IPC wiring', () => {
  it('parses review workbench item input', () => {
    expect(reviewWorkbenchItemSchema.parse({ queueItemId: 'rq-1' })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseFiveContracts.test.ts`  
Expected: FAIL if the IPC schemas or contracts are incomplete.

**Step 3: Write minimal implementation**

Add handlers for:

- `archive:listReviewWorkbenchItems`
- `archive:getReviewWorkbenchItem`

Expose corresponding methods in:

- preload API
- renderer fallback API
- shared archive contracts

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseFiveContracts.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/reviewIpc.ts src/preload/index.ts src/renderer/archiveApi.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseFiveContracts.test.ts
git commit -m "feat: expose review workbench ipc"
```

### Task 6: Add the Single-Item Review Workbench Page

**Files:**
- Create: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Create: `src/renderer/components/ReviewWorkbenchSidebar.tsx`
- Create: `src/renderer/components/ReviewCandidateSummaryCard.tsx`
- Create: `src/renderer/components/ReviewEvidenceTraceCard.tsx`
- Modify: `src/renderer/pages/ReviewQueuePage.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

describe('ReviewWorkbenchPage', () => {
  it('shows candidate detail, source evidence, and impact preview', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listReviewWorkbenchItems: vi.fn().mockResolvedValue([]),
        getReviewWorkbenchItem: vi.fn().mockResolvedValue({
          queueItem: { id: 'rq-1', itemType: 'structured_field_candidate' },
          candidate: { attributeKey: 'school_name', displayValue: '北京大学' },
          trace: { sourceFile: { fileName: 'transcript.pdf' } },
          impactPreview: { approveImpact: { kind: 'project_formal_attribute' } }
        })
      }
    })

    render(<ReviewWorkbenchPage />)
    expect(await screen.findByText('北京大学')).toBeInTheDocument()
    expect(await screen.findByText('project_formal_attribute')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`  
Expected: FAIL because the page and components do not exist.

**Step 3: Write minimal implementation**

Implement a three-pane workbench:

- left: list/navigation
- center: candidate + evidence trace
- right: impact preview

Update app navigation so the review page can open the dedicated workbench.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchPage.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ReviewWorkbenchPage.tsx src/renderer/components/ReviewWorkbenchSidebar.tsx src/renderer/components/ReviewCandidateSummaryCard.tsx src/renderer/components/ReviewEvidenceTraceCard.tsx src/renderer/pages/ReviewQueuePage.tsx src/renderer/App.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx
git commit -m "feat: add single-item review workbench"
```

### Task 7: Add Impact Preview Cards and Inline Review Actions

**Files:**
- Create: `src/renderer/components/ReviewImpactPreviewCard.tsx`
- Create: `src/renderer/components/ReviewActionBar.tsx`
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Test: `tests/unit/renderer/reviewWorkbenchActions.test.tsx`

**Step 1: Write the failing test**

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

describe('ReviewWorkbenchPage actions', () => {
  it('shows approve, reject, and undo actions next to impact preview', async () => {
    const approveReviewItem = vi.fn().mockResolvedValue({ status: 'approved' })
    vi.stubGlobal('window', { archiveApi: { approveReviewItem, rejectReviewItem: vi.fn(), undoDecision: vi.fn(), listReviewWorkbenchItems: vi.fn().mockResolvedValue([]), getReviewWorkbenchItem: vi.fn().mockResolvedValue(/* fixture */) } })

    render(<ReviewWorkbenchPage />)
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchActions.test.tsx`  
Expected: FAIL because the action area does not exist.

**Step 3: Write minimal implementation**

Add:

- action buttons beside impact preview
- refresh after approve / reject / undo
- stale-state handling if the selected queue item is no longer pending

Do not add batch actions yet.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/reviewWorkbenchActions.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ReviewImpactPreviewCard.tsx src/renderer/components/ReviewActionBar.tsx src/renderer/pages/ReviewWorkbenchPage.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx
git commit -m "feat: add review workbench action panel"
```

### Task 8: Add Workbench End-to-End Flow and Final Docs

**Files:**
- Create: `tests/e2e/review-workbench-single-item-flow.spec.ts`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-11-review-workbench-design.md`

**Step 1: Write the failing end-to-end test**

```ts
import { test, expect, _electron as electron } from '@playwright/test'

test('opens a structured-field review item in the workbench and shows impact preview', async () => {
  const electronApp = await electron.launch({ args: ['out/main/index.js'], env: process.env })
  const page = await electronApp.firstWindow()
  await page.getByText('Review Queue').click()
  await page.getByText('structured_field_candidate').click()
  await expect(page.getByText('Impact Preview')).toBeVisible()
  await expect(page.getByText('北京大学')).toBeVisible()
  await electronApp.close()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/review-workbench-single-item-flow.spec.ts`  
Expected: FAIL because the review workbench flow is not wired.

**Step 3: Write minimal implementation**

Add a deterministic E2E fixture proving:

- a pending structured field item appears in review queue
- the workbench opens on that item
- impact preview renders
- approve and undo both refresh the visible state correctly

Update docs with operator notes and scope boundary.

**Step 4: Run full verification suite**

Run:

- `npm run test:unit`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
- `npm run test:e2e -- tests/e2e/person-review-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/operational-runner-profile-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/review-workbench-single-item-flow.spec.ts`
- `npm run build`

Expected:

- all unit tests PASS
- all phase-one to phase-five end-to-end flows PASS
- production build exits 0

**Step 5: Commit**

```bash
git add tests/e2e/review-workbench-single-item-flow.spec.ts README.md docs/plans/2026-03-11-review-workbench-design.md
git commit -m "docs: finalize review workbench phase five handoff"
```

## Definition of Done

Phase 5 single-item workbench is ready for dogfooding when all of the following are true:

- `structured_field_candidate` and `profile_attribute_candidate` can both open in one dedicated workbench
- the workbench shows source evidence, candidate summary, and formal-profile impact preview
- approve / reject / undo actions remain backed by the existing journaled write path
- stale or missing trace state is surfaced explicitly instead of silently failing
- renderer tests, unit tests, end-to-end flows, and production build all pass

## Deferred Work

Do not pull these into this plan:

- batch review execution
- merge/event candidate workbench support
- automatic approval suggestions
- keyboard-heavy productivity shortcuts
- persona, voice, or simulation features

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-11-review-workbench-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
