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

## Architecture Snapshot

- renderer root is `src/renderer/app-shell/AppShell.tsx`
- preload bridge is composed from `src/preload/modules/*`
- main-process IPC registration is assembled in `src/main/bootstrap/registerIpc.ts`
- domain entrypoints live under `src/main/modules/{import,people,review,workspace,objective,ops}`
- renderer fallback access is assembled from `src/renderer/clients/*`, with `src/renderer/archiveApi.ts` acting as the thin bridge entrypoint

## Test Commands

```bash
npm run lint
npm run test:typecheck
npm run test:unit
npm run test:e2e:objective
npm run verify:release
```

The release verification gate bundles the following smoke suite and packaging check:

```bash
npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/person-review-flow.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
```

## Distribution Commands

```bash
npm run pack
npm run dist
npm run release:doctor
npm run dist:release
```

- `npm run pack` builds an unpacked app bundle into `release/`
- `npm run dist` builds installer artifacts into `release/` and still allows ad-hoc signing in local environments
- `npm run release:doctor` prints whether signing and notarization inputs are complete for a formal macOS release
- `npm run dist:release` hard-fails before packaging unless both signing and notarization credentials are present
- `npm run verify:release` now ends with `npm run pack`, so the release gate fails if packaging regresses

### macOS Signing & Notarization

The repository is now configured for hardened-runtime mac builds and can be notarized when release credentials are present.

- Signing inputs:
  - `CSC_LINK` for a base64-encoded or file-backed Developer ID certificate
  - `CSC_KEY_PASSWORD` for the certificate password
  - optional `CSC_NAME` when the signing identity is already installed in the keychain
- Notarization inputs:
  - App Store Connect API key flow: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - or Apple ID flow: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

Use `npm run release:doctor` to confirm which credentials are still missing before a release build.

Without those credentials, local `npm run pack` and `npm run dist` still work as packaging checks, but electron-builder will fall back to ad-hoc signing and skip notarization. Use `npm run dist:release` when the build must refuse that fallback.

## Release Readiness

Use the release checklist in `docs/release/v1-rc-checklist.md` before calling the repository RC-ready. It captures the automated gate, preservation drill, dirty-data drill, hosted-share drill, and the remaining manual sanity checks.

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

### Phase Six A Preservation & Recovery

Phase 6A now covers the full first preservation slice on top of the existing local archive:

- export the current local archive into a manifest-backed package with optional password-based encrypted payloads
- restore a package into a fresh app-data root and run integrity checks against the manifest
- run repeatable recovery drills with per-check expected / actual diff details
- expose a dedicated `Preservation` page for export, restore, encrypted package handling, and drill reporting

### Phase Six A Verification

