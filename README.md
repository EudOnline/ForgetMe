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

### Current Operational Note

The local-first runner, shared review queue, formal approved profile read model, and phase-five single-item review workbench are now wired end-to-end.
The next meaningful step is stronger operator ergonomics and carefully scoped batch-review support on top of the same auditable write path.
