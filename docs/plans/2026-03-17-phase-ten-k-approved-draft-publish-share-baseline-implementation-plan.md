# Phase 10K Approved Draft Publish/Share Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an approved-only local publication/share package workflow for persona drafts, with publication history visible in `Memory Workspace`, replay, and search.

**Architecture:** Build a dedicated `approvedDraftPublicationService` that derives a recipient-facing share package from the existing approved handoff builder, persists publish actions in `decision_journal` rather than a new mutable truth table, and renders a compact `Publish / Share` subsection inside the existing `Approved Draft Handoff` panel.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest, Playwright

---

### Task 1: Add shared publication contracts and IPC schema coverage

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing shared contract tests**

Create `tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts` covering:

- `ApprovedPersonaDraftPublicationArtifact`
- `ApprovedPersonaDraftPublicationRecord`
- `ListApprovedPersonaDraftPublicationsInput`
- `PublishApprovedPersonaDraftInput`
- `PublishApprovedPersonaDraftResult`
- `ArchiveApi` methods:
  - `selectApprovedDraftPublicationDestination`
  - `listApprovedPersonaDraftPublications`
  - `publishApprovedPersonaDraft`

Also extend `tests/unit/renderer/archiveApi.test.ts` to expect the new fallback API functions.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the new types and API methods do not exist yet.

**Step 3: Add the minimal shared types and schemas**

Add to `src/shared/archiveContracts.ts`:

```ts
export type ApprovedDraftPublicationKind = 'local_share_package'

export type ApprovedPersonaDraftPublicationArtifact = {
  formatVersion: 'phase10k1'
  publicationKind: ApprovedDraftPublicationKind
  publishedAt: string
  publicationId: string
  title: string
  question: string
  approvedDraft: string
  shareEnvelope: {
    requestShape: 'local_share_persona_draft_publication'
    policyKey: 'persona_draft.local_publish_share'
  }
}

export type ApprovedPersonaDraftPublicationRecord = {
  journalId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  publicationKind: ApprovedDraftPublicationKind
  status: 'published'
  packageRoot: string
  manifestPath: string
  publicArtifactPath: string
  publicArtifactFileName: string
  publicArtifactSha256: string
  publishedAt: string
}
```

Also extend `ArchiveApi` and add matching input/output types.

Add to `src/shared/ipcSchemas.ts`:

- `listApprovedPersonaDraftPublicationsInputSchema`
- `publishApprovedPersonaDraftInputSchema`

**Step 4: Update archive API fallback coverage**

Add fallback implementations in `tests/unit/renderer/archiveApi.test.ts`-covered surface:

- `selectApprovedDraftPublicationDestination`
- `listApprovedPersonaDraftPublications`
- `publishApprovedPersonaDraft`

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft publication contracts"
```

### Task 2: Add the main-process publication service and journal-backed read model

**Files:**
- Create: `src/main/services/approvedDraftPublicationService.ts`
- Modify: `src/main/services/journalService.ts`
- Create: `tests/unit/main/approvedDraftPublicationService.test.ts`
- Modify: `tests/unit/main/searchService.test.ts`

**Step 1: Write the failing service tests**

Create `tests/unit/main/approvedDraftPublicationService.test.ts` covering:

1. `publishApprovedPersonaDraftToDirectory(...)` returns `null` when the review is missing or not approved.
2. Publishing an approved review creates:
   - `approved-draft-publication-<publicationId>/publication.json`
   - `approved-draft-publication-<publicationId>/manifest.json`
3. `publication.json` contains:
   - `formatVersion = 'phase10k1'`
   - `publicationKind = 'local_share_package'`
   - `approvedDraft`
   - no `reviewNotes`
   - no `trace`
4. `manifest.json` contains:
   - `draftReviewId`
   - `sourceTurnId`
   - `publicArtifactSha256`
   - `sourceArtifact = 'approved_persona_draft_handoff'`
5. The publish action appends a `decision_journal` entry with:
   - `decisionType = 'publish_approved_persona_draft'`
   - `publicationId`
   - `packageRoot`
   - `publicArtifactPath`
6. `listApprovedPersonaDraftPublications(...)` returns newest-first history for one review.

Extend `tests/unit/main/searchService.test.ts` with one search assertion proving decision-journal search can find the publish label/summary.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftPublicationService.test.ts tests/unit/main/searchService.test.ts
```

Expected: FAIL because the service and publish journal labels do not exist yet.

**Step 3: Implement the publication service**

Create `src/main/services/approvedDraftPublicationService.ts` with:

- `buildApprovedPersonaDraftPublicationArtifact(db, { draftReviewId, publishedAt })`
- `publishApprovedPersonaDraftToDirectory(db, { draftReviewId, destinationRoot })`
- `listApprovedPersonaDraftPublications(db, { draftReviewId })`

