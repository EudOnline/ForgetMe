# Phase 8A Memory Workspace Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first evidence-grounded memory workspace so users can ask natural-language questions in global, person-scoped, and group-scoped contexts, receive a deterministic grounded answer with citations and uncertainty markers, and open that workspace from top-level navigation plus dossier / group portrait entry points.

**Architecture:** Add a new `memoryWorkspaceService` in the main process that assembles scope-specific context packs from existing read models (`PersonDossier`, `GroupPortrait`, review state, decision journal, approved people reads) and produces a deterministic answer object without writing new truth data or requiring a remote LLM. Expose this through a dedicated IPC/API surface, keep renderer state ephemeral for 8A, and render a new `MemoryWorkspacePage` that shows the answer, context cards, and clickable citations.

**Tech Stack:** Electron IPC, React renderer, TypeScript, SQLite-backed read services, Vitest, Playwright.

---

## Scope Decisions

- `8A` **does include**: global / person / group scoped ask flow, context pack assembly, deterministic answer text, citations, uncertainty / conflict / coverage markers, top-nav entry, dossier entry, group portrait entry.
- `8A` **does not include**: persisted conversation history, multi-turn memory, remote provider synthesis, persona simulation, advice-mode, agent-mode, writing answers back into truth tables.
- The first slice should prefer **deterministic answer synthesis** over remote models. If a question cannot be answered confidently from the selected context pack, the answer must degrade into a bounded “insufficient evidence / unresolved conflict” response instead of guessing.

---

### Task 1: Add shared contracts and ask input schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/phaseEightContracts.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/shared/phaseEightContracts.test.ts` covering these new contracts:

```ts
type MemoryWorkspaceScope =
  | { kind: 'global' }
  | { kind: 'person'; canonicalPersonId: string }
  | { kind: 'group'; anchorPersonId: string }

type MemoryWorkspaceCitation = {
  citationId: string
  kind: 'person' | 'group' | 'file' | 'journal' | 'review'
  targetId: string
  label: string
}

type MemoryWorkspaceContextCard = {
  cardId: string
  title: string
  body: string
  displayType: 'approved_fact' | 'derived_summary' | 'open_conflict' | 'coverage_gap'
  citations: MemoryWorkspaceCitation[]
}

type MemoryWorkspaceAnswer = {
  summary: string
  displayType: 'approved_fact' | 'derived_summary' | 'open_conflict' | 'coverage_gap'
  citations: MemoryWorkspaceCitation[]
}

type MemoryWorkspaceResponse = {
  scope: MemoryWorkspaceScope
  question: string
  title: string
  answer: MemoryWorkspaceAnswer
  contextCards: MemoryWorkspaceContextCard[]
}
```

Also cover:

```ts
type AskMemoryWorkspaceInput = {
  scope: MemoryWorkspaceScope
  question: string
}
```

And assert `ArchiveApi` includes:

```ts
askMemoryWorkspace: (input: AskMemoryWorkspaceInput) => Promise<MemoryWorkspaceResponse | null>
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because `MemoryWorkspace*` contracts and schemas do not exist yet.

**Step 3: Write minimal implementation**

Add the new shared types to `src/shared/archiveContracts.ts` and corresponding Zod schemas to `src/shared/ipcSchemas.ts`:

- `memoryWorkspaceScopeSchema`
- `askMemoryWorkspaceInputSchema`

Keep the first slice intentionally small:

- no persistence ids
- no streaming
- no provider settings in the public contract yet

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseEightContracts.test.ts
git commit -m "feat: add phase 8a memory workspace contracts"
```

---

### Task 2: Add failing service tests for deterministic context-pack assembly

**Files:**
- Create: `src/main/services/memoryWorkspaceService.ts`
- Create: `tests/unit/main/memoryWorkspaceService.test.ts`
- Reference: `src/main/services/personDossierService.ts`
- Reference: `src/main/services/groupPortraitService.ts`
- Reference: `src/main/services/reviewWorkbenchReadService.ts`
- Reference: `src/main/services/journalService.ts`
- Reference: `src/main/services/timelineService.ts`

