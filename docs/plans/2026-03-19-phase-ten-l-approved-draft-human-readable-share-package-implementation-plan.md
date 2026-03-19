# Phase 10L Approved Draft Human-Readable Share Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend approved-draft local publication packages with a recipient-facing static HTML entry and a lightweight "open share page" workflow in `Memory Workspace`, while preserving the JSON payload, manifest, and journal-backed publication history introduced in `10K`.

**Architecture:** Keep `publication.json` as the canonical local publication payload, add a derived `index.html` plus package-local `styles.css` renderer in the main process, and thread the generated entry-file metadata through the existing publication result and journal mapping. Expose one narrow `openApprovedDraftPublicationEntry` IPC so live sessions and replay can launch the generated share page without introducing cloud hosting, custom destination CRUD, or a new mutable publication table.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest, Playwright

**Execution Notes:** Use `@test-driven-development` for each task and `@verification-before-completion` before calling the phase complete.

**Scope Guardrails:**
- Do include a static human-readable `index.html`, package-local CSS, entry-file metadata, and a non-mutating open action for existing publications.
- Do not include cloud share links, revoke or expiry controls, external sync, custom branding, multi-template theming, or a standalone outbound dashboard.

---

### Task 1: Extend publication contracts for display entry metadata and open-entry IPC

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing shared contract tests**

Extend `tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts` to cover:

- `ApprovedPersonaDraftPublicationRecord.displayEntryPath`
- `ApprovedPersonaDraftPublicationRecord.displayEntryFileName`
- `PublishApprovedPersonaDraftResult.displayEntryPath`
- `PublishApprovedPersonaDraftResult.displayEntryFileName`
- `OpenApprovedDraftPublicationEntryInput`
- `OpenApprovedDraftPublicationEntryResult`
- `ArchiveApi.openApprovedDraftPublicationEntry`

Also extend `tests/unit/renderer/archiveApi.test.ts` so the fallback API surface expects `openApprovedDraftPublicationEntry(...)`.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the entry metadata fields and open-entry API method do not exist yet.

**Step 3: Add the minimal shared types and schemas**

Update `src/shared/archiveContracts.ts` with:

```ts
export type OpenApprovedDraftPublicationEntryInput = {
  entryPath: string
}

export type OpenApprovedDraftPublicationEntryResult = {
  status: 'opened' | 'failed'
  entryPath: string
  errorMessage: string | null
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
  displayEntryPath: string
  displayEntryFileName: 'index.html'
  publishedAt: string
}
```

Also extend `PublishApprovedPersonaDraftResult` and `ArchiveApi` with:

- `openApprovedDraftPublicationEntry(input)`

Update `src/shared/ipcSchemas.ts` with:

- `openApprovedDraftPublicationEntryInputSchema`

Use the same non-empty absolute-path style validation already used for other filesystem-bound payloads.

**Step 4: Update fallback archive API coverage**

Add a fallback implementation in `src/renderer/archiveApi.ts`-covered surface:

```ts
openApprovedDraftPublicationEntry: async (input) => ({
  status: 'failed' as const,
  entryPath: input.entryPath,
  errorMessage: 'archive api unavailable'
})
```

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: extend approved draft publication contracts"
```

### Task 2: Add static HTML share-page rendering to the publication package writer

**Files:**
- Create: `src/main/services/approvedDraftPublicationHtmlService.ts`
- Modify: `src/main/services/approvedDraftPublicationService.ts`
- Create: `tests/unit/main/approvedDraftPublicationHtmlService.test.ts`
- Modify: `tests/unit/main/approvedDraftPublicationService.test.ts`

**Step 1: Write the failing renderer and service tests**

Create `tests/unit/main/approvedDraftPublicationHtmlService.test.ts` covering:

1. `buildApprovedDraftPublicationHtmlDocument(...)` escapes title, question, and draft text safely.
2. The HTML contains:
   - a visible title
   - the question
   - the approved draft body
   - the published timestamp
   - a local reference to `publication.json`
3. The HTML does not include:
   - `reviewNotes`
   - `trace`
   - `supportingExcerptIds`

Extend `tests/unit/main/approvedDraftPublicationService.test.ts` to assert:

1. publishing an approved review writes:
   - `publication.json`
   - `manifest.json`
   - `index.html`
   - `styles.css`
2. the publish result returns:
   - `displayEntryPath`
   - `displayEntryFileName = 'index.html'`
3. `manifest.json` includes:
   - `displayEntryFileName = 'index.html'`
   - `displayStylesFileName = 'styles.css'`
4. `listApprovedPersonaDraftPublications(...)` maps the new entry metadata newest-first.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftPublicationHtmlService.test.ts tests/unit/main/approvedDraftPublicationService.test.ts
```

Expected: FAIL because no HTML renderer exists and the publication service only writes JSON plus manifest files today.

**Step 3: Implement the HTML renderer and package writer changes**

Create `src/main/services/approvedDraftPublicationHtmlService.ts` with a focused helper:

```ts
export function buildApprovedDraftPublicationHtmlDocument(input: {
  title: string
  question: string
  approvedDraft: string
  publishedAt: string
}) {
  // escape HTML
  // return a static document that links to ./styles.css
}
```

Implementation rules:

- keep the share page fully static: no client-side JavaScript
- render semantic sections for title, question, approved draft, and publication timestamp
- include a small footer note that this page was derived from an approved ForgetMe publication package
- keep all review-only fields out of both `index.html` and `styles.css`
- use relative package paths only, for example `./styles.css` and `./publication.json`