Implementation rules:

- reuse `buildApprovedPersonaDraftHandoffArtifact(...)`
- generate `publicationId` with `crypto.randomUUID()`
- write package to:

```ts
const packageRoot = path.join(destinationRoot, `approved-draft-publication-${publicationId}`)
```

- write `publication.json` and `manifest.json`
- compute SHA only from `publication.json`
- append one journal entry

**Step 4: Add journal label handling**

Update `src/main/services/journalService.ts` to map:

- `publish_approved_persona_draft` -> `Approved draft published for sharing`

and preserve a readable target summary such as:

- `Persona draft review · <sourceTurnId> · local share package`

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftPublicationService.test.ts tests/unit/main/searchService.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/main/services/approvedDraftPublicationService.ts src/main/services/journalService.ts tests/unit/main/approvedDraftPublicationService.test.ts tests/unit/main/searchService.test.ts
git commit -m "feat: add approved draft publication service"
```

### Task 3: Wire publication IPC, preload, and renderer archive API

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing IPC tests**

Extend `tests/unit/main/memoryWorkspaceIpc.test.ts` to cover:

1. `archive:selectApprovedDraftPublicationDestination`
2. `archive:listApprovedPersonaDraftPublications`
3. `archive:publishApprovedPersonaDraft`

Each test should assert payload validation and that the correct service function is invoked.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because the IPC handlers do not exist yet.

**Step 3: Add the IPC handlers**

Update `src/main/ipc/memoryWorkspaceIpc.ts` to add:

- `archive:selectApprovedDraftPublicationDestination`
- `archive:listApprovedPersonaDraftPublications`
- `archive:publishApprovedPersonaDraft`

Use the existing directory chooser pattern:

```ts
selectDirectory('FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR')
```

**Step 4: Expose the API to renderer**

Update both:

- `src/preload/index.ts`
- `src/renderer/archiveApi.ts`

Add methods with these exact names:

- `selectApprovedDraftPublicationDestination`
- `listApprovedPersonaDraftPublications`
- `publishApprovedPersonaDraft`

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: wire approved draft publication ipc"
```

### Task 4: Add publish/share UI and replay history in Memory Workspace

**Files:**
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing renderer tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. approved reviews render a `Publish / Share` subsection
2. `Choose publish destination` stores the selected path
3. `Publish approved draft` calls `publishApprovedPersonaDraft({ draftReviewId, destinationRoot })`
4. latest publication history shows:
   - `publication.json`
   - timestamp
   - sha256
5. renderer remembers last-used publish destination

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to cover:

1. replayed approved turns render publication history read-only
2. replay mode does not show active publish buttons

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because no publication UI exists yet.

**Step 3: Add renderer state and API calls**

Update `src/renderer/pages/MemoryWorkspacePage.tsx` to add:

- publication destination localStorage key
- `approvedDraftPublicationsByTurnId`
- `selectApprovedDraftPublicationDestination`
- `listApprovedPersonaDraftPublications`
- `publishApprovedPersonaDraft`
- refresh logic for approved turns, parallel to handoffs/provider sends

Use the same approved-turn refresh pipeline already used for:

- handoff history
- provider send history

**Step 4: Add the handoff panel subsection**

Update `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx` to render:

- heading `Publish / Share`
- current destination or empty-state text
- `Choose publish destination`
- `Publish approved draft`
- latest publication summary
- short history list

Keep provider send and publication sections separate.

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: show approved draft publication history"
```

### Task 5: Add end-to-end coverage and run final verification

**Files:**
- Create: `tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts`
- Modify: `tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts`

**Step 1: Write the failing e2e coverage**

Create `tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts` covering:

1. import fixture and open `Memory Workspace`
2. generate sandbox draft
3. approve the draft review
4. choose a publish destination
5. publish the approved draft
6. verify the UI shows publication history
7. verify the package directory contains:
   - `publication.json`
   - `manifest.json`
8. verify `publication.json` includes `approvedDraft`
9. verify `publication.json` does not include `reviewNotes`

If useful, update `tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts` to assert the new subsection is present after approval.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
```

Expected: FAIL because the publish/share flow does not exist yet.

**Step 3: Implement the smallest missing pieces**

Finish any remaining service, IPC, or renderer gaps until the new e2e passes.

**Step 4: Run targeted verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/main/approvedDraftPublicationService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
```

Expected: PASS.

**Step 5: Run full project verification**

Run:

```bash
npm run test:unit
```

Run:

```bash
npm run test:e2e
```

Expected: PASS.

**Step 6: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts
git commit -m "test: cover approved draft publication flow"
```
