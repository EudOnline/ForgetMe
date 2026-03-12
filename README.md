# ForgetMe

ForgetMe is a desktop-first private archive vault for preserving chat logs, images, and documents as traceable personal evidence.

## MVP Scope

- Import chat, image, and document files in batches
- Freeze originals into a local content-addressed vault
- Record batch metadata, duplicate classification, parsed summaries, people anchors, relations, and audit logs in SQLite
- Search by keyword and file kind
- Perform logical delete with audit logging
- Generate person merge candidates into a review queue
- Approve, reject, and undo review decisions with journal history
- Browse approved canonical people, person timelines, and relationship graphs

## Local Setup

```bash
npm install
npm run dev
```

## Test Commands

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts
npm run test:e2e -- tests/e2e/person-review-flow.spec.ts
npm run build
```

## App Data Directory

- Development default: `.local-dev/forgetme`
- End-to-end test override: `FORGETME_E2E_USER_DATA_DIR`
- Production default: Electron `userData`

## Supported Import Formats

- Chat: `.json`, `.txt`
- Images: `.jpg`, `.jpeg`, `.png`, `.heic`
- Documents: `.pdf`, `.docx`, `.txt`

## Deletion Semantics

The MVP only implements logical delete:

- batch and file metadata are marked deleted in SQLite
- originals on disk remain untouched
- an audit entry is written with action `delete.logical`

## Phase Two Review Model

- Candidate understanding never mutates the formal person view directly
- Pending merge and event-cluster candidates land in the review queue first
- Approved formal views only read approved canonical people, approved event clusters, and approved graph edges
- Every approve / reject / undo action writes a journal entry
- Approved merge decisions remain undoable and restore prior memberships
- Manual relationship labels are stored as approved graph annotations

## Phase Three Multimodal Layer

Phase three adds a multimodal evidence enhancement layer with these building blocks:

- queued enrichment jobs, raw artifacts, low-risk enriched evidence, and high-risk structured field candidates
- field-level risk routing: low-risk evidence auto-enters the evidence layer, high-risk fields enter the shared review queue
- approved enriched evidence is now consumed by search, person detail, timeline evidence, and document evidence views
- enrichment jobs and document evidence pages are available in the app for inspection and rerun actions

### Provider Configuration

The model gateway is routed through `LiteLLM` and can be configured with:

- `FORGETME_LITELLM_BASE_URL`
- `FORGETME_DEFAULT_MODEL_PROVIDER`
- `FORGETME_LITELLM_TIMEOUT_MS`
- `FORGETME_LITELLM_RETRY_COUNT`
- `SILICONFLOW_API_KEY`
- `OPENROUTER_API_KEY`
- task-specific model overrides such as `FORGETME_MODEL_DOCUMENT_OCR_SILICONFLOW`

### Risk Boundary

Current risk policy keeps the trust boundary narrow:

- generic OCR text, layout blocks, image summaries, dates, and locations are treated as low-risk evidence
- identity, license, education, and participant-fragment style fields are treated as high-risk candidate fields
- high-risk approvals and rejections are journaled and can be undone through the same decision log model as phase two

### Multimodal Verification

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts
npm run test:e2e -- tests/e2e/person-review-flow.spec.ts
npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts
npm run build
```

### Phase Four Operational Layer

Phase four extends the archive with:

- a local enrichment runner that continuously consumes pending `enrichment_jobs`
- per-attempt execution history via `enrichment_attempts`
- deterministic attribution rules for approved structured fields
- formal person profile projection into `person_profile_attributes`
- profile-level candidate review and undo support using the shared `review_queue` and `decision_journal`

