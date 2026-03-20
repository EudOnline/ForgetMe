# Phase 10M Approved Draft Hosted Share Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a narrow hosted share-link lifecycle for approved draft publication packages so operators can create, open, revoke, and replay remote share URLs without introducing a new mutable truth table.

**Architecture:** Reuse the existing approved-draft publication package as the sole share snapshot, add a dedicated `approvedDraftHostedShareLinkService` that validates the latest publication package before remote hosting, persist create/revoke request-response audit facts in new host-boundary tables, and fold successful create/revoke journal entries into a journal-backed hosted-link read model rendered inside the current `Approved Draft Handoff` panel.

**Tech Stack:** Electron, React, TypeScript, SQLite, Better SQLite3, Vitest, Playwright

**Execution Notes:** Use `@test-driven-development` for each task and `@verification-before-completion` before calling the phase complete.

**Scope Guardrails:**
- Do include hosted link create, revoke, open, journal history, host capability messaging, and remote host boundary audit.
- Do not include custom host registry, custom domain, expiry, password gating, recipient analytics, bulk revoke, hosted-link retry queues, or a new outbound dashboard.
- Keep `publication.json` plus `index.html`/`styles.css` as the only content snapshot; hosted links must point at an existing publication package instead of regenerating payloads from review truth.

---

### Task 1: Add shared hosted-share-link contracts, schemas, and archive API surface

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/renderer/archiveApi.ts`
- Create: `tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing shared contract tests**

Create `tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts` covering:

- `ApprovedDraftHostedShareHostStatus`
- `ApprovedPersonaDraftHostedShareLinkRecord`
- `ListApprovedPersonaDraftHostedShareLinksInput`
- `CreateApprovedPersonaDraftHostedShareLinkInput`
- `CreateApprovedPersonaDraftHostedShareLinkResult`
- `RevokeApprovedPersonaDraftHostedShareLinkInput`
- `RevokeApprovedPersonaDraftHostedShareLinkResult`
- `OpenApprovedDraftHostedShareLinkInput`
- `OpenApprovedDraftHostedShareLinkResult`

Also extend the archive API type coverage so `ArchiveApi` now exposes:

- `getApprovedDraftHostedShareHostStatus`
- `listApprovedPersonaDraftHostedShareLinks`
- `createApprovedPersonaDraftHostedShareLink`
- `revokeApprovedPersonaDraftHostedShareLink`
- `openApprovedDraftHostedShareLink`

Extend `tests/unit/renderer/archiveApi.test.ts` so the fallback surface expects:

```ts
await expect(archiveApi.getApprovedDraftHostedShareHostStatus()).resolves.toEqual({
  availability: 'unconfigured',
  hostKind: null,
  hostLabel: null
})

await expect(archiveApi.openApprovedDraftHostedShareLink({
  shareUrl: 'https://share.example.test/s/abc123'
})).resolves.toEqual({
  status: 'failed',
  shareUrl: 'https://share.example.test/s/abc123',
  errorMessage: 'archive api unavailable'
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the hosted-share-link types, schemas, and fallback API methods do not exist yet.

**Step 3: Add the minimal shared types and schemas**

Add to `src/shared/archiveContracts.ts`:

```ts
export type ApprovedDraftHostedShareHostStatus = {
  availability: 'configured' | 'unconfigured'
  hostKind: 'configured_remote_host' | null
  hostLabel: string | null
}

export type ApprovedPersonaDraftHostedShareLinkRecord = {
  shareLinkId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  hostKind: 'configured_remote_host'
  hostLabel: string
  remoteShareId: string
  shareUrl: string
  publicArtifactSha256: string
  status: 'active' | 'revoked'
  createdAt: string
  revokedAt: string | null
}

export type CreateApprovedPersonaDraftHostedShareLinkInput = {
  draftReviewId: string
}

export type RevokeApprovedPersonaDraftHostedShareLinkInput = {
  shareLinkId: string
}

