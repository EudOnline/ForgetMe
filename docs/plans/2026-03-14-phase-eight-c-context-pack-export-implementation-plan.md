# Phase 8C Context Pack Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Export stable person and group context packs as local JSON artifacts so ForgetMe can hand trusted archive context to later persona / external-model workflows without coupling them directly to dossier or portrait internals.

**Architecture:** Add a dedicated `contextPackService` that builds shareable person/group packs from the existing read models, then a small `contextPackExportService` that writes deterministic JSON files and returns export metadata. Expose the export flow through a focused IPC/API surface and wire minimal renderer controls into `Person Dossier` and `Group Portrait`, while keeping provider-boundary integration metadata-first in this slice.

**Tech Stack:** Electron IPC, React renderer, TypeScript, SQLite-backed read services, Node `fs` / `path` / `crypto`, Vitest, Playwright.

---

## Scope Decisions

- `8C` **does include**:
  - `Person Context Pack` export
  - `Group Context Pack` export
  - export mode toggle: `approved_only` vs `approved_plus_derived`
  - deterministic JSON artifact writing to a chosen directory
  - exported metadata that is ready for later provider-boundary / egress-audit handoff
  - renderer controls from dossier / group portrait views

- `8C` **does not include in this first slice**:
  - direct remote-provider send from the export action
  - global scope context pack export
  - editable pack curation UI
  - ZIP packaging, encryption, or preservation-style backup semantics
  - persona prompt generation or full agent execution

- The exported pack is a **shareable read artifact**, not a new truth table.

---

## Assumptions

- `8A` and `8B` are already implemented and verified in the current worktree.
- Existing read models (`getPersonDossier`, `getGroupPortrait`, review/journal reads) remain the source of truth.
- Local JSON export is the right first cut because it gives downstream consumers a stable interface without yet expanding the remote egress surface.
- Provider-boundary integration in `8C` first slice means: the export format contains stable share metadata and can be wrapped later by the existing boundary layer without redesigning the pack schema.

---

### Task 1: Add shared context-pack contracts and IPC schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/phaseEightContextPackContracts.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/shared/phaseEightContextPackContracts.test.ts` covering:

```ts
type ContextPackExportMode = 'approved_only' | 'approved_plus_derived'

type ContextPackScope =
  | { kind: 'person'; canonicalPersonId: string }
  | { kind: 'group'; anchorPersonId: string }

type ContextPackSourceRef = {
  kind: 'person' | 'group' | 'file' | 'journal' | 'review'
  id: string
  label: string
}

type ContextPackSectionItem = {
  id: string
  label: string
  value: string
  displayType: DossierDisplayType
  sourceRefs: ContextPackSourceRef[]
}

type PersonContextPack = {
  formatVersion: 'phase8c1'
  exportedAt: string | null
  mode: ContextPackExportMode
  scope: { kind: 'person'; canonicalPersonId: string }
  title: string
  identity: { ... }
  sections: ContextPackSection[]
  timelineHighlights: ContextPackTimelineEntry[]
  relationships: ContextPackRelationshipEntry[]
  ambiguity: ContextPackAmbiguitySummary[]
  sourceRefs: ContextPackSourceRef[]
  shareEnvelope: {
    requestShape: 'local_json_context_pack'
    policyKey: 'context_pack.local_export_baseline'
  }
}

type GroupContextPack = {
  formatVersion: 'phase8c1'
  exportedAt: string | null
  mode: ContextPackExportMode
  scope: { kind: 'group'; anchorPersonId: string }
  title: string
  members: ContextPackGroupMember[]
  timelineWindows: ContextPackTimelineEntry[]
  sharedEvidenceSources: ContextPackSourceRef[]
  narrative: ContextPackNarrativeEntry[]
  ambiguity: ContextPackAmbiguitySummary[]
  shareEnvelope: {
    requestShape: 'local_json_context_pack'
    policyKey: 'context_pack.local_export_baseline'
  }
}

type ContextPackExportResult = {
  status: 'exported'
  filePath: string
  fileName: string
  sha256: string
  exportedAt: string
  mode: ContextPackExportMode
  scope: ContextPackScope
}
```

Also cover API signatures:

```ts
selectContextPackExportDestination: () => Promise<string | null>
getPersonContextPack: (input: { canonicalPersonId: string; mode?: ContextPackExportMode }) => Promise<PersonContextPack | null>
getGroupContextPack: (input: { anchorPersonId: string; mode?: ContextPackExportMode }) => Promise<GroupContextPack | null>
exportPersonContextPack: (input: { canonicalPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
exportGroupContextPack: (input: { anchorPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContextPackContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the contracts and fallback API methods do not exist yet.

**Step 3: Write minimal implementation**

Add shared types plus Zod schemas:

- `contextPackExportModeSchema`
- `contextPackDestinationSchema`
- `personContextPackInputSchema`
- `groupContextPackInputSchema`
- `personContextPackExportInputSchema`
- `groupContextPackExportInputSchema`

Keep the contract intentionally small:

- person and group only
- local directory export only
- no global pack yet

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContextPackContracts.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

---

### Task 2: Build person/group context-pack builders and JSON export service

**Files:**
- Create: `src/main/services/contextPackService.ts`
- Create: `tests/unit/main/contextPackService.test.ts`
- Reference: `src/main/services/personDossierService.ts`
- Reference: `src/main/services/groupPortraitService.ts`
- Reference: `src/main/services/memoryWorkspaceService.ts`

**Step 1: Write the failing test**

Create `tests/unit/main/contextPackService.test.ts` covering:

1. `buildPersonContextPack(...)` returns `approved_only` packs without derived summaries.
2. `buildPersonContextPack(...)` returns `approved_plus_derived` packs with ambiguity and timeline summaries preserved.
3. `buildGroupContextPack(...)` returns member, timeline, narrative, and ambiguity sections.
4. `exportContextPackToDirectory(...)` writes deterministic JSON and returns `sha256` metadata.
5. Missing people / groups return `null` rather than exporting broken artifacts.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/contextPackService.test.ts
```

Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement:

