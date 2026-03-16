# Phase 10E Approved Draft Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an approved-only local handoff flow for `Memory Workspace` persona draft reviews so operators can export an approved draft as a traceable JSON artifact without mutating the original sandbox turn or the approved review record.

**Architecture:** Reuse the `Phase 10D` review entity as the source of truth, build a focused `personaDraftHandoffService` that derives exportable artifacts from the approved review plus its source turn, write successful exports into `decision_journal`, and render a small approved handoff panel inside `Memory Workspace` that stays visible in replay as a read-only history summary.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite-backed services, Better SQLite3, Node `fs` / `path` / `crypto`, Vitest, Playwright.

---

## Scope Decisions

- `Phase 10E approved draft handoff` **does include**:
  - approved-only local JSON export for persona draft reviews
  - shared contracts for approved draft handoff artifacts and handoff history records
  - journal-backed handoff history reads keyed by `draftReviewId`
  - a small `Approved Draft Handoff` section inside `Memory Workspace`
  - replay-visible export status for approved reviews

- `Phase 10E approved draft handoff` **does not include**:
  - clipboard copy
  - remote send / publish
  - reopening approved reviews
  - new mutable `persona_draft_handoffs` storage tables
  - normal open-ended persona mode

- `Phase 10E` policy rules:
  1. only `approved` reviews may hand off
  2. export derives from `editedDraft`, never from the raw sandbox draft
  3. successful exports must be journaled
  4. replay shows handoff history as read-only metadata, not as a new editable record

---

### Task 1: Add approved handoff contracts and IPC schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/phaseTenApprovedDraftHandoffContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/shared/phaseTenApprovedDraftHandoffContracts.test.ts` covering:

- `ApprovedPersonaDraftHandoffKind = 'local_json_export'`
- `ApprovedPersonaDraftHandoffArtifact`
- `ApprovedPersonaDraftHandoffRecord`
- `ListApprovedPersonaDraftHandoffsInput`
- `ExportApprovedPersonaDraftInput`
- `ExportApprovedPersonaDraftResult`

Example contract shape:

```ts
const artifact: ApprovedPersonaDraftHandoffArtifact = {
  formatVersion: 'phase10e1',
  handoffKind: 'local_json_export',
  exportedAt: '2026-03-16T03:00:00.000Z',
  draftReviewId: 'review-1',
  sourceTurnId: 'turn-1',
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  workflowKind: 'persona_draft_sandbox',
  reviewStatus: 'approved',
  question: '如果她本人会怎么建议我？',
  approvedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
  reviewNotes: 'Approved for internal handoff.',
  supportingExcerptIds: ['ce-1'],
  communicationExcerpts: [
    {
      excerptId: 'ce-1',
      fileId: 'f-1',
      fileName: 'chat-1.json',
      ordinal: 1,
      speakerDisplayName: 'Alice Chen',
      text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
    }
  ],
  trace: [
    {
      traceId: 'trace-1',
      excerptIds: ['ce-1'],
      explanation: 'Draft stays grounded in excerpt ce-1.'
    }
  ],
  shareEnvelope: {
    requestShape: 'local_json_persona_draft_handoff',
    policyKey: 'persona_draft.local_export_approved'
  }
}

expect(artifact.reviewStatus).toBe('approved')
expect(artifact.handoffKind).toBe('local_json_export')
```

Also extend `tests/unit/renderer/archiveApi.test.ts` to expect fallback API support for:

- `selectPersonaDraftHandoffDestination`
- `listApprovedPersonaDraftHandoffs`
- `exportApprovedPersonaDraft`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHandoffContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the shared types and archive API methods do not exist yet.

**Step 3: Write minimal implementation**

Add to `src/shared/archiveContracts.ts`:

- `ApprovedPersonaDraftHandoffKind`
- `ApprovedPersonaDraftHandoffArtifact`
- `ApprovedPersonaDraftHandoffRecord`
- `ListApprovedPersonaDraftHandoffsInput`
- `ExportApprovedPersonaDraftInput`
- `ExportApprovedPersonaDraftResult`

Add to `src/shared/ipcSchemas.ts`:

- `approvedPersonaDraftReviewIdSchema`
- `listApprovedPersonaDraftHandoffsInputSchema`
- `exportApprovedPersonaDraftInputSchema`

Update `ArchiveApi` to expose:

- `selectPersonaDraftHandoffDestination`
- `listApprovedPersonaDraftHandoffs`
- `exportApprovedPersonaDraft`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHandoffContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseTenApprovedDraftHandoffContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft handoff contracts"
```

---

### Task 2: Implement approved handoff service and journal-backed history reads

**Files:**
- Create: `src/main/services/personaDraftHandoffService.ts`
- Modify: `src/main/services/journalService.ts`
- Modify: `tests/unit/main/helpers/memoryWorkspaceScenario.ts`
- Create: `tests/unit/main/personaDraftHandoffService.test.ts`
- Reference: `src/main/services/contextPackService.ts`
- Reference: `src/main/services/memoryWorkspaceDraftReviewService.ts`

**Step 1: Write the failing tests**

Create `tests/unit/main/personaDraftHandoffService.test.ts` covering:

1. `buildApprovedPersonaDraftHandoffArtifact(db, { draftReviewId })` returns a complete artifact for an approved review.
2. artifact creation returns `null` for `draft`, `in_review`, or `rejected` reviews.
3. `exportApprovedPersonaDraftToDirectory(...)` writes a deterministic JSON file and returns export metadata.
4. export appends a decision journal entry with `decisionType = 'export_approved_persona_draft'`.
5. `listApprovedPersonaDraftHandoffs(db, { draftReviewId })` returns newest-first history rows derived from journal entries.

Example test shape:

```ts
const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

const artifact = buildApprovedPersonaDraftHandoffArtifact(db, {
  draftReviewId: approvedReview.draftReviewId
})

expect(artifact?.reviewStatus).toBe('approved')
expect(artifact?.approvedDraft).toContain('归档')
expect(artifact?.communicationExcerpts[0]?.fileName).toBe('chat-1.json')

const exported = exportApprovedPersonaDraftToDirectory(db, {
  draftReviewId: approvedReview.draftReviewId,
  destinationRoot: exportDir
})

expect(exported?.status).toBe('exported')
expect(exported?.fileName).toContain('persona-draft-review-')
expect(listApprovedPersonaDraftHandoffs(db, {
  draftReviewId: approvedReview.draftReviewId
})).toHaveLength(1)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/personaDraftHandoffService.test.ts
```

Expected: FAIL because the service does not exist yet.

**Step 3: Write minimal implementation**

Implement `src/main/services/personaDraftHandoffService.ts` with:

- `buildApprovedPersonaDraftHandoffArtifact(db, { draftReviewId })`
- `listApprovedPersonaDraftHandoffs(db, { draftReviewId })`
- `exportApprovedPersonaDraftToDirectory(db, { draftReviewId, destinationRoot })`

Service rules:

- only `approved` reviews may export
- artifact pulls `editedDraft`, `reviewNotes`, `supportingExcerpts`, and `trace` from the review record
- artifact pulls `question` and `communicationEvidence.excerpts` from the source turn response
- successful export writes `decision_journal`
- handoff history reads are derived from `decision_journal`, not from a new table

Update `journalService.ts` formatting so `Decision Journal` renders:

- `export_approved_persona_draft` as `Approved draft exported`

Keep file naming deterministic:

- `persona-draft-review-<draftReviewId>-approved.json`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/personaDraftHandoffService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personaDraftHandoffService.ts src/main/services/journalService.ts tests/unit/main/helpers/memoryWorkspaceScenario.ts tests/unit/main/personaDraftHandoffService.test.ts
git commit -m "feat: add approved draft handoff service"
```

---

### Task 3: Wire approved handoff IPC, preload, and renderer API bindings

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Create: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/main/memoryWorkspaceIpc.test.ts` covering:

1. `archive:selectPersonaDraftHandoffDestination` returns the e2e override directory when present.
2. `archive:listApprovedPersonaDraftHandoffs` parses input and returns handoff history.
3. `archive:exportApprovedPersonaDraft` validates payload, exports through the service, and closes the database.

Also extend `tests/unit/renderer/archiveApi.test.ts` to expect:

```ts
await expect(archiveApi.selectPersonaDraftHandoffDestination()).resolves.toBeNull()
await expect(archiveApi.listApprovedPersonaDraftHandoffs({
  draftReviewId: 'review-1'
})).resolves.toEqual([])
await expect(archiveApi.exportApprovedPersonaDraft({
  draftReviewId: 'review-1',
  destinationRoot: '/tmp/persona-draft-exports'
})).resolves.toBeNull()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the IPC handlers and preload/API bindings do not exist yet.

