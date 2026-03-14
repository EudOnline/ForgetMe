# Phase 7B Dossier Conflicts & Coverage Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Phase 7A person dossier so it explicitly shows pending review pressure, open field conflicts, and coverage gaps, with direct shortcuts into the existing review workbench.

**Architecture:** Keep `PersonDossier` as a deterministic read model rebuilt from approved facts plus existing review/read-side summaries. Reuse `listReviewInboxPeople(...)`, `listReviewConflictGroups(...)`, `listReviewWorkbenchItems(...)`, `getPersonTimeline(...)`, and `getPersonGraph(...)` to derive conflict and gap summaries instead of adding new truth tables, then render one new `Conflicts & Gaps` block in the dossier view with lightweight workbench entry points.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright, existing dossier/review workbench IPC stack, SQLite (`node:sqlite`)

---

## Assumptions

- Phase 7A dossier baseline is already implemented and verified on branch `codex/phase7a-dossier-baseline`.
- Phase 7B only covers single-person dossier conflict/gap visibility and dossier → workbench shortcuts.
- Group portrait work remains Phase 7C and is out of scope here.
- The review workbench remains the canonical place to approve/reject/undo; the dossier only summarizes and links.

## Target Repository Changes

```text
docs/plans/2026-03-12-phase-seven-b-conflicts-gaps-implementation-plan.md
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
tests/unit/renderer/personDossierPage.test.tsx
tests/unit/shared/phaseSevenContracts.test.ts
```

## Scope Guardrails

In scope:

- dossier-level pending review summary
- dossier-level field conflict summary
- coverage-gap summaries for sparse thematic sections, no timeline, and no relationship context
- typed `open_conflict` and `coverage_gap` rendering
- dossier shortcut buttons into filtered review workbench state

Out of scope:

- automatic approval from dossier
- replay detail UI inside dossier
- group portrait
- new review queue tables or persistence
- LLM-written explanations

### Task 1: Extend dossier contracts for conflicts, gaps, and shortcuts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseSevenContracts.test.ts`

**Step 1: Write the failing shared contract tests**

Add assertions that `PersonDossier` now carries:

- `conflictSummary`
- `coverageGaps`
- `reviewShortcuts`

Example:

```ts
expectTypeOf<PersonDossier['conflictSummary']>().toEqualTypeOf<PersonDossierConflictSummary[]>()
expectTypeOf<PersonDossier['coverageGaps']>().toEqualTypeOf<PersonDossierGapSummary[]>()
expectTypeOf<PersonDossier['reviewShortcuts']>().toEqualTypeOf<PersonDossierReviewShortcut[]>()
```

Also add a runtime assertion that new section display types still use `open_conflict` and `coverage_gap` exactly.

**Step 2: Run the shared contract test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: FAIL because the new dossier summary types do not exist yet.

**Step 3: Add the minimal shared types**

Add:

```ts
export type PersonDossierConflictSummary = {
  fieldKey: string | null
  title: string
  pendingCount: number
  distinctValues: string[]
  displayType: 'open_conflict'
}

export type PersonDossierGapSummary = {
  gapKey: string
  title: string
  detail: string
  displayType: 'coverage_gap'
}

export type PersonDossierReviewShortcut = {
  label: string
  canonicalPersonId: string
  fieldKey?: string
  hasConflict?: boolean
}
```

Extend `PersonDossier` with these arrays.

**Step 4: Re-run the shared contract test**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts tests/unit/shared/phaseSevenContracts.test.ts
git commit -m "feat: add phase 7b dossier summary contracts"
```

### Task 2: Add failing dossier service tests for conflicts and gaps

**Files:**
- Modify: `tests/unit/main/personDossierService.test.ts`

**Step 1: Write the failing tests**

Add one test proving a dossier with pending review items gets conflict summaries and workbench shortcuts:

```ts
expect(dossier?.conflictSummary[0]).toMatchObject({
  fieldKey: 'school_name',
  pendingCount: 2,
  distinctValues: ['北京大学', '清华大学'],
  displayType: 'open_conflict'
})
expect(dossier?.reviewShortcuts).toContainEqual(
  expect.objectContaining({
    canonicalPersonId: 'cp-1',
    fieldKey: 'school_name',
    hasConflict: true
  })
)
```

Add a second test proving sparse dossiers expose explicit gap summaries:

```ts
expect(dossier?.coverageGaps).toContainEqual(
  expect.objectContaining({ gapKey: 'timeline.empty', displayType: 'coverage_gap' })
)
expect(dossier?.coverageGaps).toContainEqual(
  expect.objectContaining({ gapKey: 'relationships.empty', displayType: 'coverage_gap' })
)
```

Seed pending review items using the same review-workbench fixtures already used in `tests/unit/main/reviewWorkbenchReadService.test.ts`.

**Step 2: Run the dossier service tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/personDossierService.test.ts
```

