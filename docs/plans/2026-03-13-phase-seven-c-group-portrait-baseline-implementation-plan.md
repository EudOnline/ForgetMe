# Phase 7C Group Portrait Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first lightweight group portrait page so a person dossier can open a stable, evidence-first multi-person summary composed from approved members, shared events, relationship density, central people ranking, and unresolved ambiguity counts.

**Architecture:** Keep `GroupPortrait` as a deterministic read model rebuilt from existing approved relationship, membership, event-cluster, and review-workbench reads. Anchor the portrait on one canonical person and define the baseline group as that person plus approved first-degree neighbors, then derive group-level summaries without adding new write-side truth or any LLM-generated narrative.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright, existing people/review IPC stack, SQLite (`node:sqlite`)

---

## Assumptions

- Phase 7A person dossier baseline is already shipped on branch `codex/phase7a-dossier-baseline`.
- Phase 7B dossier conflict / gap visibility is already implemented in the current working tree and should remain compatible.
- Phase 7C baseline is a lightweight anchored group overview, not a global clustering system and not a persona simulation layer.
- The review workbench remains the canonical place to resolve ambiguity; the group portrait only surfaces counts and entry points.

## Recommended Scope

For the first 7C slice, use an **anchored ego-group portrait**:

- anchor person = current dossier person
- members = anchor person + approved first-degree neighbors from the relationship graph
- relationship density = approved pairwise edges among those members
- shared events = approved event clusters with at least two portrait members
- central people summary = deterministic ranking from pairwise degree + shared evidence/event counts
- unresolved ambiguity = pending review/conflict counts for portrait members

Why this scope:

- It fits the existing `dossier → group portrait` flow naturally.
- It avoids inventing unstable global cluster boundaries.
- It is fully rebuildable from already-approved graph/timeline/review state.

## Explicitly Out of Scope

- global automatic community detection
- multi-group navigation hubs
- natural-language group summaries written by an LLM
- auto-generated social conclusions or behavior prediction
- write-side “group” tables or manual curation workflow

## Target Repository Changes

```text
docs/plans/2026-03-13-phase-seven-c-group-portrait-baseline-implementation-plan.md
src/main/ipc/peopleIpc.ts
src/main/services/groupPortraitService.ts
src/preload/index.ts
src/renderer/App.tsx
src/renderer/archiveApi.ts
src/renderer/components/PersonDossierView.tsx
src/renderer/components/GroupPortraitView.tsx
src/renderer/pages/PersonDetailPage.tsx
src/renderer/pages/GroupPortraitPage.tsx
src/shared/archiveContracts.ts
tests/e2e/group-portrait-flow.spec.ts
tests/unit/main/groupPortraitService.test.ts
tests/unit/renderer/archiveApi.test.ts
tests/unit/renderer/groupPortraitPage.test.tsx
tests/unit/renderer/personDossierPage.test.tsx
tests/unit/shared/phaseSevenContracts.test.ts
```

## Task 1: Extend shared contracts for the group portrait read model

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseSevenContracts.test.ts`

**Step 1: Write the failing shared contract test**

Add type assertions for:

- `GroupPortrait`
- `GroupPortraitMemberSummary`
- `GroupPortraitRelationshipDensity`
- `GroupPortraitSharedEvent`
- `GroupPortraitCentralPersonSummary`
- `GroupPortraitAmbiguitySummary`

Also extend `ArchiveApi` type coverage to include:

```ts
getGroupPortrait: (canonicalPersonId: string) => Promise<GroupPortrait | null>
```

**Step 2: Run the shared contract test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: FAIL because `GroupPortrait` types and API signature do not exist yet.

**Step 3: Add the minimal shared types**

Add a read model shaped roughly like:

```ts
export type GroupPortraitMemberSummary = {
  personId: string
  displayName: string
  sharedFileCount: number
  sharedEventCount: number
  connectionCount: number
  manualLabel: string | null
  isAnchor: boolean
  displayType: 'approved_fact' | 'derived_summary'
}

export type GroupPortraitRelationshipDensity = {
  memberCount: number
  actualEdgeCount: number
  possibleEdgeCount: number
  densityRatio: number
  displayType: 'derived_summary' | 'coverage_gap'
}
```

Extend `ArchiveApi` with `getGroupPortrait`.

**Step 4: Re-run the shared contract test**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts
```

Expected: PASS

## Task 2: Add failing service tests for the anchored group portrait read model

**Files:**
- Create: `tests/unit/main/groupPortraitService.test.ts`

**Step 1: Write the failing service tests**

Create one rich scenario with:

- anchor person `cp-1`
- neighbors `cp-2`, `cp-3`
- approved relationship label on one edge
- at least one approved shared event cluster involving two or three members
- pending review conflict on one member

Assert:

```ts
expect(portrait?.members.map((member) => member.displayName)).toEqual([
  'Alice Chen',
  'Bob Li',
  'Carol Xu'
])
expect(portrait?.relationshipDensity).toMatchObject({
  memberCount: 3,
  actualEdgeCount: 2,
  possibleEdgeCount: 3,
  displayType: 'derived_summary'
})
expect(portrait?.sharedEvents[0]).toMatchObject({
  title: 'Trip planning',
  memberCount: 2,
  displayType: 'approved_fact'
})
expect(portrait?.ambiguitySummary).toMatchObject({
  pendingReviewCount: 2,
  conflictGroupCount: 1,
  displayType: 'open_conflict'
})
```

Create a second sparse scenario where the anchor has no approved neighbors and assert:

- only the anchor member appears
- relationship density becomes `coverage_gap`
- shared events array is empty
- ambiguity summary still returns zeroed, typed output

**Step 2: Run the service test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/groupPortraitService.test.ts
```

Expected: FAIL because the service does not exist yet.

**Step 3: Implement the minimal service**

Create `src/main/services/groupPortraitService.ts` and:

- load anchor + first-degree approved neighbors
- derive pairwise member edges from shared files and approved manual relationship labels
- compute density ratio
- load approved shared event clusters with at least two portrait members
- rank central people by `connectionCount`, then `sharedEventCount`, then `sharedFileCount`
- count pending review items and conflict groups across portrait members

Do not add caching, snapshots, or clustering heuristics in 7C baseline.

**Step 4: Re-run the service test plus adjacent regressions**

Run:

```bash
npm run test:unit -- tests/unit/main/groupPortraitService.test.ts tests/unit/main/personDossierService.test.ts tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/main/timelineService.test.ts tests/unit/main/graphService.test.ts
```

Expected: PASS

## Task 3: Expose the group portrait read through IPC and renderer API

**Files:**
- Modify: `src/main/ipc/peopleIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing API test**

Extend the fallback API test to assert:

```ts
const api = getArchiveApi()
await expect(api.getGroupPortrait('cp-1')).resolves.toBeNull()
```

**Step 2: Run the API test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because `getGroupPortrait` is missing.

**Step 3: Add the minimal IPC path**

Wire:

- `archive:getGroupPortrait` in `peopleIpc.ts`
- `getGroupPortrait` in `preload/index.ts`
- `getGroupPortrait` in `archiveApi.ts`

**Step 4: Re-run the API test**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

## Task 4: Add failing renderer tests for page rendering and dossier navigation

**Files:**
- Create: `tests/unit/renderer/groupPortraitPage.test.tsx`
- Modify: `tests/unit/renderer/personDossierPage.test.tsx`
- Modify: `src/renderer/components/PersonDossierView.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Create: `src/renderer/components/GroupPortraitView.tsx`
- Create: `src/renderer/pages/GroupPortraitPage.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Write the failing renderer tests**

Add a new page test asserting:

- heading `Group Portrait`
- member list entries
- density summary
- shared events block
- central people block
- ambiguity block

Add a dossier-page test asserting a clickable `Open group portrait` action that invokes:

```ts
onOpenGroupPortrait?.('cp-1')
```

**Step 2: Run the renderer tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx
```

Expected: FAIL because there is no group portrait page or dossier entry point yet.

**Step 3: Implement the minimal renderer**

Render a lightweight page with sections:

- `Members`
- `Relationship Density`
- `Shared Events`
- `Central People`
- `Unresolved Ambiguity`

Update `App.tsx` state so:

- dossier can open `group-portrait`
- selected person ID doubles as portrait anchor ID for 7C baseline

Keep navigation local; do not introduce a router library.

**Step 4: Re-run the renderer tests**

Run:

```bash
npm run test:unit -- tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/personApprovedProfile.test.tsx tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

## Task 5: Add an end-to-end group portrait flow

**Files:**
- Create: `tests/e2e/group-portrait-flow.spec.ts`
- Modify: `src/main/services/e2eMultimodalFixtureService.ts`
- Modify: `src/main/services/importBatchService.ts`

**Step 1: Write the failing end-to-end test**

Create an e2e that:

- imports one fixture file
- enables a dedicated `FORGETME_E2E_GROUP_PORTRAIT_FIXTURE`
- opens `People` → person dossier
- clicks `Open group portrait`
- asserts `Group Portrait`
- asserts visible members, density, shared event title, and ambiguity summary

**Step 2: Run the e2e to verify it fails**

Run:

```bash
npx playwright test tests/e2e/group-portrait-flow.spec.ts
```

Expected: FAIL because the fixture and page do not exist yet.

**Step 3: Add the minimal fixture seed**

Seed:

- second and optional third canonical person tied to the same file or shared evidence
- one approved event cluster with multiple members
- one manual relationship label
- one pending review conflict for ambiguity visibility

Do not seed unrelated preservation or batch-review data.

**Step 4: Re-run the e2e**

Run:

```bash
npx playwright test tests/e2e/group-portrait-flow.spec.ts
```

Expected: PASS

## Task 6: Run focused verification and report the remaining 7C backlog

**Files:**
- Modify: `docs/plans/2026-03-13-phase-seven-c-group-portrait-baseline-implementation-plan.md` (only if scope notes need updates)

**Step 1: Run focused regression verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/groupPortraitService.test.ts tests/unit/main/personDossierService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx
```

Then run:

```bash
npm run build
```

Then run:

```bash
npx playwright test tests/e2e/group-portrait-flow.spec.ts tests/e2e/operational-runner-profile-flow.spec.ts tests/e2e/review-workbench-single-item-flow.spec.ts tests/e2e/review-workbench-safe-batch-flow.spec.ts
```

Expected: all PASS

**Step 2: Summarize the remaining backlog**

Call out explicitly that the following remain future slices after the implemented 7C baseline.

As implemented on this branch, `7C` now includes the original baseline plus a few low-risk navigation extras:

- shared evidence sources section
- group portrait → document evidence entry points
- group portrait member → person dossier entry points
- group portrait ambiguity → review workbench shortcut
- group portrait → replay shortcut into review history
- group-level timeline windows
- global group discovery / browsing
- natural-language portrait summaries

The remaining future slices are:

- none within the planned 7C baseline scope
