# Phase 7A Person Dossier Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first evidence-first single-person dossier view so any approved canonical person can open a readable archive page composed from approved facts, timeline highlights, relationship context, and evidence backtrace entry points.

**Architecture:** Add a deterministic `personDossierService` in the main process that composes the existing canonical person, approved profile, timeline, and relationship graph reads into a rebuildable dossier read model. Expose that read model through the existing people IPC boundary, keep the renderer thin, and convert `PersonDetailPage` into a dossier container that renders typed sections without introducing any new write-side truth or persona simulation.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright, SQLite (`node:sqlite`), existing archive IPC + timeline/graph/profile services

---

## Assumptions

- Phase 6 is already complete on `main` and remains the stable baseline.
- Phase 7A only covers the single-person dossier baseline; `7B` conflict/gap deep dives and `7C` group portrait remain separate follow-up slices.
- The current `People -> PersonDetailPage` navigation stays in place; do not introduce a router rewrite for this slice.
- The dossier remains `local-first`, `evidence-first`, `undoable`, and `auditable`.
- Do not implement persona simulation, agent replacement, long-form LLM biography generation, or automatic relationship inference in this slice.

## Target Repository Changes

```text
docs/plans/2026-03-12-phase-seven-a-dossier-baseline-implementation-plan.md
src/main/ipc/peopleIpc.ts
src/main/services/personDossierService.ts
src/preload/index.ts
src/renderer/App.tsx
src/renderer/archiveApi.ts
src/renderer/components/PersonDossierView.tsx
src/renderer/pages/PersonDetailPage.tsx
src/shared/archiveContracts.ts
tests/e2e/operational-runner-profile-flow.spec.ts
tests/unit/main/personDossierService.test.ts
tests/unit/renderer/archiveApi.test.ts
tests/unit/renderer/personApprovedProfile.test.tsx
tests/unit/renderer/personDossierPage.test.tsx
tests/unit/shared/phaseSevenContracts.test.ts
```

## Scope Guardrails

In scope:

- `PersonDossier` read model
- typed display states: `approved_fact`, `derived_summary`, `open_conflict`, `coverage_gap`
- identity card
- thematic portrait sections derived from approved profile data
- timeline highlights derived from approved event clusters
- relationship summary derived from approved graph edges
- file-level evidence backtrace entry points

Out of scope:

- group portrait page
- conflict workbench shortcuts beyond lightweight evidence references
- replay / undo UI inside the dossier
- new database tables or snapshot persistence
- persona / voice / style simulation

### Task 1: Add dossier contracts and shared contract coverage

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Create: `tests/unit/shared/phaseSevenContracts.test.ts`

**Step 1: Write the failing shared contract test**

Add `tests/unit/shared/phaseSevenContracts.test.ts` with assertions like:

```ts
import { describe, expect, it } from 'vitest'
import { DOSSIER_DISPLAY_TYPES } from '../../../src/shared/archiveContracts'

describe('phase-seven dossier contracts', () => {
  it('exports stable dossier display types', () => {
    expect(DOSSIER_DISPLAY_TYPES).toEqual([
      'approved_fact',
      'derived_summary',
      'open_conflict',
      'coverage_gap'
    ])
  })
})
```

**Step 2: Run the shared contract test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: FAIL because `DOSSIER_DISPLAY_TYPES` and dossier contracts do not exist yet.

**Step 3: Add the dossier contract exports**

In `src/shared/archiveContracts.ts`, add the read-model types and constant:

```ts
export const DOSSIER_DISPLAY_TYPES = [
  'approved_fact',
  'derived_summary',
  'open_conflict',
  'coverage_gap'
] as const

export type DossierDisplayType = (typeof DOSSIER_DISPLAY_TYPES)[number]

export type PersonDossierEvidenceRef = {
  kind: 'file' | 'evidence' | 'candidate' | 'journal'
  id: string
  label: string
}

export type PersonDossierSectionItem = {
  id: string
  label: string
  value: string
  displayType: DossierDisplayType
  evidenceRefs: PersonDossierEvidenceRef[]
}

export type PersonDossierSection = {
  sectionKey: string
  title: string
  displayType: DossierDisplayType
  items: PersonDossierSectionItem[]
}
```