Expected: FAIL because the dossier service does not derive conflict/gap summaries yet.

**Step 3: Implement the minimal read-model derivation**

In `src/main/services/personDossierService.ts`:

- load `listReviewInboxPeople(db)` and `listReviewConflictGroups(db)`
- load `listReviewWorkbenchItems(db, { status: 'pending', canonicalPersonId })`
- derive person-scoped conflict groups
- derive gap summaries when:
  - a preferred thematic section is only placeholder coverage
  - `timelineHighlights.length === 0`
  - `relationshipSummary.length === 0`
- create `reviewShortcuts` from conflict groups plus a general “Open pending review” shortcut

Do not compute confidence scores or auto-rank by heuristics beyond count and sort order.

**Step 4: Run the dossier service tests plus adjacent review regressions**

Run:

```bash
npm run test:unit -- tests/unit/main/personDossierService.test.ts tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personDossierService.ts tests/unit/main/personDossierService.test.ts src/shared/archiveContracts.ts
git commit -m "feat: derive dossier conflicts and gaps"
```

### Task 3: Add dossier-to-workbench API and renderer tests

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/personDossierPage.test.tsx`

**Step 1: Write the failing renderer tests**

Add a dossier page test that expects:

- a `Conflicts & Gaps` section heading
- visible pending-review counts
- a clickable shortcut button such as `Open school_name conflicts`
- callback invocation with a workbench filter payload

Example:

```tsx
fireEvent.click(screen.getByRole('button', { name: /Open school_name conflicts/ }))
expect(onOpenReviewWorkbench).toHaveBeenCalledWith({
  canonicalPersonId: 'cp-1',
  fieldKey: 'school_name',
  hasConflict: true
})
```

Extend `archiveApi.test.ts` only if a new helper is introduced; otherwise keep IPC unchanged and drive navigation locally from dossier data.

**Step 2: Run the renderer tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the dossier UI does not render the new block or shortcut actions yet.

**Step 3: Implement the renderer wiring**

Update `PersonDossierView.tsx` to render:

- `Conflicts & Gaps`
- conflict cards / rows
- gap rows
- shortcut buttons

Update `App.tsx` and `PersonDetailPage.tsx` so dossier shortcut clicks route into `ReviewWorkbenchPage` by setting:

- page = `review-workbench`
- `selectedReviewWorkbenchQueueItemId = null`

and a new filter state if needed, or the lightest possible prop extension to `ReviewWorkbenchPage`.

**Step 4: Re-run the focused renderer suite**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/PersonDossierView.tsx src/renderer/pages/PersonDetailPage.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx
git commit -m "feat: render dossier conflicts and gaps"
```

### Task 4: Refresh end-to-end coverage and final verification

**Files:**
- Modify: `tests/e2e/operational-runner-profile-flow.spec.ts`

**Step 1: Add the failing end-to-end expectations**

Extend the existing dossier e2e to assert:

- `Conflicts & Gaps` appears after creating conflicting pending review items
- the dossier still shows `Thematic Portrait`
- clicking a dossier shortcut lands in the review workbench with conflict-focused content

**Step 2: Run the e2e test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/operational-runner-profile-flow.spec.ts
```

Expected: FAIL because the conflict/gap block and shortcut routing are not live yet.

**Step 3: Implement the minimal fixture/UI support**

Only add the smallest fixture/data and UI changes needed for the test to pass. Do not broaden the e2e scenario into batch approval or replay behavior.

**Step 4: Run the final verification bundle**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/personDossierService.test.ts tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx
npm run build
npx playwright test tests/e2e/operational-runner-profile-flow.spec.ts
```

Expected: PASS

**Step 5: Review, audit, and commit**

Run `@verification-before-completion`, then `@skill-tracker`, then commit:

```bash
git add docs/plans/2026-03-12-phase-seven-b-conflicts-gaps-implementation-plan.md src/shared/archiveContracts.ts src/main/services/personDossierService.ts src/renderer/components/PersonDossierView.tsx src/renderer/pages/PersonDetailPage.tsx src/renderer/App.tsx src/renderer/archiveApi.ts src/preload/index.ts tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/personDossierService.test.ts tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/archiveApi.test.ts tests/e2e/operational-runner-profile-flow.spec.ts
git commit -m "feat: add phase 7b dossier conflicts and gaps"
```