**Step 3: Write minimal implementation**

In `src/main/ipc/memoryWorkspaceIpc.ts` add handlers for:

- `archive:selectPersonaDraftHandoffDestination`
- `archive:listApprovedPersonaDraftHandoffs`
- `archive:exportApprovedPersonaDraft`

Use an env override for e2e:

- `FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR`

Update preload and renderer API bindings so `MemoryWorkspacePage` can call the new methods.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: wire approved draft handoff ipc"
```

---

### Task 4: Render the approved handoff panel in Memory Workspace

**Files:**
- Create: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` with coverage for:

1. approved reviews render an `Approved Draft Handoff` section
2. non-approved reviews do not show export controls
3. choosing a destination and exporting calls the archive API with the approved `draftReviewId`
4. successful export renders latest file name / export time in the page

Example test shape:

```tsx
const selectPersonaDraftHandoffDestination = vi.fn().mockResolvedValue('/tmp/persona-draft-exports')
const listApprovedPersonaDraftHandoffs = vi.fn().mockResolvedValue([])
const exportApprovedPersonaDraft = vi.fn().mockResolvedValue({
  status: 'exported',
  draftReviewId: 'review-1',
  handoffKind: 'local_json_export',
  filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
  fileName: 'persona-draft-review-review-1-approved.json',
  sha256: 'hash-1',
  exportedAt: '2026-03-16T03:30:00.000Z'
})

render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Choose export destination' }))
fireEvent.click(screen.getByRole('button', { name: 'Export approved draft' }))

expect(exportApprovedPersonaDraft).toHaveBeenCalledWith({
  draftReviewId: 'review-1',
  destinationRoot: '/tmp/persona-draft-exports'
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the page has no approved handoff panel or state handling.

**Step 3: Write minimal implementation**

Add `ApprovedPersonaDraftHandoffPanel.tsx` and wire it from `MemoryWorkspaceView` for approved reviews only.

In `MemoryWorkspacePage.tsx`:

- keep a destination string for approved draft exports
- load handoff history when an approved review is present
- call the new archive API methods
- update local handoff history after a successful export

UI labels to stabilize tests:

- `Approved Draft Handoff`
- `Choose export destination`
- `Export approved draft`
- `No export destination selected.`
- `Exported <fileName>`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add approved draft handoff panel"
```

---

### Task 5: Add end-to-end coverage for approved draft export handoff

**Files:**
- Create: `tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts`

**Step 1: Write the failing test**

Create an end-to-end flow that:

1. imports a chat fixture
2. opens `Memory Workspace`
3. asks a persona-style question that produces a reviewed draft sandbox
4. starts review, edits, marks `in_review`, approves
5. selects an export destination
6. exports the approved draft
7. verifies the JSON artifact exists and contains `phase10e1` handoff metadata

Expected artifact assertions:

```ts
expect(payload.formatVersion).toBe('phase10e1')
expect(payload.reviewStatus).toBe('approved')
expect(payload.shareEnvelope).toEqual({
  requestShape: 'local_json_persona_draft_handoff',
  policyKey: 'persona_draft.local_export_approved'
})
expect(payload.approvedDraft).toContain('归档')
expect(payload.communicationExcerpts[0]?.fileName).toBe('chat-phase10e-handoff.json')
```

**Step 2: Run the e2e test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts
```

Expected: FAIL because no approved draft export UI or artifact writer exists yet.

**Step 3: Write minimal implementation adjustments**

Fix any remaining selector, loading, or artifact-shape gaps discovered by the browser run. Keep the scope tight:

- no clipboard
- no remote send
- no new pages

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/main/personaDraftHandoffService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts
git commit -m "test: add approved draft handoff coverage"
```