**Step 1: Write the failing test**

Create `tests/unit/main/memoryWorkspaceService.test.ts` with three scenarios:

1. **person-scoped ask**

```ts
it('builds a person-scoped grounded answer from dossier facts and open conflicts', () => {
  const result = askMemoryWorkspace(db, {
    scope: { kind: 'person', canonicalPersonId: 'cp-1' },
    question: '她现在有哪些还没解决的冲突？'
  })

  expect(result?.title).toBe('Memory Workspace · Alice Chen')
  expect(result?.answer.displayType).toBe('open_conflict')
  expect(result?.answer.summary).toContain('school_name')
  expect(result?.contextCards.map((card) => card.title)).toContain('Conflicts & Gaps')
  expect(result?.contextCards.some((card) => card.citations.some((citation) => citation.kind === 'review'))).toBe(true)
})
```

2. **group-scoped ask**

```ts
it('builds a group-scoped grounded answer from portrait summary and timeline windows', () => {
  const result = askMemoryWorkspace(db, {
    scope: { kind: 'group', anchorPersonId: 'cp-1' },
    question: '这个群体最近一起发生过什么？'
  })

  expect(result?.title).toBe('Memory Workspace · Alice Chen Group')
  expect(result?.answer.summary).toContain('Trip planning')
  expect(result?.contextCards.map((card) => card.title)).toContain('Timeline Windows')
  expect(result?.contextCards.map((card) => card.title)).toContain('Summary')
})
```

3. **global-scoped ask**

```ts
it('builds a global-scoped grounded answer from approved people, groups, and review pressure', () => {
  const result = askMemoryWorkspace(db, {
    scope: { kind: 'global' },
    question: '现在档案库里最值得优先关注的是什么？'
  })

  expect(result?.title).toBe('Memory Workspace · Global')
  expect(result?.contextCards.map((card) => card.title)).toEqual(
    expect.arrayContaining(['People Overview', 'Group Overview', 'Review Pressure'])
  )
  expect(result?.answer.summary).toContain('pending')
})
```

Also add one null-path test:

```ts
expect(askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'missing' },
  question: 'hi'
})).toBeNull()
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts
```

Expected: FAIL because `askMemoryWorkspace(...)` does not exist yet.

**Step 3: Write minimal implementation**

Create `src/main/services/memoryWorkspaceService.ts` with these exports:

```ts
export function buildGlobalContextPack(db: ArchiveDatabase, question: string): MemoryWorkspaceResponse
export function buildPersonContextPack(db: ArchiveDatabase, canonicalPersonId: string, question: string): MemoryWorkspaceResponse | null
export function buildGroupContextPack(db: ArchiveDatabase, anchorPersonId: string, question: string): MemoryWorkspaceResponse | null
export function askMemoryWorkspace(db: ArchiveDatabase, input: AskMemoryWorkspaceInput): MemoryWorkspaceResponse | null
```

Implementation rules:

- **Person scope** reuses `getPersonDossier(db, { canonicalPersonId })`
- **Group scope** reuses `getGroupPortrait(db, { canonicalPersonId: anchorPersonId })`
- **Global scope** reuses `getPeopleList(db)`, `listGroupPortraits(db)`, `listReviewWorkbenchItems(db, { status: 'pending' })`, `listReviewConflictGroups(db)`, and recent `listDecisionJournal(db)`
- Build deterministic `contextCards`
- Build deterministic `answer.summary` with small question-intent routing:
  - if question contains `冲突`, `conflict`, `不确定`, prefer ambiguity/conflict card
  - if question contains `最近`, `timeline`, `时间`, `发生`, prefer timeline / recent events card
  - otherwise prefer top summary / overview card
- If no confident card exists, return a `coverage_gap` answer that says evidence is currently insufficient

