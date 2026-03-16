# Phase 10F Approved Draft Provider-Boundary Send Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an approved-only remote provider send flow for `Memory Workspace` persona draft reviews so operators can send a reviewed draft through a provider-boundary audit layer without reopening persona mode or mutating the approved review artifact.

**Architecture:** Reuse `buildApprovedPersonaDraftHandoffArtifact(...)` from `Phase 10E` as the outbound source payload, persist approved-draft-specific request / response / error events in a dedicated boundary schema, execute the remote call through the existing `memory_dialogue` model route, and surface a compact send history inside the existing `Approved Draft Handoff` panel.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite-backed services, Better SQLite3, Vitest, Playwright, existing `callLiteLLM` / `resolveModelRoute`.

---

## Scope Decisions

- `Phase 10F approved draft provider-boundary send` **does include**:
  - approved-only remote send for persona draft reviews
  - reuse of the `10E` approved handoff artifact as the source payload
  - dedicated approved-draft provider boundary audit tables
  - request / response / error event persistence keyed by `draftReviewId`
  - a narrow send action and read-only send history inside `Memory Workspace`
  - fixture-backed deterministic coverage for unit and e2e

- `Phase 10F approved draft provider-boundary send` **does not include**:
  - general outbound-framework refactors
  - modifying existing enrichment `provider_egress_artifacts` semantics
  - destination management or provider pickers
  - automatic publish/share links
  - long-running persona chat after send
  - writing provider responses back into the approved draft

- `Phase 10F` policy rules:
  1. only `approved` reviews may remote-send
  2. remote-send payload derives from `buildApprovedPersonaDraftHandoffArtifact(...)`
  3. request / response / error facts live in dedicated boundary tables, not in the review record
  4. first slice uses `memory_dialogue` default route rather than a new destination registry

---

### Task 1: Add approved-draft provider-boundary schema and shared contracts

**Files:**
- Create: `src/main/services/migrations/016_persona_draft_provider_boundary_send.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts`
- Create: `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts` covering:

- migration `016_persona_draft_provider_boundary_send.sql` runs successfully
- database now contains:
  - `persona_draft_provider_egress_artifacts`
  - `persona_draft_provider_egress_events`
- event table has a foreign key back to the artifact table

Create `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts` covering:

- `ApprovedPersonaDraftProviderSendEvent`
- `ApprovedPersonaDraftProviderSendArtifact`
- `ListApprovedPersonaDraftProviderSendsInput`
- `SendApprovedPersonaDraftToProviderInput`
- `SendApprovedPersonaDraftToProviderResult`

Example contract shape:

```ts
const artifact: ApprovedPersonaDraftProviderSendArtifact = {
  artifactId: 'pdpe-1',
  draftReviewId: 'review-1',
  sourceTurnId: 'turn-1',
  provider: 'siliconflow',
  model: 'Qwen/Qwen2.5-72B-Instruct',
  policyKey: 'persona_draft.remote_send_approved',
  requestHash: 'hash-1',
  redactionSummary: {
    requestShape: 'approved_persona_draft_handoff_artifact',
    sourceArtifact: 'approved_persona_draft_handoff',
    removedFields: []
  },
  createdAt: '2026-03-16T08:00:00.000Z',
  events: [{
    id: 'event-1',
    eventType: 'request',
    payload: {
      requestShape: 'approved_persona_draft_handoff_artifact',
      policyKey: 'persona_draft.remote_send_approved'
    },
    createdAt: '2026-03-16T08:00:00.000Z'
  }]
}

expect(artifact.events[0]?.eventType).toBe('request')
expect(artifact.policyKey).toBe('persona_draft.remote_send_approved')
```

Also extend `tests/unit/renderer/archiveApi.test.ts` to expect fallback API support for:

- `listApprovedPersonaDraftProviderSends`
- `sendApprovedPersonaDraftToProvider`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the migration, shared types, schemas, and archive API methods do not exist yet.