Update `src/main/services/approvedDraftPublicationService.ts` to:

- build the existing `publication.json` exactly as the canonical structured payload
- write `index.html` and `styles.css` into the same package root
- keep SHA computation based on `publication.json` only
- add `displayEntryPath` and `displayEntryFileName` to:
  - the returned `PublishApprovedPersonaDraftResult`
  - the journal payload
  - the read-model mapping in `listApprovedPersonaDraftPublications(...)`
- add these manifest fields:

```ts
displayEntryFileName: 'index.html'
displayStylesFileName: 'styles.css'
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftPublicationHtmlService.test.ts tests/unit/main/approvedDraftPublicationService.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftPublicationHtmlService.ts src/main/services/approvedDraftPublicationService.ts tests/unit/main/approvedDraftPublicationHtmlService.test.ts tests/unit/main/approvedDraftPublicationService.test.ts
git commit -m "feat: add approved draft share page renderer"
```

### Task 3: Wire a narrow open-entry IPC through main, preload, and renderer archive API

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing IPC tests**

Extend `tests/unit/main/memoryWorkspaceIpc.test.ts` to cover:

1. `archive:openApprovedDraftPublicationEntry` rejects invalid payloads.
2. When `shell.openPath(...)` resolves `''`, the handler returns:

```ts
{
  status: 'opened',
  entryPath: '/tmp/.../index.html',
  errorMessage: null
}
```

3. When `shell.openPath(...)` resolves a non-empty error string, the handler returns:

```ts
{
  status: 'failed',
  entryPath: '/tmp/.../index.html',
  errorMessage: '...'
}
```

Also update the existing mocked publication IPC responses so they include `displayEntryPath` and `displayEntryFileName`.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because no open-entry handler exists and the IPC test fixture does not yet include the new entry metadata.

**Step 3: Add the IPC handler and expose it to the renderer**

Update `src/main/ipc/memoryWorkspaceIpc.ts` to:

- import `shell` from `electron`
- register `archive:openApprovedDraftPublicationEntry`
- parse `openApprovedDraftPublicationEntryInputSchema`
- call `await shell.openPath(input.entryPath)`

Use this exact response shape:

```ts
const errorMessage = await shell.openPath(input.entryPath)
return errorMessage
  ? { status: 'failed', entryPath: input.entryPath, errorMessage }
  : { status: 'opened', entryPath: input.entryPath, errorMessage: null }
```

Also expose the method through:

- `src/preload/index.ts`
- `src/renderer/archiveApi.ts`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: wire approved draft share page opening"
```

### Task 4: Update Memory Workspace and replay UI to emphasize the share page and launch it

**Files:**
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing renderer tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to verify:

1. the latest publication now shows:
   - `Entry page: index.html`
   - `Data payload: publication.json`
2. once a publication exists, `Open share page` is rendered
3. clicking `Open share page` calls:

```ts
openApprovedDraftPublicationEntry({
  entryPath: '/tmp/.../approved-draft-publication-.../index.html'
})
```

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to verify:

1. replay still hides `Choose publish destination`
2. replay still hides `Publish approved draft`
3. replay still shows `Open share page` for an already-published artifact because opening the generated file is non-mutating
4. replay renders `Entry page: index.html`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the current panel only surfaces `publication.json` and has no open-entry action.

**Step 3: Implement the renderer changes**

Update `src/renderer/pages/MemoryWorkspacePage.tsx` to:

- bind `archiveApi.openApprovedDraftPublicationEntry`
- add `handleOpenApprovedDraftPublication(turnId)` that opens the latest publication's `displayEntryPath`

Update `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx` to:

- surface the human-facing entry file prominently
- keep `publication.json` visible as the underlying structured payload
- add an `Open share page` button wired to the latest publication entry
- keep publication history compact and newest-first

Update `src/renderer/components/MemoryWorkspaceView.tsx` so:

- live mode can publish and open
- replay mode remains non-mutating but can still open already-generated share pages

Keep these guardrails:

- no new standalone publication center
- no editable publication history
- no re-publish action in replay

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: show approved draft share page entry"
```

### Task 5: Add end-to-end coverage for the human-readable share package

**Files:**
- Modify: `tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts`

**Step 1: Write the failing end-to-end assertions**

Extend `tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts` to verify:

1. after publishing, the package root contains:
   - `publication.json`
   - `manifest.json`
   - `index.html`
   - `styles.css`
2. the UI shows:
   - `Entry page: index.html`
   - `Data payload: publication.json`
3. `index.html` contains:
   - the published question
   - the approved draft text
4. `index.html` does not contain the review note string:
   - `Approved for publication share package.`
5. `manifest.json` contains:
   - `displayEntryFileName = 'index.html'`
   - `displayStylesFileName = 'styles.css'`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
```

Expected: FAIL because the current package does not write HTML artifacts or render the new entry metadata.

**Step 3: Re-run the scenario after implementation**

After Tasks 1 through 4 are complete, re-run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
```

Expected: PASS.

**Step 4: Run focused verification before calling the phase complete**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftPublicationContracts.test.ts tests/unit/main/approvedDraftPublicationHtmlService.test.ts tests/unit/main/approvedDraftPublicationService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
git commit -m "test: cover approved draft share page package"
```