### Phase Four Verification

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts
npm run test:e2e -- tests/e2e/person-review-flow.spec.ts
npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts
npm run test:e2e -- tests/e2e/operational-runner-profile-flow.spec.ts
npm run build
```

### Phase Five Review Workbench

Phase five adds a dedicated single-item review workbench for high-risk operator review:

- one dedicated workbench for `structured_field_candidate` and `profile_attribute_candidate`
- source file, source evidence, upstream candidate, and journal trace in one screen
- approve / reject / undo actions rendered beside formal-profile impact preview
- explicit stale-state messaging when the selected item is no longer pending

### Phase Five Verification

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts
npm run test:e2e -- tests/e2e/person-review-flow.spec.ts
npm run test:e2e -- tests/e2e/multimodal-review-flow.spec.ts
npm run test:e2e -- tests/e2e/operational-runner-profile-flow.spec.ts
npm run test:e2e -- tests/e2e/review-workbench-single-item-flow.spec.ts
npm run build
```

### Phase Six A Preservation Baseline

Phase 6A1 adds the first preservation baseline on top of the existing local archive:

- export the current local archive into a directory package with `manifest.json`, `database/archive.sqlite`, and copied `vault/originals` objects
- restore an export package into a fresh app-data root and run baseline integrity checks against the manifest
- expose a dedicated `Preservation` page for export / restore actions

Current limitation:

- the export artifact is a directory package, not a compressed or encrypted archive yet

### Phase Six A Verification

```bash
npm run test:unit -- tests/unit/shared/phaseSixContracts.test.ts
npm run test:unit -- tests/unit/main/backupManifestService.test.ts tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts
npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts
npm run build
```

### Phase Six A2 Provider Boundary Baseline

Phase 6A2 adds the first auditable provider-boundary baseline for remote multimodal enrichment:

- outbound remote requests now use a metadata-only envelope instead of leaking absolute local filesystem paths
- baseline redaction policies are persisted in SQLite and currently remove `frozenPath` from the provider request shape
- request / response / error boundary events are recorded into provider egress audit tables for later inspection
- `Enrichment Jobs` now exposes a `Boundary` action so operators can inspect the first boundary audit directly in the app

### Phase Six A2 Verification

```bash
npm run test:unit -- tests/unit/main/dbPhaseSixA2.test.ts tests/unit/main/providerBoundaryService.test.ts tests/unit/main/enrichmentExecutionService.test.ts tests/unit/main/enrichmentReadService.test.ts tests/unit/renderer/enrichmentJobsPage.test.tsx
npm run test:e2e -- tests/e2e/provider-boundary-audit-flow.spec.ts
npm run build
```

### Phase Six B1 People-Centric Inbox

Phase 6B1 starts the operator-efficiency layer with a people-centric review inbox inside `Review Workbench`:

- pending workbench items are grouped by canonical person before the operator drills into a single item
- each person summary shows pending count, field coverage, conflict count, and whether a continuous sequence exists
- selecting a person filters the workbench sidebar to that person's pending items while keeping the existing evidence / impact / undo flow intact

### Phase Six B1 Verification

```bash
npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx
npm run build
```

### Phase Six B2 Conflict Groups

Phase 6B2 now extends `Review Workbench` with the first conflict-group and continuous-review baseline:

- pending items are grouped by `canonical person + item type + field key`
- each group shows pending count, distinct candidate values, and whether the group is currently in conflict
- selecting a group filters the workbench sidebar to that group only
- a `Conflict Compare` panel summarizes distinct values and their current counts inside the selected group
- `Previous` / `Next` plus `j` / `k` navigation move through the current visible scope without changing write-path semantics
- after approve / reject, the workbench keeps the current group context when possible and falls back to the current person when the group is exhausted

### Phase Six B2 Verification

```bash
npm run test:unit -- tests/unit/main/reviewWorkbenchReadService.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run build
npx playwright test tests/e2e/review-workbench-single-item-flow.spec.ts
```

### Current Operational Note

The local-first runner, shared review queue, formal approved profile read model, and phase-five single-item review workbench are now wired end-to-end.
Phase 6 now includes the preservation export / restore baseline, the provider-boundary audit baseline, the people-centric review inbox baseline, and the conflict-group compare / continuous-navigation slice inside 6B2.
The next validated follow-up inside 6B is 6B3: safe batch approval, decision batch journaling, and replay / undo on top of the current conflict-group workflow.
See `docs/plans/2026-03-11-phase-six-preservation-operator-efficiency-design.md` for the agreed roadmap.
