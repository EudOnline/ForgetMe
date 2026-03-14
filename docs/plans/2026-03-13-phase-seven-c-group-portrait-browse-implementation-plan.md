# Phase 7C Group Portrait Browse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global browse entry for anchored group portraits so the top-level `Group Portrait` page can discover and open existing multi-person portraits without first opening an individual dossier.

**Architecture:** Keep the current anchored ego-group model. Add a lightweight `listGroupPortraits` read that derives browse summaries from existing approved canonical people by reusing `getGroupPortrait`, filtering to anchors with at least two members, and exposing deterministic counts only. Extend the existing `GroupPortraitPage` so it renders a browse list when no `canonicalPersonId` is selected, and the specific portrait when one is selected.

**Tech Stack:** Electron IPC, renderer React pages, shared TypeScript contracts, Vitest, Playwright.

---

### Task 1: Add browse contracts and failing tests

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseSevenContracts.test.ts`
- Modify: `tests/unit/main/groupPortraitService.test.ts`
- Modify: `tests/unit/renderer/groupPortraitPage.test.tsx`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

- Add `GroupPortraitBrowseSummary` to the shared contract test.
- Add `ArchiveApi['listGroupPortraits']` type coverage.
- Add a service test asserting the rich fixture exposes anchored browse summaries and sorts the 3-member Alice group first.
- Add a renderer test asserting `GroupPortraitPage` shows browse cards when `canonicalPersonId` is `null`.
- Add a fallback API test asserting `listGroupPortraits()` resolves to `[]`.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/groupPortraitService.test.ts tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because `GroupPortraitBrowseSummary` and `listGroupPortraits` do not exist yet.

### Task 2: Implement browse read model and API

**Files:**
- Modify: `src/main/services/groupPortraitService.ts`
- Modify: `src/main/ipc/peopleIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`

**Step 1: Write minimal implementation**

- Export `GroupPortraitBrowseSummary`.
- Export `listGroupPortraits(db)` from `groupPortraitService.ts`.
- Reuse `getPeopleList(db)` plus `getGroupPortrait(db, { canonicalPersonId })`.
- Filter to summaries with `memberCount >= 2`.
- Sort by `memberCount desc`, then `sharedEventCount desc`, then `densityRatio desc`, then `title asc`.
- Expose `archive:listGroupPortraits` through IPC, preload, and renderer API.

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/groupPortraitService.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

### Task 3: Render browse mode and verify navigation

**Files:**
- Modify: `src/renderer/pages/GroupPortraitPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/unit/renderer/groupPortraitPage.test.tsx`
- Modify: `tests/e2e/group-portrait-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-seven-c-group-portrait-baseline-implementation-plan.md`

**Step 1: Write minimal implementation**

- In `GroupPortraitPage`, if `canonicalPersonId` is `null`, load `listGroupPortraits()` and render a browse list with an open button per summary.
- Add a renderer callback for opening a browse summary.
- In `App.tsx`, make the top-nav `Group Portrait` button clear the selected person before opening browse mode.
- Keep dossier-driven `Open group portrait` behavior unchanged.

**Step 2: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/groupPortraitPage.test.tsx tests/unit/shared/phaseSevenContracts.test.ts tests/unit/main/groupPortraitService.test.ts tests/unit/renderer/archiveApi.test.ts
npm run build
npx playwright test tests/e2e/group-portrait-flow.spec.ts
```

Expected: all PASS

### Task 4: Update backlog state

**Files:**
- Modify: `docs/plans/2026-03-13-phase-seven-c-group-portrait-baseline-implementation-plan.md`

**Step 1: Update remaining-slice summary**

- Move `global group discovery / browsing` from the remaining list into the implemented 7C list.
- Leave `natural-language portrait summaries` as the only remaining 7C future slice.
