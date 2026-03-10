# People Timeline & Relationship Graph Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build phase two of ForgetMe so approved canonical people gain a person-centered dual-layer timeline and relationship graph, while merge and event-cluster candidates flow through a review queue with full journaled undo support.

**Architecture:** Extend the existing archive database with explicit canonical-person, candidate, event-cluster, and decision-journal tables. Keep candidate generation, approval, and undo in the main-process service layer, and make all timeline and graph views read only from approved state so formal views never show unreviewed inferences.

**Tech Stack:** Electron, React, TypeScript, Node `node:sqlite`, Zod, Vitest, Playwright, existing ForgetMe archive services

---

## Assumptions

- Phase one is already merged on `main` and verified.
- This plan should be executed in an isolated git worktree created with `@superpowers:using-git-worktrees`.
- Phase two remains local-first; no cloud sync work is included here.
- Automatic reasoning is intentionally conservative and explainable; rules beat opaque heuristics in this phase.
- Formal UI must only show approved canonical people, approved event clusters, and approved relationship edges.

## Execution Prerequisites

- Create a dedicated worktree before implementation.
- Use `@superpowers:test-driven-development` for each task.
- Use `@superpowers:verification-before-completion` before claiming any task or batch is complete.
- Keep commits small and aligned to task boundaries.

## Target Repository Changes

```text
src/main/services/
  canonicalPeopleService.ts
  candidateService.ts
  reviewQueueService.ts
  timelineService.ts
  graphService.ts
  journalService.ts
  migrations/003_people_timeline_graph.sql
src/main/ipc/
  peopleIpc.ts
  reviewIpc.ts
src/renderer/pages/
  PeoplePage.tsx
  PersonDetailPage.tsx
  ReviewQueuePage.tsx
src/renderer/components/
  PersonList.tsx
  PersonSummaryCard.tsx
  PersonTimeline.tsx
  EventTimeline.tsx
  EvidenceTimeline.tsx
  RelationshipGraph.tsx
  ReviewQueueTable.tsx
  CandidateDiffCard.tsx
  UndoHistoryTable.tsx
src/shared/
  archiveContracts.ts
  ipcSchemas.ts
tests/unit/main/
  canonicalPeopleService.test.ts
  candidateService.test.ts
  reviewQueueService.test.ts
  timelineService.test.ts
  graphService.test.ts
tests/unit/renderer/
  peoplePage.test.tsx
  reviewQueuePage.test.tsx
tests/e2e/
  person-review-flow.spec.ts
```

## Scope Guardrails

In scope:

- canonical people
- merge candidates
- event-cluster candidates
- review queue
- approval / rejection / undo
- person-centered timeline
- relationship graph side view
- manual relationship labels

Out of scope:

- social-relation auto inference
- graph layout polish beyond a usable MVP
- OCR / audio / video enrichment
- agent generation
- collaboration / multi-user review

### Task 1: Add Phase-Two Schema for Canonical People, Candidates, Events, and Journals

**Files:**
- Create: `src/main/services/migrations/003_people_timeline_graph.sql`
- Modify: `src/main/services/db.ts`
- Test: `tests/unit/main/dbPhaseTwo.test.ts`

**Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-two migrations', () => {
  it('creates canonical people and review tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase2-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'canonical_people',
      'person_aliases',
      'person_merge_candidates',
      'event_clusters',
      'event_cluster_candidates',
      'review_queue',
      'decision_journal'
    ]))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPhaseTwo.test.ts`
Expected: FAIL because migration `003_people_timeline_graph.sql` does not exist.

**Step 3: Write minimal implementation**

Create `003_people_timeline_graph.sql` with tables for:

- `canonical_people`
- `person_aliases`
- `person_memberships`
- `person_merge_candidates`
- `event_clusters`
- `event_cluster_members`
- `event_cluster_evidence`
- `event_cluster_candidates`
- `review_queue`
- `decision_journal`

Also add indexes on:

- candidate status
- canonical person status
- event cluster time range
- review queue item type / status

Keep `db.ts` migration loading logic unchanged unless new ordering is required.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPhaseTwo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/003_people_timeline_graph.sql src/main/services/db.ts tests/unit/main/dbPhaseTwo.test.ts
git commit -m "feat: add phase two archive schema"
```

### Task 2: Introduce Canonical People and Membership Mapping

