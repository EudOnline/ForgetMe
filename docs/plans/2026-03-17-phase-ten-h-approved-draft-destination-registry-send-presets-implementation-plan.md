# Phase 10H Approved Draft Destination Registry & Send Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add built-in destination selection and last-used send presets for approved-draft provider sends so operators can choose where an approved draft goes before sending, while keeping the outbound slice narrow and auditable.

**Architecture:** Introduce a small built-in destination registry for approved-draft sends, extend the send input with an optional `destinationId`, resolve routes through existing `modelGatewayService` semantics, persist destination metadata into provider-boundary audit facts and successful-send journal payloads, and add a compact renderer selector that remembers the last-used destination without creating a new management page.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, Better SQLite3, Vitest, Playwright.

---

## Scope Decisions

- `Phase 10H approved draft destination registry & send presets` **does include**:
  - built-in approved draft send destinations
  - a destination registry read API
  - an optional `destinationId` on approved-draft sends
  - destination metadata persisted in provider-boundary artifacts
  - successful-send journal payloads carrying destination metadata
  - renderer-side destination selection plus last-used localStorage persistence
  - replay/search visibility for chosen destination details

- `Phase 10H approved draft destination registry & send presets` **does not include**:
  - custom destination CRUD
  - publish/share links
  - retry orchestration
  - failed-send journal entries
  - a new outbound dashboard
  - provider API key or auth settings UI

- `Phase 10H` policy rules:
  1. approved-draft send still remains approved-only
  2. missing `destinationId` must continue to mean the default `memory_dialogue` route
  3. destination identity must be persisted on both audit artifacts and successful-send journal payloads
  4. first slice uses built-in destinations only; no editable registry yet

---

### Task 1: Add shared destination registry contracts and IPC shapes

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts` to cover:

1. a new `ApprovedDraftSendDestination` shape with:
   - `destinationId`
   - `label`
   - `resolutionMode`
   - `provider`
   - `model`
   - `isDefault`
2. a new archive API method:
   - `listApprovedDraftSendDestinations(): Promise<ApprovedDraftSendDestination[]>`
3. `SendApprovedPersonaDraftToProviderInput` accepting:
   - `draftReviewId`
   - optional `destinationId`
4. `ApprovedPersonaDraftProviderSendArtifact` and `SendApprovedPersonaDraftToProviderResult` carrying:
   - `destinationId`
   - `destinationLabel`

Extend `tests/unit/renderer/archiveApi.test.ts` to expect:

```ts
await expect(archiveApi.listApprovedDraftSendDestinations()).resolves.toEqual([])
await expect(archiveApi.sendApprovedPersonaDraftToProvider({
  draftReviewId: 'review-1',
  destinationId: 'openrouter-qwen25-72b'
})).resolves.toBeNull()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the contracts, schemas, and archive API methods do not exist yet.

**Step 3: Write minimal implementation**

Add to `src/shared/archiveContracts.ts`:

```ts
export type ApprovedDraftSendDestination = {
  destinationId: string
  label: string
  resolutionMode: 'memory_dialogue_default' | 'provider_model'
  provider: 'siliconflow' | 'openrouter'
  model: string
  isDefault: boolean
}
```

Update:

- `ApprovedPersonaDraftProviderSendArtifact`
- `SendApprovedPersonaDraftToProviderInput`
- `SendApprovedPersonaDraftToProviderResult`
- `ArchiveApi`

Add to `src/shared/ipcSchemas.ts`:

```ts
export const approvedDraftSendDestinationIdSchema = z.string().min(1)
export const sendApprovedPersonaDraftToProviderInputSchema = approvedPersonaDraftReviewIdSchema.extend({
  destinationId: approvedDraftSendDestinationIdSchema.optional()
})
```

Update `src/renderer/archiveApi.ts` fallback and IPC bridge to include:

```ts
listApprovedDraftSendDestinations: async () => [] as ApprovedDraftSendDestination[]
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/renderer/archiveApi.ts tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: add approved draft send destination contracts"
```

---

### Task 2: Add built-in destination registry and destination-aware send persistence

