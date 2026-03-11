# Operational Runner & Profile Projection Phase 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build phase four of ForgetMe so pending multimodal enrichment jobs are executed automatically by a local runner, and approved evidence can be attributed and projected into a formal person-profile read model without breaking the existing audit / review / undo boundaries.

**Architecture:** Extend phase three with a runner loop, attempt-level execution records, deterministic attribution rules, profile attribute projection, and profile-level review candidates. Reuse the shared review queue and decision journal for any ambiguous or conflict-prone profile writes, and keep person detail consumption evidence-linked.

**Tech Stack:** Electron, React, TypeScript, Node `node:sqlite`, Zod, Vitest, Playwright, existing phase-two review/journal services, existing phase-three enrichment services, `LiteLLM`

---

## Assumptions

- Phase one, phase two, and phase three are already merged on `main` and verified.
- Phase four stays local-first and desktop-first.
- Existing phase-three services remain the source of truth for OCR / image normalization and risk routing.
- New profile-level writes must remain reversible and journaled.
- Do not build persona / agent logic in this phase.

## Execution Prerequisites

- Create a dedicated worktree before implementation.
- Use `@superpowers:test-driven-development` for every task.
- Use `@superpowers:verification-before-completion` before claiming any task is complete.
- Keep commits small and aligned to task boundaries.

## Target Repository Changes

```text
src/main/services/
  migrations/005_operational_runner_profile_projection.sql
  enrichmentRunnerService.ts
  enrichmentExecutionService.ts
  profileAttributionService.ts
  profileProjectionService.ts
  profileCandidateReviewService.ts
src/main/ipc/
  enrichmentIpc.ts
  peopleIpc.ts
src/renderer/pages/
  EnrichmentJobsPage.tsx
  PersonDetailPage.tsx
src/renderer/components/
  EnrichmentJobTable.tsx
  PersonSummaryCard.tsx
  ReviewQueueTable.tsx
src/shared/
  archiveContracts.ts
  ipcSchemas.ts
tests/unit/main/
  dbPhaseFour.test.ts
  enrichmentRunnerService.test.ts
  enrichmentExecutionService.test.ts
  profileAttributionService.test.ts
  profileProjectionService.test.ts
  profileCandidateReviewService.test.ts
tests/unit/renderer/
  personApprovedProfile.test.tsx
  enrichmentJobsPage.test.tsx
tests/e2e/
  operational-runner-profile-flow.spec.ts
README.md
```

## Scope Guardrails

In scope:

- local enrichment runner
- attempt-level execution logs
- deterministic person attribution rules
- approved profile read model
- shared review-queue integration for profile candidates
- person detail approved profile sections

Out of scope:

- persona agents
- audio / video enhancement
- face clustering
- cloud sync / collaboration
- broad graph redesign

### Task 1: Add Phase-Four Schema for Attempts and Profile Projection

**Files:**
- Create: `src/main/services/migrations/005_operational_runner_profile_projection.sql`
- Test: `tests/unit/main/dbPhaseFour.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-four migrations', () => {
  it('creates runner and profile projection tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase4-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'enrichment_attempts',
      'person_profile_attributes',
      'profile_attribute_candidates'
    ]))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPhaseFour.test.ts`  
Expected: FAIL because the phase-four migration does not exist.

**Step 3: Write minimal implementation**

Create the migration with:

- `enrichment_attempts`
- `person_profile_attributes`
- `profile_attribute_candidates`
- indexes for job status, canonical person lookup, candidate status

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPhaseFour.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/005_operational_runner_profile_projection.sql tests/unit/main/dbPhaseFour.test.ts
git commit -m "feat: add phase four schema"
```

### Task 2: Build the Local Enrichment Runner Core

**Files:**
- Create: `src/main/services/enrichmentRunnerService.ts`
- Test: `tests/unit/main/enrichmentRunnerService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { claimNextEnrichmentJob } from '../../../src/main/services/enrichmentRunnerService'