**Step 3: Write minimal implementation**

Create `src/main/services/migrations/016_persona_draft_provider_boundary_send.sql` with:

- `persona_draft_provider_egress_artifacts`
  - `id`
  - `draft_review_id`
  - `source_turn_id`
  - `provider`
  - `model`
  - `policy_key`
  - `request_hash`
  - `redaction_summary_json`
  - `created_at`
- `persona_draft_provider_egress_events`
  - `id`
  - `artifact_id`
  - `event_type`
  - `payload_json`
  - `created_at`
- indexes on:
  - `(draft_review_id, created_at)` for artifacts
  - `(artifact_id, event_type, created_at)` for events

Add to `src/shared/archiveContracts.ts`:

- `ApprovedPersonaDraftProviderSendEvent`
- `ApprovedPersonaDraftProviderSendArtifact`
- `ListApprovedPersonaDraftProviderSendsInput`
- `SendApprovedPersonaDraftToProviderInput`
- `SendApprovedPersonaDraftToProviderResult`

Add to `src/shared/ipcSchemas.ts`:

- `listApprovedPersonaDraftProviderSendsInputSchema`
- `sendApprovedPersonaDraftToProviderInputSchema`

Update `ArchiveApi` fallbacks and types to expose:

- `listApprovedPersonaDraftProviderSends`
- `sendApprovedPersonaDraftToProvider`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/016_persona_draft_provider_boundary_send.sql src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft provider send contracts"
```

---

### Task 2: Implement the approved-draft provider send service and audit persistence

**Files:**
- Create: `src/main/services/approvedDraftProviderSendService.ts`
- Test: `tests/unit/main/approvedDraftProviderSendService.test.ts`
- Reference: `src/main/services/personaDraftHandoffService.ts`
- Reference: `src/main/services/providerBoundaryService.ts`
- Reference: `src/main/services/modelGatewayService.ts`
- Reference: `tests/unit/main/helpers/memoryWorkspaceScenario.ts`

**Step 1: Write the failing test**

Create `tests/unit/main/approvedDraftProviderSendService.test.ts` covering:

1. `buildApprovedPersonaDraftProviderSendRequest(db, { draftReviewId })` returns `null` for non-approved reviews.
2. approved reviews build a boundary request envelope whose `handoffArtifact` comes from `buildApprovedPersonaDraftHandoffArtifact(...)`.
3. `sendApprovedPersonaDraftToProvider(db, { draftReviewId })` writes an artifact row plus a `request` event.
4. successful provider calls append a `response` event and return `status = 'responded'`.
5. failing provider calls append an `error` event and rethrow the error.
6. `listApprovedPersonaDraftProviderSends(db, { draftReviewId })` returns newest-first artifacts with all events.
7. fixture mode short-circuits real network calls when `FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE === '1'`.

Example test shape:

```ts
const callModel = vi.fn().mockResolvedValue({
  provider: 'siliconflow',
  model: 'Qwen/Qwen2.5-72B-Instruct',
  receivedAt: '2026-03-16T08:01:00.000Z',
  usage: { total_tokens: 12 },
  payload: {
    choices: [{
      message: {
        content: JSON.stringify({
          acknowledgement: 'received',
          summary: 'approved draft recorded'
        })
      }
    }]
  }
})

const sent = await sendApprovedPersonaDraftToProvider(db, {
  draftReviewId: approvedReview.draftReviewId,
  callModel
})