Also add the top-level `PersonDossier`, `PersonDossierIdentityCard`, `PersonDossierTimelineHighlight`, and `PersonDossierRelationshipSummary` types in the same file.

**Step 4: Re-run the shared contract test**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts tests/unit/shared/phaseSevenContracts.test.ts
git commit -m "feat: add phase 7 dossier contracts"
```

### Task 2: Add failing dossier service tests and implement the read model

**Files:**
- Create: `src/main/services/personDossierService.ts`
- Create: `tests/unit/main/personDossierService.test.ts`
- Modify: `src/shared/archiveContracts.ts`

**Step 1: Write the failing dossier service tests**

Create `tests/unit/main/personDossierService.test.ts` with two focused cases:

```ts
describe('getPersonDossier', () => {
  it('builds a dossier from approved person, timeline, and relationship reads', () => {
    const dossier = getPersonDossier(db, { canonicalPersonId: 'cp-1' })

    expect(dossier?.identityCard).toMatchObject({
      primaryDisplayName: 'Alice Chen',
      displayType: 'approved_fact',
      evidenceCount: 1
    })
    expect(dossier?.thematicSections).toContainEqual(
      expect.objectContaining({
        sectionKey: 'education',
        displayType: 'approved_fact'
      })
    )
    expect(dossier?.timelineHighlights[0]).toMatchObject({
      title: 'Approved event',
      displayType: 'approved_fact'
    })
    expect(dossier?.relationshipSummary[0]).toMatchObject({
      displayName: 'Bob',
      manualLabel: 'friend',
      sharedFileCount: 1
    })
  })

  it('emits coverage-gap placeholders when approved data is missing', () => {
    const dossier = getPersonDossier(db, { canonicalPersonId: 'cp-empty' })

    expect(dossier?.thematicSections).toContainEqual(
      expect.objectContaining({ displayType: 'coverage_gap' })
    )
  })
})
```

Seed the database exactly the same way the existing timeline and graph service tests do: approved canonical people, one approved event cluster, one approved edge label, and one approved profile attribute with `sourceFileId`, `sourceEvidenceId`, `sourceCandidateId`, and `approvedJournalId`.

**Step 2: Run the dossier service test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/personDossierService.test.ts
```

Expected: FAIL because `personDossierService.ts` and `getPersonDossier(...)` do not exist yet.

**Step 3: Implement the minimal dossier service**

Create `src/main/services/personDossierService.ts` and compose the existing read services:

```ts
export function getPersonDossier(db: ArchiveDatabase, input: { canonicalPersonId: string }): PersonDossier | null {
  const person = getCanonicalPerson(db, input)
  if (!person) {
    return null
  }

  const timeline = getPersonTimeline(db, input)
  const graph = getPersonGraph(db, input)

  return {
    person,
    identityCard: buildIdentityCard(person),
    thematicSections: buildThematicSections(person),
    timelineHighlights: buildTimelineHighlights(timeline),
    relationshipSummary: buildRelationshipSummary(graph),
    evidenceBacktrace: buildEvidenceBacktrace(person, timeline, graph)
  }
}
```

Implementation rules:

- Reuse `getCanonicalPerson`, `getPersonTimeline`, and `getPersonGraph`; do not duplicate their SQL.
- Keep the service deterministic and rebuildable from approved facts.
- Preserve a preferred section order: `identity`, `education`, `work`, `family`, `location`, `account`, `device`, `habit`, `routine`.
- When a section has no approved data, emit a single placeholder item with `displayType: 'coverage_gap'` and a user-facing message.
- For approved profile attributes, carry file / evidence / candidate / journal IDs forward as `evidenceRefs`.
- For relationship summary, prefer approved neighbors sorted by `sharedFileCount desc`, then `displayName asc`.

**Step 4: Run the dossier service tests plus adjacent regressions**

Run:

```bash
npm run test:unit -- tests/unit/main/personDossierService.test.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personDossierService.ts src/shared/archiveContracts.ts tests/unit/main/personDossierService.test.ts
git commit -m "feat: add person dossier read model"
```

### Task 3: Expose the dossier read model through IPC and renderer API