describe('claimNextEnrichmentJob', () => {
  it('claims the oldest pending job and marks it processing', () => {
    const result = claimNextEnrichmentJob(db)
    expect(result?.status).toBe('processing')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichmentRunnerService.test.ts`  
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `claimNextEnrichmentJob(db)`
- `completeEnrichmentJob(db, ...)`
- `failEnrichmentJob(db, ...)`
- `appendEnrichmentAttempt(db, ...)`

Use transactions to avoid double-claiming jobs.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichmentRunnerService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/enrichmentRunnerService.ts tests/unit/main/enrichmentRunnerService.test.ts
git commit -m "feat: add enrichment runner core"
```

### Task 3: Orchestrate Real Job Execution Through Existing Phase-Three Services

**Files:**
- Create: `src/main/services/enrichmentExecutionService.ts`
- Modify: `src/main/services/documentOcrService.ts`
- Modify: `src/main/services/imageUnderstandingService.ts`
- Test: `tests/unit/main/enrichmentExecutionService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { executeEnrichmentJob } from '../../../src/main/services/enrichmentExecutionService'

describe('executeEnrichmentJob', () => {
  it('routes document jobs into OCR persistence', async () => {
    const result = await executeEnrichmentJob({ job, file })
    expect(result.status).toBe('completed')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichmentExecutionService.test.ts`  
Expected: FAIL because the execution service does not exist.

**Step 3: Write minimal implementation**

Implement a thin orchestrator that:

- loads the file path for a job
- calls `callLiteLLM(...)`
- normalizes response payload into document or image extraction
- persists artifacts / evidence / candidates using the existing phase-three services
- returns execution status and usage

Do not redesign extraction schemas in this task.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichmentExecutionService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/enrichmentExecutionService.ts src/main/services/documentOcrService.ts src/main/services/imageUnderstandingService.ts tests/unit/main/enrichmentExecutionService.test.ts
git commit -m "feat: orchestrate enrichment execution"
```

### Task 4: Wire the Runner Into App Lifecycle

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/services/enrichmentRunnerService.ts`
- Test: `tests/unit/main/enrichmentRunnerService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createEnrichmentRunner } from '../../../src/main/services/enrichmentRunnerService'

describe('createEnrichmentRunner', () => {
  it('starts a polling loop and can stop cleanly', async () => {
    const runner = createEnrichmentRunner({ appPaths })
    expect(runner.stop).toBeTypeOf('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/enrichmentRunnerService.test.ts`  
Expected: FAIL because the lifecycle API is incomplete.

**Step 3: Write minimal implementation**

Add:

- `createEnrichmentRunner({ appPaths, intervalMs, concurrency })`
- app startup registration in `src/main/index.ts`
- graceful stop on app shutdown

Keep concurrency conservative and local.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/enrichmentRunnerService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/index.ts src/main/services/enrichmentRunnerService.ts tests/unit/main/enrichmentRunnerService.test.ts
git commit -m "feat: wire enrichment runner to app lifecycle"
```

### Task 5: Add Deterministic Attribution Rules

**Files:**
- Create: `src/main/services/profileAttributionService.ts`
- Test: `tests/unit/main/profileAttributionService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveApprovedFieldAttribution } from '../../../src/main/services/profileAttributionService'

describe('resolveApprovedFieldAttribution', () => {
  it('auto-resolves when a file is linked to exactly one canonical person', () => {
    const result = resolveApprovedFieldAttribution(db, { evidenceId: 'ee-1' })
    expect(result.mode).toBe('auto_project')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/profileAttributionService.test.ts`  
Expected: FAIL because the attribution service does not exist.

**Step 3: Write minimal implementation**

Implement rules in this order:

- single canonical person linked to the source file -> auto project
- unique alias match from approved name field -> auto project
- otherwise -> create profile candidate proposal

Do not add fuzzy matching in phase four.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/profileAttributionService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/profileAttributionService.ts tests/unit/main/profileAttributionService.test.ts
git commit -m "feat: add profile attribution rules"
```

### Task 6: Build Profile Projection and Candidate Queueing

**Files:**
- Create: `src/main/services/profileProjectionService.ts`
- Modify: `src/main/services/enrichmentReviewService.ts`
- Test: `tests/unit/main/profileProjectionService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { projectApprovedFieldToProfile } from '../../../src/main/services/profileProjectionService'

describe('projectApprovedFieldToProfile', () => {
  it('writes a formal profile attribute for deterministic approved fields', () => {
    const result = projectApprovedFieldToProfile(db, { evidenceId: 'ee-1' })
    expect(result.status).toBe('projected')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/profileProjectionService.test.ts`  
Expected: FAIL because the projection service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `projectApprovedFieldToProfile(...)`
- `queueProfileAttributeCandidate(...)`
- hook projection refresh after `approveStructuredFieldCandidate(...)`
- do not auto-overwrite conflicting singleton-like attributes; queue candidate instead

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/profileProjectionService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/profileProjectionService.ts src/main/services/enrichmentReviewService.ts tests/unit/main/profileProjectionService.test.ts
git commit -m "feat: project approved fields into profile read model"
```

### Task 7: Extend Shared Review Flow for Profile Attribute Candidates

**Files:**
- Create: `src/main/services/profileCandidateReviewService.ts`
- Modify: `src/main/services/reviewQueueService.ts`
- Test: `tests/unit/main/profileCandidateReviewService.test.ts`
- Test: `tests/unit/main/reviewQueueService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { approveReviewItem } from '../../../src/main/services/reviewQueueService'

describe('review queue profile candidate approvals', () => {
  it('approves a profile attribute candidate into formal profile state', () => {
    const result = approveReviewItem(db, { queueItemId: 'rq-profile-1', actor: 'local-user' })
    expect(result.status).toBe('approved')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/profileCandidateReviewService.test.ts tests/unit/main/reviewQueueService.test.ts`  
Expected: FAIL because review routing does not support `profile_attribute_candidate`.

**Step 3: Write minimal implementation**

Implement:

- approve / reject / undo for `profile_attribute_candidate`
- formal write into `person_profile_attributes`
- shared `decision_journal` entries
- queue routing in `reviewQueueService.ts`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/profileCandidateReviewService.test.ts tests/unit/main/reviewQueueService.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/profileCandidateReviewService.ts src/main/services/reviewQueueService.ts tests/unit/main/profileCandidateReviewService.test.ts tests/unit/main/reviewQueueService.test.ts
git commit -m "feat: support profile attribute review flow"
```

### Task 8: Expose Approved Profile and Runner State Through IPC

**Files:**
- Modify: `src/main/ipc/enrichmentIpc.ts`
- Modify: `src/main/ipc/peopleIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseFourContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { enrichmentAttemptFilterSchema } from '../../../src/shared/ipcSchemas'

describe('phase-four IPC schemas', () => {
  it('accepts enrichment attempt filters', () => {
    expect(enrichmentAttemptFilterSchema.parse({ jobId: 'job-1' })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseFourContracts.test.ts`  
Expected: FAIL because phase-four contracts do not exist.

**Step 3: Write minimal implementation**

Expose handlers for:

- `listEnrichmentAttempts`
- `listPersonProfileAttributes`
- `listProfileAttributeCandidates`
- `approveProfileAttributeCandidate`
- `rejectProfileAttributeCandidate`
- `undoProfileAttributeDecision`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseFourContracts.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/enrichmentIpc.ts src/main/ipc/peopleIpc.ts src/preload/index.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseFourContracts.test.ts
git commit -m "feat: expose phase four ipc contracts"
```

### Task 9: Upgrade Person Detail and Jobs UI for Formal Profile Operations

**Files:**
- Modify: `src/renderer/pages/EnrichmentJobsPage.tsx`
- Modify: `src/renderer/components/EnrichmentJobTable.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Modify: `src/renderer/components/PersonSummaryCard.tsx`
- Modify: `src/renderer/components/ReviewQueueTable.tsx`
- Test: `tests/unit/renderer/enrichmentJobsPage.test.tsx`
- Test: `tests/unit/renderer/personApprovedProfile.test.tsx`

**Step 1: Write the failing tests**

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PersonDetailPage } from '../../../src/renderer/pages/PersonDetailPage'

describe('PersonDetailPage approved profile', () => {
  it('shows formal approved profile sections', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        getCanonicalPerson: vi.fn().mockResolvedValue({
          id: 'cp-1',
          primaryDisplayName: 'Alice Chen',
          normalizedName: 'alice chen',
          aliasCount: 1,
          firstSeenAt: null,
          lastSeenAt: null,
          status: 'approved',
          evidenceCount: 1,
          manualLabels: [],
          aliases: [],
          approvedProfile: {
            education: [{ attributeKey: 'school_name', displayValue: '北京大学' }]
          }
        }),
        getPersonTimeline: vi.fn().mockResolvedValue([]),
        getPersonGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-1" />)
    expect(await screen.findByText('北京大学')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx`  
Expected: FAIL because the UI does not yet show attempts / formal profile sections.

**Step 3: Write minimal implementation**

Upgrade UI to show:

- attempt status / last error / rerun history on jobs page
- grouped approved profile sections on person detail
- profile candidate rows in review queue

Keep the UI evidence-first and simple.

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/EnrichmentJobsPage.tsx src/renderer/components/EnrichmentJobTable.tsx src/renderer/pages/PersonDetailPage.tsx src/renderer/components/PersonSummaryCard.tsx src/renderer/components/ReviewQueueTable.tsx tests/unit/renderer/enrichmentJobsPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx
git commit -m "feat: show approved profiles and runner state"
```

### Task 10: Add End-to-End Runner-to-Profile Flow and Final Docs

**Files:**
- Create: `tests/e2e/operational-runner-profile-flow.spec.ts`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-11-operational-runner-profile-projection-design.md`

**Step 1: Write the failing end-to-end test**

```ts
import { test, expect } from '@playwright/test'

test('runner executes a queued job and approved profile appears on the person page', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Enrichment Jobs').click()
  await expect(page.getByText('completed')).toBeVisible()
  await page.getByText('People').click()
  await expect(page.getByText('北京大学')).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/operational-runner-profile-flow.spec.ts`  
Expected: FAIL because runner-driven profile projection is not fully wired.

**Step 3: Write minimal implementation**

Add deterministic phase-four fixture flow proving:

- pending job is consumed by runner
- approved field becomes profile attribute or profile candidate
- person detail reads formal profile section

Update docs with runner operational notes and profile projection rules.

**Step 4: Run full verification suite**

Run:

- `npm run test:unit`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
- `npm run test:e2e -- tests/e2e/person-review-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts`
- `npm run test:e2e -- tests/e2e/operational-runner-profile-flow.spec.ts`
- `npm run build`

Expected:

- all unit tests PASS
- all end-to-end flows PASS
- production build exits 0

**Step 5: Commit**

```bash
git add tests/e2e/operational-runner-profile-flow.spec.ts README.md docs/plans/2026-03-11-operational-runner-profile-projection-design.md
git commit -m "docs: finalize phase four runner handoff"
```

## Definition of Done

Phase four is ready for manual dogfooding when all of the following are true:

- queued enrichment jobs are automatically executed by a local runner
- every execution attempt is persisted and inspectable
- deterministic approved fields can be attributed to a canonical person
- ambiguous or conflicting profile writes enter the shared review queue
- approved profile attributes appear on person detail as formal grouped sections
- profile-level approvals and undos remain journaled and reversible
- unit tests, end-to-end flows, and production build all pass

## Deferred Work

Do not pull these into phase four:

- persona or agent generation
- conversational style simulation
- audio / video pipelines
- face recognition and clustering
- cloud sync and collaboration

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-11-operational-runner-profile-projection-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session in a git worktree with `superpowers:executing-plans`, then execute this plan task-by-task with checkpoints

Which approach?