```bash
npm run test:unit -- tests/unit/shared/phaseSixContracts.test.ts
npm run test:unit -- tests/unit/main/backupManifestService.test.ts tests/unit/main/backupExportService.test.ts tests/unit/main/restoreService.test.ts tests/unit/renderer/preservationPage.test.tsx
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

### Phase Six B3 Safe Batch Approval & Replay

Phase 6B3 now completes the first tightly-scoped batch decision and replay flow on top of the conflict-group workbench:

- only the current selected `profile_attribute_candidate` group can show `Batch Approve`
- the backend hard-gates the flow to `>= 2 pending + no conflict + same group`
- confirmation creates a dedicated `decision_batch` journal while still expanding to member decision journals
- the existing undo history entry point now shows batch-friendly summaries, supports `Undo Batch`, and exposes replay details
- review history can be filtered by keyword, and `Search` now returns decision-journal hits beside archive file hits

### Phase Six B3 Verification

```bash
npm run test:unit -- tests/unit/main/reviewQueueService.test.ts tests/unit/main/searchService.test.ts tests/unit/shared/phaseSixContracts.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx tests/unit/renderer/searchPage.test.tsx
npx playwright test tests/e2e/review-workbench-single-item-flow.spec.ts tests/e2e/review-workbench-safe-batch-flow.spec.ts
npm run build
```

### Phase Ten Approved-Draft Outbound & Share

Phase 10 now carries the approved-draft outbound stack through local publication, hosted share links, and a human-readable share surface:

- reviewed persona drafts can be approved, exported as internal handoff JSON, sent through provider-boundary destinations, retried manually or automatically, and recovered after app restart
- approved drafts can also be published as local share packages that contain:
  - `publication.json`
  - `manifest.json`
  - `index.html`
  - `styles.css`
- approved drafts can create hosted share links from those local share packages and revoke hosted share links when access should be removed
- publication and hosted-share history are journal-backed and visible in `Memory Workspace`, replay, search, and review history
- replay stays non-mutating, but already-generated share pages can still be opened as a read-only action
- opening a share page now validates the package boundary before calling the OS open handler

### Phase Ten Verification

```bash
npm run test:unit -- tests/unit/shared/phaseTenApprovedDraftHostedShareLinkContracts.test.ts tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/searchService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/searchPage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts
npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
npm run build
```

### Memory Workspace Completion Baseline

`Memory Workspace` now covers the archive-backed conversational slice end to end:

- immutable saved-session replay for global, person, and group scopes
- deterministic multi-turn follow-up continuity inside the same saved session via a visible `Conversation Context` card
- quote-backed evidence reads, advice-mode responses, and persona-request guardrails with reviewed draft sandbox flows
- approved-draft publication, provider-send, hosted-share creation, hosted-share revoke, and replay-safe share-surface access from the same workspace

### Message-Native Objective Runtime Baseline

`Objective Workbench` replaces the old run-centric agent surface with an `objective / thread / message / proposal` runtime.

- a facilitator starts scoped objectives and keeps deliberation inside explicit threads instead of raw console runs
- proactive triggers and follow-up suggestions can now seed fresh objectives instead of stopping at passive suggestions
- proposals can pause for governance challenge, operator confirmation, or external verification before any mutation happens
- external verification is brokered through a bounded web-search boundary with structured `supported / contradicted / mixed / insufficient` verdicts, captured evidence, and source tracing
- facilitator control flow is driven by explicit thread-state planning so stalled, evidence-gated, operator-gated, and converged threads are surfaced as distinct runtime states
- subagents stay constrained to proposal-scoped work, record an explicit execution plan before tool use, enforce delegation depth, and keep budget use attributable to planned steps
- proposal provenance, tool executions, planner checkpoints, and subagent lineage are visible in `Objective Workbench` so operators can audit why a thread moved forward, paused, or stopped
- objective state, thread messages, proposals, checkpoints, operational memories, and policy history are all persisted in SQLite

### Objective Runtime Traffic via LiteLLM

Objective-runtime traffic still flows through the existing `LiteLLM` gateway and the same provider configuration:

- `FORGETME_LITELLM_BASE_URL`
- `FORGETME_DEFAULT_MODEL_PROVIDER`
- `FORGETME_LITELLM_TIMEOUT_MS`
- `FORGETME_LITELLM_RETRY_COUNT`
- `SILICONFLOW_API_KEY`
- `OPENROUTER_API_KEY`

Optional role-scoped routing for `memory_dialogue` can use env vars such as `FORGETME_MODEL_MEMORY_DIALOGUE_WORKSPACE_SILICONFLOW`.
The gateway also forwards objective/runtime metadata so outbound model traffic stays auditable.

### Message-Native Objective Runtime Verification

```bash
npm run test:typecheck
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/objectiveModule.test.ts tests/unit/main/objectiveRuntimeLegacyImports.test.ts tests/unit/main/agentIpc.test.ts tests/unit/main/bootstrap/registerIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/unit/repo/engineeringConvergenceStructure.test.ts
npm run test:e2e:objective
npm run build
```

### Completion Verification

```bash
npm run lint
npm run test:typecheck
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/review-workbench-single-item-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts
npm run build
```

### Current Operational Note

The local-first runner, shared review queue, formal approved profile read model, and phase-five single-item review workbench are now wired end-to-end.
The archive now also carries `Memory Workspace` through deterministic saved-session follow-up continuity, quote-backed evidence, advice responses, persona guardrails, reviewed draft sandbox flows, internal handoff, provider-boundary send, retry recovery, local publication/share packaging, hosted share-link creation and revocation, and human-readable share-page replay.
The current engineering-convergence baseline uses an `AppShell` renderer root, domain preload modules, bootstrap-owned IPC registration, feature-owned main-process module entrypoints, and a thin renderer archive bridge assembled from domain clients.
The latest approved-draft share slice is documented in `docs/plans/2026-03-19-phase-ten-m-approved-draft-hosted-share-link-implementation-plan.md`.