Keep the first slice free of remote model calls.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceService.ts tests/unit/main/memoryWorkspaceService.test.ts
git commit -m "feat: add memory workspace context pack service"
```

---

### Task 3: Expose the ask API through IPC, preload, and renderer API

**Files:**
- Create: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

Extend `tests/unit/renderer/archiveApi.test.ts`:

```ts
await expect(archiveApi.askMemoryWorkspace({
  scope: { kind: 'global' },
  question: '现在最值得关注什么？'
})).resolves.toBeNull()
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because `askMemoryWorkspace` is missing from the fallback API.

**Step 3: Write minimal implementation**

Add a dedicated IPC module instead of overloading `peopleIpc.ts` or `searchIpc.ts`.

`src/main/ipc/memoryWorkspaceIpc.ts` should:

- register `archive:askMemoryWorkspace`
- parse input with `askMemoryWorkspaceInputSchema`
- open the SQLite db
- call `askMemoryWorkspace(db, input)`
- close db and return the response

Then:

- register it in `src/main/index.ts`
- expose it through `src/preload/index.ts`
- add fallback and IPC wiring in `src/renderer/archiveApi.ts`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/main/index.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose memory workspace ask api"
```

---

### Task 4: Add the Memory Workspace page and renderer tests

**Files:**
- Create: `src/renderer/components/MemoryWorkspaceView.tsx`
- Create: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Create: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Write the failing test**

Create `tests/unit/renderer/memoryWorkspacePage.test.tsx` with scenarios:

1. **global scope ask**

```tsx
render(
  <MemoryWorkspacePage
    scope={{ kind: 'global' }}
  />
)

fireEvent.change(screen.getByLabelText('Ask memory workspace'), { target: { value: '现在最值得关注什么？' } })
fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

expect(await screen.findByRole('heading', { name: 'Memory Workspace' })).toBeInTheDocument()
expect(screen.getByText('Memory Workspace · Global')).toBeInTheDocument()
expect(screen.getByText('Review Pressure')).toBeInTheDocument()
```

2. **citation rendering**

Assert file / person / group citations render as buttons when handlers are supplied.

3. **empty state**

Assert the page shows a scope-specific prompt before the first question is submitted.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the page does not exist yet.

**Step 3: Write minimal implementation**

Create `MemoryWorkspacePage` and `MemoryWorkspaceView` with:

- page-level question input
- scope-aware prompt
- `Ask` button
- answer block
- context card list
- citation buttons

Renderer behavior:

- no persistence yet
- local state only
- one latest response shown at a time
- disable `Ask` when question is empty

Navigation wiring in `src/renderer/App.tsx`:

- add a new page state: `'memory-workspace'`
- add `selectedMemoryWorkspaceScope`
- top-nav `Memory Workspace` opens `{ kind: 'global' }`
- page props should support:
  - `onOpenPerson`
  - `onOpenGroup`
  - `onOpenEvidenceFile`
  - `onOpenReviewHistory`

For 8A, clicking a `journal` citation can reuse the existing review-queue replay path by setting:

- `selectedReviewHistoryQuery`
- `selectedReviewHistoryJournalId`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/App.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add memory workspace page baseline"
```

---

### Task 5: Add dossier / portrait entry points into Memory Workspace

**Files:**
- Modify: `src/renderer/components/PersonDossierView.tsx`
- Modify: `src/renderer/components/GroupPortraitView.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Modify: `src/renderer/pages/GroupPortraitPage.tsx`
- Modify: `tests/unit/renderer/personDossierPage.test.tsx`
- Modify: `tests/unit/renderer/groupPortraitPage.test.tsx`

**Step 1: Write the failing test**

Extend `tests/unit/renderer/personDossierPage.test.tsx`:

```tsx
const onOpenMemoryWorkspace = vi.fn()

render(
  <PersonDetailPage
    canonicalPersonId="cp-1"
    onOpenMemoryWorkspace={onOpenMemoryWorkspace}
  />
)

fireEvent.click(await screen.findByRole('button', { name: 'Open memory workspace' }))
expect(onOpenMemoryWorkspace).toHaveBeenCalledWith({ kind: 'person', canonicalPersonId: 'cp-1' })
```

Extend `tests/unit/renderer/groupPortraitPage.test.tsx`:

```tsx
const onOpenMemoryWorkspace = vi.fn()