export type OpenApprovedDraftHostedShareLinkInput = {
  shareUrl: string
}
```

Add matching result types:

- `CreateApprovedPersonaDraftHostedShareLinkResult`
- `RevokeApprovedPersonaDraftHostedShareLinkResult`
- `OpenApprovedDraftHostedShareLinkResult`

Use:

- `listApprovedPersonaDraftHostedShareLinksInputSchema = approvedPersonaDraftReviewIdSchema`
- `revokeApprovedPersonaDraftHostedShareLinkInputSchema = z.object({ shareLinkId: z.string().min(1) })`
- `openApprovedDraftHostedShareLinkInputSchema = z.object({ shareUrl: z.string().url().refine((value) => /^https?:\/\//.test(value)) })`

Update `ArchiveApi` and the renderer fallback in `src/renderer/archiveApi.ts` to return:

```ts
getApprovedDraftHostedShareHostStatus: async () => ({
  availability: 'unconfigured' as const,
  hostKind: null,
  hostLabel: null
}),
listApprovedPersonaDraftHostedShareLinks: async () => [],
createApprovedPersonaDraftHostedShareLink: async () => null,
revokeApprovedPersonaDraftHostedShareLink: async () => null,
openApprovedDraftHostedShareLink: async (input) => ({
  status: 'failed' as const,
  shareUrl: input.shareUrl,
  errorMessage: 'archive api unavailable'
})
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/renderer/archiveApi.ts tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft hosted share link contracts"
```

### Task 2: Add hosted-share host config, boundary audit persistence, and journal-backed link service

**Files:**
- Create: `src/main/services/migrations/020_persona_draft_hosted_share_links.sql`
- Create: `src/main/services/approvedDraftHostedShareLinkService.ts`
- Modify: `src/main/services/approvedDraftPublicationService.ts`
- Modify: `src/main/services/journalService.ts`
- Create: `tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts`
- Create: `tests/unit/main/approvedDraftHostedShareLinkService.test.ts`
- Modify: `tests/unit/main/searchService.test.ts`

**Step 1: Write the failing main-process tests**

Create `tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts` covering migration output:

1. `persona_draft_share_host_artifacts`
2. `persona_draft_share_host_events`
3. foreign key from events to artifacts
4. artifact columns:
   - `share_link_id`
   - `draft_review_id`
   - `publication_id`
   - `source_turn_id`
   - `operation_kind`
   - `host_kind`
   - `host_label`
   - `request_hash`

Create `tests/unit/main/approvedDraftHostedShareLinkService.test.ts` covering:

1. `getApprovedDraftHostedShareHostStatus()` returns `unconfigured` when env is absent.
2. `createApprovedPersonaDraftHostedShareLink(...)` returns `null` when:
   - the review is missing
   - the review is not `approved`
   - there is no existing publication history
3. creating a hosted link for the latest publication:
   - validates the local publication package
   - uploads exactly `publication.json`, `manifest.json`, `index.html`, and `styles.css`
   - does not send `packageRoot` or local absolute paths in the request envelope
   - writes one request and one response event to the new host-boundary tables
   - appends `create_approved_persona_draft_share_link` to `decision_journal`
4. `listApprovedPersonaDraftHostedShareLinks(...)` folds create plus revoke journals into:
   - `status = 'active'`
   - `status = 'revoked'`
   - newest-first order
5. revoking an active hosted link:
   - persists request and response audit events
   - appends `revoke_approved_persona_draft_share_link`
   - does not mutate the local publication package on disk
6. host create failure:
   - persists request and error events
   - does not append a create journal
   - throws a readable error message

Extend `tests/unit/main/searchService.test.ts` with:

1. one search assertion for a created hosted link found by `shareUrl`
2. one search assertion for a revoked hosted link found by `Hosted share link revoked`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/searchService.test.ts
```

Expected: FAIL because the migration, hosted-link service, and journal labels do not exist yet.

**Step 3: Add the migration and host-boundary tables**

Create `src/main/services/migrations/020_persona_draft_hosted_share_links.sql`:

```sql
create table if not exists persona_draft_share_host_artifacts (
  id text primary key,
  share_link_id text not null,
  draft_review_id text not null,
  publication_id text not null,
  source_turn_id text not null,
  operation_kind text not null,
  host_kind text not null,
  host_label text not null,
  request_hash text not null,
  created_at text not null,
  foreign key(draft_review_id) references persona_draft_reviews(id),
  foreign key(source_turn_id) references memory_workspace_turns(id)
);

create table if not exists persona_draft_share_host_events (
  id text primary key,
  artifact_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(artifact_id) references persona_draft_share_host_artifacts(id)
);
```

Add indices mirroring the provider-boundary tables:

- `idx_persona_draft_share_host_artifacts_review`
- `idx_persona_draft_share_host_events_artifact`

**Step 4: Implement the hosted-link service**

Create `src/main/services/approvedDraftHostedShareLinkService.ts` with:

- `getApprovedDraftHostedShareHostStatus()`
- `createApprovedPersonaDraftHostedShareLink(db, { draftReviewId })`
- `revokeApprovedPersonaDraftHostedShareLink(db, { shareLinkId })`
- `listApprovedPersonaDraftHostedShareLinks(db, { draftReviewId })`

Use a tiny config helper:

```ts
function currentHostedShareHostConfig() {
  const baseUrl = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL?.trim() ?? ''
  const token = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN?.trim() ?? ''
  if (!baseUrl || !token) {
    return {
      availability: 'unconfigured' as const,
      hostKind: null,
      hostLabel: null
    }
  }

  return {
    availability: 'configured' as const,
    hostKind: 'configured_remote_host' as const,
    hostLabel: new URL(baseUrl).origin,
    baseUrl,
    token
  }
}
```

Implementation rules:

- reuse the latest record from `listApprovedPersonaDraftPublications(...)`
- move package validation into a reusable helper in `src/main/services/approvedDraftPublicationService.ts` so both:
  - `openApprovedDraftPublicationEntry` IPC
  - hosted-link creation
  use the same package-boundary checks
- read package files from disk and build a request envelope like:

```ts
{
  requestShape: 'approved_draft_hosted_share_link_create',
  shareLinkId,
  publicationId,
  draftReviewId,
  sourceTurnId,
  publicArtifactSha256,
  manifest,
  publication,
  displayEntry: { fileName: 'index.html', html: indexHtml },
  displayStyles: { fileName: 'styles.css', css: stylesCss }
}
```

- do not include:
  - `packageRoot`
  - `manifestPath`
  - `publicArtifactPath`
  - `displayEntryPath`
  - any local absolute path
- persist request/response/error events in the new host-boundary tables
- call the host with `fetch` against a single configured endpoint, for example:

```ts
await fetch(new URL('/api/approved-draft-share-links', config.baseUrl), {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${config.token}`
  },
  body: JSON.stringify(requestEnvelope)
})
```

- expect a create response payload shaped like:

```ts
{
  remoteShareId: string
  shareUrl: string
}
```

- for revoke, POST or DELETE the remote share id and current share URL, then append the revoke journal only after the host confirms success

**Step 5: Add journal label and read-model folding**

Update `src/main/services/journalService.ts` to map:

- `create_approved_persona_draft_share_link` -> `Hosted share link created for approved draft`
- `revoke_approved_persona_draft_share_link` -> `Hosted share link revoked`

Extend `formatTargetLabel(...)` so hosted-link create/revoke summaries render:

- `Persona draft review · <sourceTurnId> · hosted share link`

Inside `approvedDraftHostedShareLinkService.ts`, fold create and revoke journal rows into:

```ts
{
  shareLinkId,
  publicationId,
  draftReviewId,
  sourceTurnId,
  hostKind: 'configured_remote_host',
  hostLabel,
  remoteShareId,
  shareUrl,
  publicArtifactSha256,
  status: revokedAt ? 'revoked' : 'active',
  createdAt,
  revokedAt
}
```

**Step 6: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/searchService.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/main/services/migrations/020_persona_draft_hosted_share_links.sql src/main/services/approvedDraftHostedShareLinkService.ts src/main/services/approvedDraftPublicationService.ts src/main/services/journalService.ts tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/searchService.test.ts
git commit -m "feat: add approved draft hosted share link service"
```

### Task 3: Wire hosted-link IPC, preload bridge, and external-link opening

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing IPC tests**

Extend `tests/unit/main/memoryWorkspaceIpc.test.ts` to cover:

1. `archive:getApprovedDraftHostedShareHostStatus`
2. `archive:listApprovedPersonaDraftHostedShareLinks`
3. `archive:createApprovedPersonaDraftHostedShareLink`
4. `archive:revokeApprovedPersonaDraftHostedShareLink`
5. `archive:openApprovedDraftHostedShareLink`

Assertions should cover:

- schema validation rejects invalid payloads
- create/revoke/list handlers open the DB, run migrations, call the hosted-link service, and close the DB
- `openApprovedDraftHostedShareLink` calls `shell.openExternal(...)` only for `http` or `https` URLs
- `shell.openExternal(...)` success returns:

```ts
{
  status: 'opened',
  shareUrl: 'https://share.example.test/s/abc123',
  errorMessage: null
}
```

- thrown `shell.openExternal(...)` errors become:

```ts
{
  status: 'failed',
  shareUrl: 'https://share.example.test/s/abc123',
  errorMessage: '...'
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because the new handlers and external-link open path do not exist yet.

**Step 3: Add the handlers**

Update `src/main/ipc/memoryWorkspaceIpc.ts` to register:

- `archive:getApprovedDraftHostedShareHostStatus`
- `archive:listApprovedPersonaDraftHostedShareLinks`
- `archive:createApprovedPersonaDraftHostedShareLink`
- `archive:revokeApprovedPersonaDraftHostedShareLink`
- `archive:openApprovedDraftHostedShareLink`

Implementation rules:

- reuse the same `openDatabase(...)` plus `runMigrations(...)` pattern as the other memory-workspace handlers
- delegate create/revoke/list/config to `approvedDraftHostedShareLinkService.ts`
- use `openApprovedDraftHostedShareLinkInputSchema`
- call `shell.openExternal(input.shareUrl)` inside `try/catch`
- return a structured result instead of letting the renderer infer success from exceptions

**Step 4: Expose the API through preload and archiveApi**

Update both `src/preload/index.ts` and `src/renderer/archiveApi.ts` with:

```ts
getApprovedDraftHostedShareHostStatus: () => ipcRenderer.invoke('archive:getApprovedDraftHostedShareHostStatus'),
listApprovedPersonaDraftHostedShareLinks: (input) => ipcRenderer.invoke('archive:listApprovedPersonaDraftHostedShareLinks', input),
createApprovedPersonaDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:createApprovedPersonaDraftHostedShareLink', input),
revokeApprovedPersonaDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:revokeApprovedPersonaDraftHostedShareLink', input),
openApprovedDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:openApprovedDraftHostedShareLink', input)
```

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: wire approved draft hosted share link ipc"
```

### Task 4: Render hosted-share-link lifecycle in Memory Workspace and replay

**Files:**
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing renderer tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. when an approved turn has:
   - at least one publication
   - configured host status
   - no hosted links yet
   it shows:
   - `Hosted Share Link`
   - `Create hosted share link`
2. after create succeeds, it renders:
   - `shareUrl`
   - `Status: active`
   - `Open hosted share link`
   - `Revoke hosted share link`
   - history rows including `active · <timestamp>`
3. when create throws, the page shows an inline error such as:
   - `Unable to create hosted share link: host unavailable`
4. when the host is unconfigured, it shows:
   - `Hosted share link is unavailable until a share host is configured`
   and no create button
5. when there is no publication history, it shows:
   - `Publish approved draft to create a local package before hosting`
6. revoke refreshes the history and changes the latest link to `Status: revoked`

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to cover:

1. replay still shows hosted-link history
2. replay still allows `Open hosted share link`
3. replay hides:
   - `Create hosted share link`
   - `Revoke hosted share link`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the renderer does not know about host capability, hosted-link history, create/revoke actions, or external-link open feedback.

**Step 3: Add page state and refresh flows**

Update `src/renderer/pages/MemoryWorkspacePage.tsx` to add:

- one page-level host-capability state:
  - `approvedDraftHostedShareHostStatus`
- per-turn hosted-link state:
  - `approvedDraftHostedShareLinksByTurnId`
  - `approvedDraftHostedSharePendingByTurnId`
  - `approvedDraftHostedShareStatusByTurnId`

Refresh rules:

- on approved review load, fetch both:
  - `listApprovedPersonaDraftPublications`
  - `listApprovedPersonaDraftHostedShareLinks`
- once on page load, fetch `getApprovedDraftHostedShareHostStatus()`
- after create or revoke, refresh the hosted-link list for that turn

Interaction handlers:

- `handleCreateApprovedDraftHostedShareLink(turnId)`
- `handleRevokeApprovedDraftHostedShareLink(turnId)`
- `handleOpenApprovedDraftHostedShareLink(turnId)`

Mirror the existing share-page open pattern for inline success/error messaging:

```ts
setApprovedDraftHostedShareStatusByTurnId((previous) => ({
  ...previous,
  [turnId]: {
    kind: 'success',
    message: 'Hosted share link opened.'
  }
}))
```

**Step 4: Update the panel and view props**

Extend `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx` with a `Hosted Share Link` subsection inside `Publish / Share` that renders:

- host capability message
- `Create hosted share link`
- latest link metadata:
  - `shareUrl`
  - `Status: active|revoked`
  - `Created: <timestamp>`
  - `Host: <hostLabel>`
- `Open hosted share link`
- `Revoke hosted share link` only when the latest link is active
- a history list with status and timestamp

Update `src/renderer/components/MemoryWorkspaceView.tsx` so replay mode:

- keeps `onOpenApprovedDraftHostedShareLink`
- removes `onCreateApprovedDraftHostedShareLink`
- removes `onRevokeApprovedDraftHostedShareLink`

Also include hosted-link pending in the combined `isPending` expression so publish/create/revoke/send buttons do not overlap.

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: show approved draft hosted share links"
```

### Task 5: Add search/review visibility and end-to-end coverage for the hosted-link flow

**Files:**
- Modify: `tests/unit/renderer/searchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`
- Create: `tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts`

**Step 1: Write the failing user-surface tests**

Extend renderer search/review coverage so hosted-link create/revoke summaries are visible in existing journal-driven surfaces.

Add search/review expectations such as:

```ts
expect(screen.getByText('Hosted share link created for approved draft')).toBeInTheDocument()
expect(screen.getByText('Hosted share link revoked')).toBeInTheDocument()
expect(screen.getByText('Persona draft review · turn-1 · hosted share link')).toBeInTheDocument()
```

Create `tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts` covering:

1. create a reviewed and approved persona draft
2. publish it as a local share package
3. start a tiny HTTP fixture host inside the test process
4. set:
   - `FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR`
   - `FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL`
   - `FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN`
5. click `Create hosted share link`
6. assert the UI shows:
   - `Hosted Share Link`
   - the returned `shareUrl`
   - `Status: active`
7. click `Revoke hosted share link`
8. assert the UI shows:
   - `Status: revoked`
   - a revoked history row
9. assert the mock host received payloads that:
   - contain `publicationId`
   - contain `publicArtifactSha256`
   - contain the publication/share-page files
   - do not contain any local absolute package path

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
```

Expected: FAIL because hosted-link labels are not yet present in these surfaces and the full hosted-link flow does not exist end-to-end.

**Step 3: Implement the missing coverage hooks**

Implementation notes:

- if search/review already read `decisionLabel`, prefer adding or adjusting fixtures rather than adding new renderer branching
- in the e2e test, use Node `http` or `node:http` to stand up a local mock server and close it in `finally`
- respond from the fixture host with deterministic JSON like:

```json
{
  "remoteShareId": "remote-share-1",
  "shareUrl": "https://share.example.test/s/remote-share-1"
}
```

- for revoke, return:

```json
{
  "status": "revoked"
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
git commit -m "test: cover approved draft hosted share links"
```

### Task 6: Update README and run final verification

**Files:**
- Modify: `README.md`

**Step 1: Update the phase-ten status summary**

Extend `README.md` so the Phase Ten section states that approved drafts can now:

- publish a local share package
- create hosted share links from those packages
- revoke hosted share links
- replay and search hosted-link history

Also add the new e2e command to the verification block:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
```

**Step 2: Run the focused verification suite**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
npm run build
```

Expected:

- all targeted unit tests PASS
- the hosted-link e2e flow PASSes
- `npm run build` PASSes

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update phase 10 hosted share status"
```