expect(sent?.status).toBe('responded')
expect(callModel).toHaveBeenCalledTimes(1)
expect(listApprovedPersonaDraftProviderSends(db, {
  draftReviewId: approvedReview.draftReviewId
})[0]?.events.map((event) => event.eventType)).toEqual(['request', 'response'])
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts
```

Expected: FAIL because the service does not exist yet.

**Step 3: Write minimal implementation**

Create `src/main/services/approvedDraftProviderSendService.ts` with:

- `buildApprovedPersonaDraftProviderSendRequest(db, { draftReviewId })`
- `sendApprovedPersonaDraftToProvider(db, { draftReviewId, callModel? })`
- `listApprovedPersonaDraftProviderSends(db, { draftReviewId })`

Implementation rules:

- call `buildApprovedPersonaDraftHandoffArtifact(...)` to obtain the source artifact
- if the approved artifact is missing, return `null`
- build a boundary request envelope like:

```ts
const requestEnvelope = {
  requestShape: 'approved_persona_draft_handoff_artifact',
  policyKey: 'persona_draft.remote_send_approved',
  handoffArtifact
}
```

- persist baseline policy `persona_draft.remote_send_approved` in `redaction_policies`
- write artifact row into `persona_draft_provider_egress_artifacts`
- write `request` event before the remote call
- use `resolveModelRoute({ taskType: 'memory_dialogue' })`
- send `JSON.stringify(requestEnvelope)` through `callLiteLLM(...)` with `responseFormat: { type: 'json_object' }`
- on success, persist `response` event and return:

```ts
{
  status: 'responded',
  artifactId,
  draftReviewId,
  sourceTurnId,
  provider,
  model,
  policyKey: 'persona_draft.remote_send_approved',
  requestHash,
  createdAt
}
```

- on failure, persist `error` event and rethrow
- in fixture mode, return a deterministic JSON acknowledgement instead of calling the network

Do **not** modify existing `provider_egress_artifacts` reads or enrichment flows.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftProviderSendService.ts tests/unit/main/approvedDraftProviderSendService.test.ts
git commit -m "feat: add approved draft provider send service"
```

---

### Task 3: Wire approved-draft provider send IPC and preload bindings

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/main/memoryWorkspaceIpc.test.ts` to cover:

1. `archive:listApprovedPersonaDraftProviderSends` validates input, calls the service, returns the send history, and closes the database.
2. `archive:sendApprovedPersonaDraftToProvider` validates input, calls the service, returns the send result, and closes the database.

Example assertion shape:

```ts
listApprovedPersonaDraftProviderSends.mockReturnValue([{
  artifactId: 'pdpe-1',
  draftReviewId: 'review-1',
  sourceTurnId: 'turn-1',
  provider: 'siliconflow',
  model: 'Qwen/Qwen2.5-72B-Instruct',
  policyKey: 'persona_draft.remote_send_approved',
  requestHash: 'hash-1',
  redactionSummary: {
    requestShape: 'approved_persona_draft_handoff_artifact',
    sourceArtifact: 'approved_persona_draft_handoff',
    removedFields: []
  },
  createdAt: '2026-03-16T08:00:00.000Z',
  events: []
}])
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because the new handlers are not registered yet.

**Step 3: Write minimal implementation**

Update `src/main/ipc/memoryWorkspaceIpc.ts` to register:

- `archive:listApprovedPersonaDraftProviderSends`
- `archive:sendApprovedPersonaDraftToProvider`

Use:

- `listApprovedPersonaDraftProviderSendsInputSchema`
- `sendApprovedPersonaDraftToProviderInputSchema`
- `listApprovedPersonaDraftProviderSends(...)`
- `sendApprovedPersonaDraftToProvider(...)`

Update preload and renderer bindings so `ArchiveApi` exposes:

- `listApprovedPersonaDraftProviderSends(input)`
- `sendApprovedPersonaDraftToProvider(input)`