**Files:**
- Modify: `src/main/ipc/peopleIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing renderer API test**

Extend `tests/unit/renderer/archiveApi.test.ts` with:

```ts
it('exposes dossier reads in the fallback API', async () => {
  vi.stubGlobal('window', {})

  const archiveApi = getArchiveApi()

  await expect(archiveApi.getPersonDossier('cp-1')).resolves.toBeNull()
})
```

**Step 2: Run the renderer API test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because `ArchiveApi.getPersonDossier(...)` is not declared yet.

**Step 3: Add the dossier API method end to end**

Implement the new read method in all three layers:

```ts
// src/shared/archiveContracts.ts
export interface ArchiveApi {
  getPersonDossier: (canonicalPersonId: string) => Promise<PersonDossier | null>
}

// src/main/ipc/peopleIpc.ts
ipcMain.handle('archive:getPersonDossier', async (_event, payload) => {
  const { canonicalPersonId } = canonicalPersonIdSchema.parse(payload)
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)
  const dossier = getPersonDossier(db, { canonicalPersonId })
  db.close()
  return dossier
})

// src/preload/index.ts / src/renderer/archiveApi.ts
getPersonDossier: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonDossier', { canonicalPersonId })
```

Do not add a new schema for this slice; reuse `canonicalPersonIdSchema`.

**Step 4: Re-run the API test**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/main/personDossierService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/peopleIpc.ts src/preload/index.ts src/renderer/archiveApi.ts src/shared/archiveContracts.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose person dossier over ipc"
```

### Task 4: Add failing dossier page tests and migrate the old profile regression

**Files:**
- Create: `tests/unit/renderer/personDossierPage.test.tsx`
- Modify: `tests/unit/renderer/personApprovedProfile.test.tsx`

**Step 1: Write the new failing dossier page test**

Create `tests/unit/renderer/personDossierPage.test.tsx` with a stubbed dossier response:

```tsx
it('renders dossier sections and file-level evidence backtrace actions', async () => {
  const onOpenEvidenceFile = vi.fn()

  vi.stubGlobal('window', {
    archiveApi: {
      getPersonDossier: vi.fn().mockResolvedValue({
        person: { id: 'cp-1', primaryDisplayName: 'Alice Chen', evidenceCount: 1 },
        identityCard: { primaryDisplayName: 'Alice Chen', displayType: 'approved_fact', aliases: [], manualLabels: [], evidenceCount: 1, firstSeenAt: null, lastSeenAt: null },
        thematicSections: [{
          sectionKey: 'education',
          title: 'Education',
          displayType: 'approved_fact',
          items: [{
            id: 'education:school_name',
            label: 'school_name',
            value: '北京大学',
            displayType: 'approved_fact',
            evidenceRefs: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
          }]
        }],
        timelineHighlights: [],
        relationshipSummary: [],
        evidenceBacktrace: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
      })
    }
  })

  render(<PersonDetailPage canonicalPersonId="cp-1" onOpenEvidenceFile={onOpenEvidenceFile} />)

  expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()
  expect(screen.getByText('Identity Card')).toBeInTheDocument()
  expect(screen.getByText('Thematic Portrait')).toBeInTheDocument()
  expect(screen.getByText('北京大学')).toBeInTheDocument()
})
```

Add a second test in the same file that verifies a `coverage_gap` section renders an explicit empty-state message instead of a blank block.

**Step 2: Update the legacy profile regression to dossier wording**

In `tests/unit/renderer/personApprovedProfile.test.tsx`, switch the expectation from:

```ts
expect(await screen.findByText('Approved Profile')).toBeInTheDocument()
```

to dossier-era assertions such as:

```ts
expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()
expect(await screen.findByText('Thematic Portrait')).toBeInTheDocument()
```

**Step 3: Run the renderer dossier tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx
```

Expected: FAIL because `PersonDetailPage` still loads separate summary / timeline / graph reads and the dossier UI does not exist yet.

**Step 4: Commit the red tests only after the next task passes**

Do not commit yet. Carry these test changes into Task 5 and commit once the renderer is green.

### Task 5: Implement the dossier page baseline and wire evidence navigation

**Files:**
- Create: `src/renderer/components/PersonDossierView.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Implement the dossier renderer component**