**Files:**
- Create: `src/main/services/canonicalPeopleService.ts`
- Modify: `src/main/services/peopleService.ts`
- Test: `tests/unit/main/canonicalPeopleService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { chooseCanonicalPersonName } from '../../../src/main/services/canonicalPeopleService'

describe('chooseCanonicalPersonName', () => {
  it('prefers the most informative approved alias as canonical display name', () => {
    const result = chooseCanonicalPersonName([
      { displayName: 'A', sourceType: 'chat_participant', confidence: 0.8 },
      { displayName: 'Alice Chen', sourceType: 'manual', confidence: 1 }
    ])

    expect(result).toBe('Alice Chen')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/canonicalPeopleService.test.ts`
Expected: FAIL because `canonicalPeopleService.ts` does not exist.

**Step 3: Write minimal implementation**

Implement in `canonicalPeopleService.ts`:

```ts
export function chooseCanonicalPersonName(aliases: Array<{ displayName: string; sourceType: string; confidence: number }>) {
  return aliases
    .slice()
    .sort((left, right) => right.displayName.length - left.displayName.length || right.confidence - left.confidence)[0]?.displayName ?? 'Unknown Person'
}
```

Also add service helpers to:

- create canonical people for existing anchors
- map anchor-level `people` rows to canonical people through membership rows
- leave existing `people` rows intact as evidence anchors, not formal identities

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/canonicalPeopleService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/canonicalPeopleService.ts src/main/services/peopleService.ts tests/unit/main/canonicalPeopleService.test.ts
git commit -m "feat: add canonical people mapping"
```

### Task 3: Generate Person Merge Candidates with Explainable Rules

**Files:**
- Create: `src/main/services/candidateService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Test: `tests/unit/main/candidateService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildPersonMergeCandidates } from '../../../src/main/services/candidateService'

describe('buildPersonMergeCandidates', () => {
  it('creates a pending merge candidate when two anchors share a normalized name', () => {
    const candidates = buildPersonMergeCandidates({
      people: [
        { personId: 'p1', displayName: 'Alice Chen' },
        { personId: 'p2', displayName: 'alice chen' }
      ]
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe('pending')
    expect(candidates[0].matchedRules).toContain('normalized_name_exact')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/candidateService.test.ts`
Expected: FAIL because candidate service does not exist.

**Step 3: Write minimal implementation**

Implement:

- normalized-name rule
- shared-contact-fragment rule placeholder
- stable-co-occurrence rule placeholder
- candidate persistence with:
  - `confidence`
  - `matched_rules`
  - `supporting_evidence_json`
  - `status = pending`

Wire candidate generation into import completion so every import can enqueue new review candidates without auto-applying them.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/candidateService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/candidateService.ts src/main/services/importBatchService.ts tests/unit/main/candidateService.test.ts
git commit -m "feat: generate person merge candidates"
```

### Task 4: Generate Event-Cluster Candidates from Time and Shared Evidence

**Files:**
- Modify: `src/main/services/candidateService.ts`
- Create: `tests/unit/main/eventClusterCandidateService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildEventClusterCandidates } from '../../../src/main/services/candidateService'