render(
  <GroupPortraitPage
    canonicalPersonId="cp-1"
    onOpenMemoryWorkspace={onOpenMemoryWorkspace}
  />
)

fireEvent.click(await screen.findByRole('button', { name: 'Open memory workspace' }))
expect(onOpenMemoryWorkspace).toHaveBeenCalledWith({ kind: 'group', anchorPersonId: 'cp-1' })
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
```

Expected: FAIL because the new buttons / props do not exist yet.

**Step 3: Write minimal implementation**

Add `Open memory workspace` buttons:

- `PersonDossierView` opens person scope
- `GroupPortraitView` opens group scope

Plumb the new callback through:

- `PersonDetailPage`
- `GroupPortraitPage`
- `App.tsx`

App behavior:

- set `selectedMemoryWorkspaceScope`
- switch to `page === 'memory-workspace'`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/PersonDossierView.tsx src/renderer/components/GroupPortraitView.tsx src/renderer/pages/PersonDetailPage.tsx src/renderer/pages/GroupPortraitPage.tsx src/renderer/App.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
git commit -m "feat: add memory workspace entry points"
```

---

### Task 6: Add end-to-end coverage for the baseline flow

**Files:**
- Create: `tests/e2e/memory-workspace-flow.spec.ts`
- Modify: `tests/e2e/group-portrait-flow.spec.ts`
- Modify: `tests/e2e/operational-runner-profile-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Write the failing e2e test**

Create `tests/e2e/memory-workspace-flow.spec.ts` covering:

1. import the existing group portrait fixture
2. open top-nav `Memory Workspace`
3. ask a global question
4. verify answer + context cards render
5. open `People`, then `Alice Chen`, then `Open memory workspace`
6. ask a person-scoped question
7. verify conflict-aware answer appears
8. open `Group Portrait`, then a group portrait card
9. click `Open memory workspace`
10. ask a group-scoped question
11. verify timeline / summary cards and citation buttons

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-flow.spec.ts
```

Expected: FAIL because the page and flows do not exist yet.

**Step 3: Write minimal implementation refinements**

Polish only what the e2e requires:

- nav button text
- empty-state copy
- disabled state during ask
- stable heading labels
- deterministic context card ordering

Do not add persistence, streaming, or model settings in this slice.

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-flow.spec.ts tests/e2e/group-portrait-flow.spec.ts
```

Expected: all PASS

**Step 5: Update the design doc status**

Add a short note to `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md` saying:

- `8A` baseline now uses deterministic answer synthesis
- conversation persistence remains `8B`
- context pack export remains `8C`
- quality / guardrails deepening remains `8D`

**Step 6: Commit**

```bash
git add tests/e2e/memory-workspace-flow.spec.ts tests/e2e/group-portrait-flow.spec.ts tests/e2e/operational-runner-profile-flow.spec.ts docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md
git commit -m "feat: verify phase 8a memory workspace baseline"
```

---

## Implementation Notes

- Prefer adding a new dedicated service file (`memoryWorkspaceService.ts`) instead of stuffing this logic into `personDossierService.ts`, `groupPortraitService.ts`, or renderer-side code.
- Keep all answer generation deterministic in `8A`. Remote model synthesis can be layered later behind the same `MemoryWorkspaceResponse` shape.
- Reuse existing route-opening patterns already present in `App.tsx` for:
  - file navigation
  - review replay history
  - person detail
  - group portrait
- Avoid new persistence tables in `8A`; keep interaction state in-memory until `8B`.
- If a question is broad, prefer a bounded answer that summarizes currently available evidence plus unresolved ambiguity rather than attempting semantic search over the whole vault.

## Final Verification Checklist

- `Memory Workspace` top-nav page opens and supports `global` scope
- `Person Dossier` can open a person-scoped workspace
- `Group Portrait` can open a group-scoped workspace
- Answers degrade safely on low coverage
- Open conflicts are surfaced in the answer text
- Citations are visible and clickable
- No remote LLM dependency is required for the baseline
- No new truth-writing path is introduced