Keep the same open-db / run-migrations / close-db lifecycle used by the other `Memory Workspace` handlers.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "feat: wire approved draft provider send ipc"
```

---

### Task 4: Extend the approved handoff UI with provider-send actions and history

**Files:**
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. approved reviews render a `Provider Boundary Send` subsection
2. the page loads send history for approved reviews
3. clicking `Send approved draft` calls the archive API with `draftReviewId`
4. after a successful send, the latest provider / model / status summary appears
5. non-approved reviews still do not show send controls

Example mock setup:

```ts
const listApprovedPersonaDraftProviderSends = vi.fn().mockResolvedValue([])
const sendApprovedPersonaDraftToProvider = vi.fn().mockResolvedValue({
  status: 'responded',
  artifactId: 'pdpe-1',
  draftReviewId: 'review-1',
  sourceTurnId: 'turn-1',
  provider: 'siliconflow',
  model: 'Qwen/Qwen2.5-72B-Instruct',
  policyKey: 'persona_draft.remote_send_approved',
  requestHash: 'hash-1',
  createdAt: '2026-03-16T08:00:00.000Z'
})
```

Expected UI strings:

- `Provider Boundary Send`
- `Send approved draft`
- `No provider sends yet.`
- `response recorded`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the renderer does not yet load or render provider-send state.

**Step 3: Write minimal implementation**

Update `MemoryWorkspacePage.tsx` to:

- bind `listApprovedPersonaDraftProviderSends`
- bind `sendApprovedPersonaDraftToProvider`
- keep:
  - `approvedDraftProviderSendsByTurnId`
  - `approvedDraftProviderSendPendingByTurnId`
- when an approved review is present, load send history alongside handoff history
- on click:

```ts
await sendApprovedPersonaDraftToProvider({
  draftReviewId: review.draftReviewId
})
```

- refresh send history after success

Update `ApprovedPersonaDraftHandoffPanel.tsx` to render:

- existing export controls unchanged
- a new `Provider Boundary Send` subsection
- latest send summary:
  - provider / model
  - policy key
  - newest event status derived from the latest event

Do not add provider pickers, retry buttons, or deep event inspectors in this slice.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add approved draft provider send ui"
```

---

### Task 5: Add end-to-end coverage for the approved-draft provider send flow

**Files:**
- Create: `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`
- Modify: `src/main/services/approvedDraftProviderSendService.ts` if a small fixture gate is still needed

**Step 1: Write the failing test**

Create `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts` covering:

1. import a deterministic chat fixture
2. open `Memory Workspace`
3. create a reviewed persona draft sandbox turn
4. approve the draft
5. confirm `Approved Draft Handoff` is visible
6. click `Send approved draft`
7. verify the panel shows provider-send status
8. verify the latest send summary includes provider / model / policy key

Use:

- `FORGETME_E2E_FIXTURE`
- `FORGETME_E2E_USER_DATA_DIR`
- `FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE=1`

Expected deterministic UI assertions:

- `Provider Boundary Send`
- `Send approved draft`
- `response recorded`
- `persona_draft.remote_send_approved`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: FAIL because there is no send button or fixture-backed provider send path yet.

**Step 3: Write minimal implementation**

If needed, add a fixture short-circuit in `approvedDraftProviderSendService.ts`:

```ts
if (process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE === '1') {
  return {
    provider: route.provider,
    model: route.model,
    usage: { fixture: true },
    receivedAt: new Date().toISOString(),
    payload: {
      choices: [{
        message: {
          content: JSON.stringify({
            acknowledgement: 'received',
            summary: 'approved draft recorded'
          })
        }
      }]
    }
  }
}
```

Keep the fixture payload deterministic so the renderer can assert stable text.

**Step 4: Run the focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts src/main/services/approvedDraftProviderSendService.ts
git commit -m "test: add approved draft provider send coverage"
```

---

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- all focused unit tests PASS
- the new e2e approved-draft provider-send flow PASSes
- existing `10E` export flow remains unaffected by the new send controls

## Notes for the Implementer

- Keep `10E` export behavior intact; `10F` adds a second outbound action, not a replacement.
- Do not backfill or rewrite existing `provider_egress_artifacts` rows.
- Resist introducing provider selectors or generic outbound abstractions in this slice.
- If a shared helper inside `providerBoundaryService.ts` would genuinely remove duplication without widening scope, extract the smallest possible helper and stop there.