describe('buildEventClusterCandidates', () => {
  it('groups nearby evidence into a pending event-cluster candidate', () => {
    const candidates = buildEventClusterCandidates({
      evidence: [
        { fileId: 'f1', occurredAt: '2026-03-10T10:00:00.000Z', people: ['p1'] },
        { fileId: 'f2', occurredAt: '2026-03-10T10:10:00.000Z', people: ['p1', 'p2'] }
      ]
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe('pending')
    expect(candidates[0].evidenceFileIds).toEqual(['f1', 'f2'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/eventClusterCandidateService.test.ts`
Expected: FAIL because event-cluster candidate generation is not implemented.

**Step 3: Write minimal implementation**

Add an event-candidate builder that:

- groups evidence in a limited time window
- requires overlapping approved or anchor-level people
- writes candidate rows and review-queue rows
- stores proposed time range and evidence membership

Do not auto-create `event_clusters` yet; only create candidates.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/eventClusterCandidateService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/candidateService.ts tests/unit/main/eventClusterCandidateService.test.ts
git commit -m "feat: generate event cluster candidates"
```

### Task 5: Build Review Queue Approve / Reject / Undo Operations

**Files:**
- Create: `src/main/services/journalService.ts`
- Create: `src/main/services/reviewQueueService.ts`
- Test: `tests/unit/main/reviewQueueService.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { approveMergeCandidate, undoDecision } from '../../../src/main/services/reviewQueueService'

describe('approveMergeCandidate', () => {
  it('creates a journaled merge decision that can be undone', async () => {
    const approved = await approveMergeCandidate({ candidateId: 'candidate-1', actor: 'local-user' })
    expect(approved.status).toBe('approved')

    const undone = await undoDecision({ journalId: approved.journalId, actor: 'local-user' })
    expect(undone.status).toBe('undone')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/reviewQueueService.test.ts`
Expected: FAIL because review-queue service does not exist.

**Step 3: Write minimal implementation**

Implement transaction-safe operations for:

- approve merge candidate
- reject merge candidate
- approve event-cluster candidate
- reject event-cluster candidate
- undo approved merge
- undo approved event-cluster decision

Every approval must:

- update candidate status
- write `decision_journal`
- write `undo_payload_json`
- update canonical memberships or formal event-cluster rows
- update review queue status

Every undo must reverse the exact formal write and mark journal rows undone.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/reviewQueueService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/journalService.ts src/main/services/reviewQueueService.ts tests/unit/main/reviewQueueService.test.ts
git commit -m "feat: add review queue approvals and undo"
```

### Task 6: Build Approved Timeline and Graph Read Models

**Files:**
- Create: `src/main/services/timelineService.ts`
- Create: `src/main/services/graphService.ts`
- Modify: `src/main/services/searchService.ts`
- Test: `tests/unit/main/timelineService.test.ts`
- Test: `tests/unit/main/graphService.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { getPersonTimeline } from '../../../src/main/services/timelineService'
import { getPersonGraph } from '../../../src/main/services/graphService'

describe('getPersonTimeline', () => {
  it('returns approved event clusters with nested evidence points', async () => {
    const timeline = await getPersonTimeline({ canonicalPersonId: 'cp-1' })
    expect(timeline[0].eventId).toBeDefined()
    expect(timeline[0].evidence.length).toBeGreaterThan(0)
  })
})

describe('getPersonGraph', () => {
  it('returns approved evidence edges and manual labels only', async () => {
    const graph = await getPersonGraph({ canonicalPersonId: 'cp-1' })
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.edges.every((edge) => edge.status === 'approved')).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts`
Expected: FAIL because timeline and graph services do not exist.

**Step 3: Write minimal implementation**

Implement approved-only read models:

- `getPeopleList()` for canonical people
- `getPersonTimeline()` returning event nodes with evidence children
- `getPersonGraph()` returning nodes, approved evidence edges, and manual labels
- `setRelationshipLabel()` for manual edge labels

Ensure unapproved candidates never appear in these read models.

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/timelineService.ts src/main/services/graphService.ts src/main/services/searchService.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts
git commit -m "feat: add approved timeline and graph queries"
```

### Task 7: Expose IPC Contracts for People, Review, Timeline, and Graph

**Files:**
- Create: `src/main/ipc/peopleIpc.ts`
- Create: `src/main/ipc/reviewIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Test: `tests/unit/shared/phaseTwoContracts.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { reviewActionSchema } from '../../../src/shared/ipcSchemas'

describe('phase-two IPC schemas', () => {
  it('accepts approve and undo review actions', () => {
    expect(reviewActionSchema.parse({ action: 'approve', queueItemId: 'rq-1' })).toBeTruthy()
    expect(reviewActionSchema.parse({ action: 'undo', journalId: 'dj-1' })).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/phaseTwoContracts.test.ts`
Expected: FAIL because the new contracts and schemas do not exist.

**Step 3: Write minimal implementation**

Expose IPC handlers for:

- `listCanonicalPeople`
- `getCanonicalPerson`
- `getPersonTimeline`
- `getPersonGraph`
- `listReviewQueue`
- `approveReviewItem`
- `rejectReviewItem`
- `undoDecision`
- `setRelationshipLabel`

Validate payloads with `zod` and add corresponding shared response types.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/shared/phaseTwoContracts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/peopleIpc.ts src/main/ipc/reviewIpc.ts src/main/index.ts src/preload/index.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseTwoContracts.test.ts
git commit -m "feat: expose phase two IPC contracts"
```

### Task 8: Build People, Review Queue, Timeline, and Graph UI

**Files:**
- Create: `src/renderer/pages/PeoplePage.tsx`
- Create: `src/renderer/pages/PersonDetailPage.tsx`
- Create: `src/renderer/pages/ReviewQueuePage.tsx`
- Create: `src/renderer/components/PersonList.tsx`
- Create: `src/renderer/components/PersonSummaryCard.tsx`
- Create: `src/renderer/components/PersonTimeline.tsx`
- Create: `src/renderer/components/EventTimeline.tsx`
- Create: `src/renderer/components/EvidenceTimeline.tsx`
- Create: `src/renderer/components/RelationshipGraph.tsx`
- Create: `src/renderer/components/ReviewQueueTable.tsx`
- Create: `src/renderer/components/CandidateDiffCard.tsx`
- Create: `src/renderer/components/UndoHistoryTable.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/peoplePage.test.tsx`
- Test: `tests/unit/renderer/reviewQueuePage.test.tsx`

**Step 1: Write the failing tests**

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PeoplePage } from '../../../src/renderer/pages/PeoplePage'

describe('PeoplePage', () => {
  it('shows approved people and opens person detail navigation affordance', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listCanonicalPeople: vi.fn().mockResolvedValue([{ id: 'cp-1', primaryDisplayName: 'Alice Chen', evidenceCount: 4 }])
      }
    })

    render(<PeoplePage />)
    expect(await screen.findByText('Alice Chen')).toBeInTheDocument()
  })
})
```

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewQueuePage } from '../../../src/renderer/pages/ReviewQueuePage'

describe('ReviewQueuePage', () => {
  it('shows pending review items only', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listReviewQueue: vi.fn().mockResolvedValue([{ id: 'rq-1', itemType: 'person_merge', status: 'pending' }])
      }
    })

    render(<ReviewQueuePage />)
    expect(await screen.findByText('person_merge')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/renderer/peoplePage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx`
Expected: FAIL because the pages and components do not exist.

**Step 3: Write minimal implementation**

Build:

- People list page with approved people only
- Person detail page with summary, dual-layer timeline, graph tab, and evidence drill-down
- Review queue page with approve / reject actions
- Undo history page or panel for journaled actions

UI rules:

- formal views never show pending candidates
- review queue always shows candidate rationale and impact preview
- graph panel starts simple (node list + edge list) before visual polish

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/renderer/peoplePage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/PeoplePage.tsx src/renderer/pages/PersonDetailPage.tsx src/renderer/pages/ReviewQueuePage.tsx src/renderer/components/PersonList.tsx src/renderer/components/PersonSummaryCard.tsx src/renderer/components/PersonTimeline.tsx src/renderer/components/EventTimeline.tsx src/renderer/components/EvidenceTimeline.tsx src/renderer/components/RelationshipGraph.tsx src/renderer/components/ReviewQueueTable.tsx src/renderer/components/CandidateDiffCard.tsx src/renderer/components/UndoHistoryTable.tsx src/renderer/App.tsx tests/unit/renderer/peoplePage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
git commit -m "feat: add people timeline and review UI"
```

### Task 9: Add End-to-End Review Flow and Update Docs

**Files:**
- Create: `tests/e2e/person-review-flow.spec.ts`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-10-people-timeline-graph-design.md`

**Step 1: Write the failing end-to-end test**

```ts
import { test, expect } from '@playwright/test'

test('approves a merge candidate and shows the result on the canonical person timeline', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Review Queue').click()
  await page.getByText('Approve').click()
  await page.getByText('People').click()
  await expect(page.getByText('Alice Chen')).toBeVisible()
})
```

**Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/person-review-flow.spec.ts`
Expected: FAIL because phase-two review flow is not fully wired.

**Step 3: Write minimal implementation**

- Add deterministic seed data or fixture import support for phase-two review items in test mode.
- Update `README.md` with:
  - review queue concepts
  - approved-only formal views
  - undo semantics
  - manual relationship labels
- Update the phase-two design doc with implementation notes if the actual shape differs from the original design.

**Step 4: Run the full verification suite**

Run:
- `npm run test:unit`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts`
- `npm run test:e2e -- tests/e2e/person-review-flow.spec.ts`
- `npm run build`

Expected:
- all unit tests PASS
- both end-to-end tests PASS
- production build exits 0

**Step 5: Commit**

```bash
git add tests/e2e/person-review-flow.spec.ts README.md docs/plans/2026-03-10-people-timeline-graph-design.md
git commit -m "docs: finalize phase two handoff"
```

## Definition of Done

Phase two is ready for manual dogfooding when all of the following are true:

- approved canonical people appear in a dedicated people list
- each canonical person has a dual-layer timeline with approved event clusters and nested evidence points
- relationship graph view shows approved evidence edges and manual labels
- merge and event-cluster candidates enter a review queue instead of mutating formal state directly
- approve / reject actions are journaled
- approved actions can be undone with a recorded reverse operation
- pending candidates never appear in formal views
- unit tests, end-to-end review flow, and production build all pass

## Deferred Work

Do not pull these into phase two:

- automatic social-role inference
- visual graph layout optimization
- image face clustering
- OCR-driven event enrichment
- agent memory synthesis
- conversational persona generation
- collaboration workflows

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-10-people-timeline-graph-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session in a git worktree with `superpowers:executing-plans`, then execute this plan task-by-task with checkpoints

If you want, I can do either next.