- `buildPersonContextPack(db, { canonicalPersonId, mode })`
- `buildGroupContextPack(db, { anchorPersonId, mode })`
- `exportContextPackToDirectory({ destinationRoot, pack, fileStem })`

Rules:

- `approved_only` strips `derived_summary` sections/items/narratives.
- `approved_plus_derived` keeps approved + derived + ambiguity + coverage signals.
- `open_conflict` and `coverage_gap` remain visible in both modes because they are boundary signals, not optional fluff.
- Exported JSON includes:
  - `formatVersion: 'phase8c1'`
  - stable `scope`, `mode`, `title`
  - deduped `sourceRefs`
  - `shareEnvelope.policyKey = 'context_pack.local_export_baseline'`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/contextPackService.test.ts
```

Expected: PASS

---

### Task 3: Expose context-pack export through IPC, preload, and renderer API

**Files:**
- Create: `src/main/ipc/contextPackIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

Extend `tests/unit/renderer/archiveApi.test.ts` with:

```ts
await expect(archiveApi.selectContextPackExportDestination()).resolves.toBeNull()
await expect(archiveApi.getPersonContextPack({ canonicalPersonId: 'cp-1' })).resolves.toBeNull()
await expect(archiveApi.getGroupContextPack({ anchorPersonId: 'cp-1' })).resolves.toBeNull()
await expect(archiveApi.exportPersonContextPack({
  canonicalPersonId: 'cp-1',
  destinationRoot: '/tmp/context-packs'
})).resolves.toBeNull()
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the IPC/API methods do not exist yet.

**Step 3: Write minimal implementation**

Add handlers:

- `archive:selectContextPackExportDestination`
- `archive:getPersonContextPack`
- `archive:getGroupContextPack`
- `archive:exportPersonContextPack`
- `archive:exportGroupContextPack`

Reuse the directory-picker pattern from preservation IPC, but keep a separate env hook for e2e:

- `FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/main/contextPackService.test.ts tests/unit/shared/phaseEightContextPackContracts.test.ts
```

Expected: PASS

---

### Task 4: Add export controls to person dossier and group portrait

**Files:**
- Modify: `src/renderer/components/PersonDossierView.tsx`
- Modify: `src/renderer/components/GroupPortraitView.tsx`
- Modify: `src/renderer/pages/PersonDetailPage.tsx`
- Modify: `src/renderer/pages/GroupPortraitPage.tsx`
- Modify: `tests/unit/renderer/personDossierPage.test.tsx`
- Modify: `tests/unit/renderer/groupPortraitPage.test.tsx`

**Step 1: Write the failing test**

Add renderer coverage for:

1. person dossier shows mode toggle + `Export context pack`
2. group portrait shows mode toggle + `Export context pack`
3. clicking export calls the correct API with selected mode and chosen destination
4. success state shows the exported file name

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
```

Expected: FAIL because the export controls do not exist yet.

**Step 3: Write minimal implementation**

UI rules:

- Default mode: `approved_plus_derived`
- Alternative mode: `approved_only`
- Person pages call `exportPersonContextPack(...)`
- Group pages call `exportGroupContextPack(...)`
- Keep the UX simple: one export button, one destination picker, one status message

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
```

Expected: PASS

---

### Task 5: Add end-to-end export coverage and update Phase 8 docs

**Files:**
- Create: `tests/e2e/context-pack-export-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Write the failing e2e test**

Cover:

1. exporting a person context pack writes a JSON file into the chosen destination
2. exporting a group context pack writes a JSON file into the chosen destination
3. the exported file includes `formatVersion`, `scope`, `mode`, and `shareEnvelope`

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/context-pack-export-flow.spec.ts
```

Expected: FAIL because the export flow does not exist yet.

**Step 3: Write minimal implementation refinements**

- Stabilize export file names:
  - `person-<canonicalPersonId>-context-pack.json`
  - `group-<anchorPersonId>-context-pack.json`
- Ensure export directories are created automatically.
- Ensure exported JSON is pretty-printed and deterministic enough for fixture assertions.

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContextPackContracts.test.ts tests/unit/main/contextPackService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/personDossierPage.test.tsx tests/unit/renderer/groupPortraitPage.test.tsx
npm run build
npx playwright test tests/e2e/context-pack-export-flow.spec.ts
```

Expected: PASS

---

## Implementation Notes

- Do **not** export raw local filesystem paths inside the context pack.
- Keep exported source refs human-readable where possible (`chat-1.json` over opaque IDs), but preserve IDs for machine use.
- `approved_only` means “no derived summaries,” not “hide unresolved ambiguity”; ambiguity is a safety signal and should remain.
- Avoid coupling external consumers to `PersonDossier` / `GroupPortrait` directly; the pack schema is the compatibility surface.

## Final Verification Checklist

- Person and group context packs export successfully as local JSON
- Export mode toggles between `approved_only` and `approved_plus_derived`
- Exported packs include stable scope, mode, source refs, and share metadata
- No absolute local paths leak into exported artifacts
- Dossier and portrait pages expose export actions
- Export flow is covered by unit tests and e2e