**Files:**
- Create: `src/main/services/approvedDraftSendDestinationService.ts`
- Create: `src/main/services/migrations/017_persona_draft_send_destinations.sql`
- Modify: `src/main/services/approvedDraftProviderSendService.ts`
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `tests/unit/main/approvedDraftProviderSendService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Modify: `tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts`

**Step 1: Write the failing tests**

Create or extend service coverage for:

1. `listApprovedDraftSendDestinations()` returns exactly 3 built-in destinations:
   - `memory-dialogue-default`
   - `siliconflow-qwen25-72b`
   - `openrouter-qwen25-72b`
2. sending with no `destinationId` persists:
   - `destinationId = 'memory-dialogue-default'`
   - `destinationLabel = 'Memory Dialogue Default'`
3. sending with `destinationId = 'openrouter-qwen25-72b'`:
   - resolves an OpenRouter route
   - persists `destinationId` / `destinationLabel`
   - returns those fields in the send result
4. listing saved provider sends returns destination metadata for new rows
5. legacy rows with null destination columns still map back to the default destination on read
6. IPC exposes:
   - `archive:listApprovedDraftSendDestinations`
   - `archive:sendApprovedPersonaDraftToProvider` with optional `destinationId`

Example expectations:

```ts
expect(sent).toMatchObject({
  destinationId: 'openrouter-qwen25-72b',
  destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
  provider: 'openrouter',
  model: 'qwen/qwen-2.5-72b-instruct'
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: FAIL because destination columns, registry service, and IPC handlers do not exist yet.

**Step 3: Write minimal implementation**

Create `src/main/services/approvedDraftSendDestinationService.ts` with:

- one helper returning the current default destination from `resolveModelRoute({ taskType: 'memory_dialogue' })`
- two fixed provider-model presets matching the compare defaults
- `listApprovedDraftSendDestinations()`
- `getApprovedDraftSendDestination(destinationId?: string)`

Add migration `017_persona_draft_send_destinations.sql`:

```sql
alter table persona_draft_provider_egress_artifacts add column destination_id text;
alter table persona_draft_provider_egress_artifacts add column destination_label text;
```

Update `approvedDraftProviderSendService.ts` so:

- send input accepts `destinationId`
- route resolution uses the registry service
- artifact rows persist `destination_id` and `destination_label`
- successful send result returns them
- read-side mapping falls back to `memory-dialogue-default` when legacy rows lack values

Add IPC handlers for:

```ts
archive:listApprovedDraftSendDestinations
archive:sendApprovedPersonaDraftToProvider
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/approvedDraftSendDestinationService.ts src/main/services/migrations/017_persona_draft_send_destinations.sql src/main/services/approvedDraftProviderSendService.ts src/main/ipc/memoryWorkspaceIpc.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "feat: add approved draft send destinations"
```

---

### Task 3: Add destination-aware journal formatting and replay visibility

**Files:**
- Modify: `src/main/services/journalService.ts`
- Modify: `tests/unit/main/searchService.test.ts`
- Modify: `tests/unit/renderer/searchPage.test.tsx`
- Modify: `tests/unit/renderer/reviewQueuePage.test.tsx`

**Step 1: Write the failing tests**

Extend the search and replay coverage to show that approved-draft send history can surface destination identity.

Add expectations such as:

```ts
expect(results).toContainEqual(expect.objectContaining({
  decisionType: 'send_approved_persona_draft_to_provider',
  replaySummary: 'Approved draft sent to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
}))
```

And in renderer tests:

```ts
expect(screen.getByText('Approved draft sent to provider')).toBeInTheDocument()
expect(screen.getByText('Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: FAIL because journal formatting does not use destination labels yet.

**Step 3: Write minimal implementation**

Update `journalService.ts` so that for `persona_draft_review` targets:

- `destinationLabel` takes precedence over plain `provider` when present
- old records without `destinationLabel` still render as before

Keep the logic narrow:

- do not change unrelated decision types
- do not hide `sourceTurnId`
- preserve backward compatibility for older `10G` send rows

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/journalService.ts tests/unit/main/searchService.test.ts tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
git commit -m "feat: label approved draft send destinations"
```

---

### Task 4: Add destination selector and last-used preset persistence in Memory Workspace

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Extend `tests/unit/renderer/memoryWorkspacePage.test.tsx` to cover:

1. `Approved Draft Handoff` renders a `Destination` selector when review is approved
2. the selector shows:
   - `Memory Dialogue Default`
   - `SiliconFlow / Qwen2.5-72B-Instruct`
   - `OpenRouter / qwen-2.5-72b-instruct`
3. clicking `Send approved draft` forwards the selected `destinationId`
4. the last-used destination is restored from localStorage on next render
5. latest send summary renders the chosen destination label

Extend `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` to cover:

1. replayed approved turns show the persisted destination label for existing sends
2. replay stays read-only; no replay-only state path is introduced

Example expectation:

```ts
expect(sendApprovedPersonaDraftToProvider).toHaveBeenCalledWith({
  draftReviewId: 'review-send-1',
  destinationId: 'openrouter-qwen25-72b'
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the approved-draft handoff panel does not expose destination selection yet.

**Step 3: Write minimal implementation**

Update `MemoryWorkspacePage.tsx` to add:

- a localStorage key such as `forgetme.memoryWorkspace.approvedDraftSendDestinationId`
- a loader/writer for the last-used destination id
- destination list fetch on mount
- selected destination state
- send action wiring that forwards `destinationId`

Update `ApprovedPersonaDraftHandoffPanel.tsx` to render:

- a compact `Destination` label plus `<select>`
- the selected value
- latest send `destinationLabel`

Keep the UI narrow:

- no destination management button
- no inline custom model editing
- no per-turn preset save flow

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/components/ApprovedPersonaDraftHandoffPanel.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: add approved draft send destination selector"
```

---

### Task 5: Add focused end-to-end coverage for destination selection

**Files:**
- Modify: `tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts`

**Step 1: Write the failing e2e assertions**

Extend the provider-send flow to assert:

1. the approved-draft handoff panel renders the destination selector
2. selecting `OpenRouter / qwen-2.5-72b-instruct` before send:
   - changes the send target
   - keeps the latest send summary/audit visible
3. the latest summary includes the selected destination label

**Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: FAIL because the UI cannot change destination yet.

**Step 3: Write minimal refinements**

- stabilize destination selector labels
- keep fixture mode deterministic even when switching from default route to explicit preset
- avoid widening the flow beyond choosing a built-in destination and sending once

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
git commit -m "test: cover approved draft send destinations"
```

---

## Final Verification

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftProviderSendContracts.test.ts tests/unit/main/dbPhaseTenFApprovedDraftProviderSend.test.ts tests/unit/main/approvedDraftProviderSendService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-handoff-flow.spec.ts tests/e2e/memory-workspace-approved-draft-provider-send-flow.spec.ts
```

Expected:

- all focused unit suites PASS
- approved draft export flow still PASSes
- approved draft provider-send flow PASSes with explicit destination selection
- successful approved-draft sends now retain destination identity in audit and replay history

## Notes for the Implementer

- Reuse compare-style provider/model labels where possible; avoid inventing a second naming scheme.
- Keep backward compatibility for `10F/10G` send rows that do not yet have destination columns.
- Do not add editable destination management in this slice.
- Resist pulling compare-target state into a shared abstraction unless duplication is clearly harmful; narrow copy is better than premature generalization here.