Create `src/renderer/components/PersonDossierView.tsx` with sections in this order:

```tsx
export function PersonDossierView(props: {
  dossier: PersonDossier | null
  onOpenEvidenceFile?: (fileId: string) => void
}) {
  if (!props.dossier) {
    return <p>Select a person to open the dossier.</p>
  }

  return (
    <section>
      <h1>Person Dossier</h1>
      <section aria-label="Identity Card">{/* primary name, aliases, labels, first/last seen, evidence count */}</section>
      <section aria-label="Thematic Portrait">{/* themed approved profile sections */}</section>
      <section aria-label="Timeline Highlights">{/* approved events only */}</section>
      <section aria-label="Relationship Context">{/* approved neighbors + shared files + label */}</section>
      <section aria-label="Evidence Backtrace">{/* file refs as clickable buttons */}</section>
    </section>
  )
}
```

Rendering rules:

- Show a visible badge or inline label for every `displayType`.
- Render `coverage_gap` items as plain explanatory text, not empty `<ul>` containers.
- Only make `kind: 'file'` evidence refs clickable in 7A; render other refs as static chips or labels.
- Deduplicate file refs in the evidence backtrace section by `id`.

**Step 2: Convert `PersonDetailPage` into a dossier container**

Replace the three parallel page reads with a single dossier read:

```tsx
const [dossier, setDossier] = useState<PersonDossier | null>(null)

useEffect(() => {
  if (!props.canonicalPersonId) {
    setDossier(null)
    return
  }

  void archiveApi.getPersonDossier(props.canonicalPersonId).then(setDossier)
}, [archiveApi, props.canonicalPersonId])
```

Then render `PersonDossierView` instead of `PersonSummaryCard`, `PersonTimeline`, and `RelationshipGraph`.

**Step 3: Wire file-level evidence navigation from `App.tsx`**

Update the page invocation so the dossier can open the existing evidence page:

```tsx
{page === 'person' ? (
  <PersonDetailPage
    canonicalPersonId={selectedCanonicalPersonId}
    onOpenEvidenceFile={handleSelectEvidenceFile}
  />
) : null}
```

Do not add review or replay route wiring in this slice.

**Step 4: Run the focused renderer tests**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/peoplePage.test.tsx tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/PersonDossierView.tsx src/renderer/pages/PersonDetailPage.tsx tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/personDossierPage.test.tsx
git commit -m "feat: ship phase 7 dossier page baseline"
```

### Task 6: Refresh focused end-to-end coverage and run final verification

**Files:**
- Modify: `tests/e2e/operational-runner-profile-flow.spec.ts`

**Step 1: Update the person dossier end-to-end expectation**

Change the e2e assertions from legacy profile wording:

```ts
await expect(page.getByText('Approved Profile')).toBeVisible()
```

to dossier-baseline assertions:

```ts
await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
await expect(page.getByText('Thematic Portrait')).toBeVisible()
await expect(page.getByText('Evidence Backtrace')).toBeVisible()
```

**Step 2: Run the focused e2e dossier flow**

Run:

```bash
npm run build && playwright test tests/e2e/operational-runner-profile-flow.spec.ts
```

Expected: PASS

**Step 3: Run the final targeted verification bundle**

Follow `@verification-before-completion` and run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/personDossierService.test.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/peoplePage.test.tsx
npm run build
```

Expected: PASS

**Step 4: Review, audit, and commit**

Run `@requesting-code-review` if available, then record `@skill-tracker`, then commit:

```bash
git add tests/e2e/operational-runner-profile-flow.spec.ts
git add src/main/ipc/peopleIpc.ts src/main/services/personDossierService.ts src/preload/index.ts src/renderer/App.tsx src/renderer/archiveApi.ts src/renderer/components/PersonDossierView.tsx src/renderer/pages/PersonDetailPage.tsx src/shared/archiveContracts.ts tests/unit/main/personDossierService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/shared/phaseSevenContracts.test.ts
git commit -m "feat: add phase 7a person dossier baseline"
```

**Step 5: Clean handoff check**

Run:

```bash
git status --short
```

Expected: no unexpected changes remain.
