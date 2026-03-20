# Agent Self Server Documentation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first production-ready agent documentation baseline for the ForgetMe self server so agents can discover capabilities, inspect contracts, understand safety semantics, and query docs at runtime without relying on stale prose.

**Architecture:** Reuse the existing typed code surface as the truth source: request shapes from `src/shared/ipcSchemas.ts`, shared output/domain contracts from `src/shared/archiveContracts.ts`, and live operation exposure from `src/preload/index.ts`. Add a thin semantic catalog layer in `src/shared`, generate machine-readable documentation artifacts into `docs/generated`, and expose a narrow metadata API over IPC so both in-process agents and future server transports can query capabilities consistently.

**Tech Stack:** Electron, TypeScript, Zod, Vitest, existing IPC registration in `src/main/ipc/*`, existing shared contracts in `src/shared/*`

**Execution Notes:** Use `@test-driven-development` for each implementation slice and `@verification-before-completion` before calling the feature complete. Keep the first slice rule-based and deterministic; do not add embeddings, vector search, or a separate documentation database.

**Scope Guardrails:**
- Do include operation catalogs, workflow catalogs, generated request-schema artifacts, runtime metadata IPC, and CI drift checks.
- Do include first-slice coverage for `memory-workspace`, `approved-draft`, `review`, and `preservation`.
- Do not include external docs hosting, cloud sync, external auth, public REST stabilization, or embedding-backed retrieval in this slice.
- Do not rewrite existing product flows just to fit the documentation model; wrap current behavior first.

---

### Task 1: Add shared agent documentation catalogs and failing contract coverage

**Files:**
- Create: `src/shared/agentOperationCatalog.ts`
- Create: `src/shared/agentWorkflowCatalog.ts`
- Create: `src/shared/agentPolicyCatalog.ts`
- Create: `src/shared/agentErrorCatalog.ts`
- Create: `tests/unit/shared/agentOperationCatalog.test.ts`
- Create: `tests/unit/shared/agentWorkflowCatalog.test.ts`

**Step 1: Write the failing shared catalog tests**

Create `tests/unit/shared/agentOperationCatalog.test.ts` covering:

1. every catalog entry has:
   - `operationId`
   - `invokeKey`
   - `domain`
   - `sideEffectLevel`
   - `idempotency`
   - `externalNetworkUse`
   - `requiresHumanReview`
2. `memory-workspace` entries include:
   - `askMemoryWorkspace`
   - `askMemoryWorkspacePersisted`
   - `runMemoryWorkspaceCompare`
3. `approved-draft` entries include:
   - `publishApprovedPersonaDraft`
   - `createApprovedPersonaDraftHostedShareLink`
   - `sendApprovedPersonaDraftToProvider`
4. write or outbound operations never use `sideEffectLevel = 'read_only'`

Create `tests/unit/shared/agentWorkflowCatalog.test.ts` covering:

1. workflow ids are unique
2. required first workflows exist:
   - `memory-workspace-persisted-session`
   - `approved-draft-publication`
   - `approved-draft-hosted-share-link`
   - `approved-draft-provider-send-and-retry`
   - `backup-export-and-restore-drill`
3. each workflow references only real `operationId` values from the operation catalog

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentOperationCatalog.test.ts tests/unit/shared/agentWorkflowCatalog.test.ts
```

Expected: FAIL because the catalog files and workflow records do not exist yet.

**Step 3: Add the minimal shared catalog implementations**

Create `src/shared/agentOperationCatalog.ts` with:

- `AgentOperationSpec` type
- `agentOperationCatalog` array
- first-slice entries for:
  - `memory-workspace`
  - `approved-draft`
  - `review`
  - `preservation`
- stable `operationId` values and actual `invokeKey` values matching `src/preload/index.ts`

Create `src/shared/agentWorkflowCatalog.ts` with:

- `AgentWorkflowSpec` type
- `agentWorkflowCatalog` array
- first-slice workflow definitions with:
  - `preconditions`
  - `successCriteria`
  - `operationSequence`
  - `branchRules`

Create `src/shared/agentPolicyCatalog.ts` and `src/shared/agentErrorCatalog.ts` with small initial arrays for:

- local-first data handling
- provider-boundary outbound rules
- review-gated write rules
- non-idempotent retry guidance

Keep the first slice manually curated and compact. Do not attempt full repo-wide coverage in this task.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentOperationCatalog.test.ts tests/unit/shared/agentWorkflowCatalog.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/agentOperationCatalog.ts src/shared/agentWorkflowCatalog.ts src/shared/agentPolicyCatalog.ts src/shared/agentErrorCatalog.ts tests/unit/shared/agentOperationCatalog.test.ts tests/unit/shared/agentWorkflowCatalog.test.ts
git commit -m "feat: add agent documentation catalogs"
```

### Task 2: Generate machine-readable documentation artifacts from shared contracts

**Files:**
- Create: `scripts/docs/build-agent-docs.ts`
- Create: `scripts/docs/render-agent-pages.ts`
- Create: `docs/generated/.gitkeep`
- Create: `docs/agent/README.md`
- Create: `docs/agent/glossary.md`
- Create: `docs/agent/policies/side-effects.md`
- Create: `docs/agent/policies/review-boundary.md`
- Create: `docs/agent/policies/provider-boundary.md`
- Create: `docs/agent/policies/retry-and-idempotency.md`
- Create: `tests/unit/shared/agentDocsBuild.test.ts`
- Modify: `package.json`

**Step 1: Write the failing docs-build tests**

Create `tests/unit/shared/agentDocsBuild.test.ts` covering:

1. `buildAgentDocsIndex(...)` emits:
   - `capability-index.json`
   - `operation-index.json`
   - `workflow-index.json`
   - `error-index.json`
2. generated operation entries include:
   - `operationId`
   - `invokeKey`
   - `requestSchemaRef`
   - `sideEffectLevel`
3. generated schema index includes request schema ids for at least:
   - `askMemoryWorkspacePersistedInputSchema`
   - `publishApprovedPersonaDraftInputSchema`
   - `createImportBatchInputSchema`
4. generated docs are deterministic across repeated runs

Also extend `package.json` expectations in the test so the repo surface includes:

- `docs:agent`
- `docs:agent:check`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentDocsBuild.test.ts
```

Expected: FAIL because no docs-build script or generated index helpers exist yet.

**Step 3: Implement the docs build pipeline**

Create `scripts/docs/build-agent-docs.ts` with focused helpers to:

1. read:
   - `agentOperationCatalog`
   - `agentWorkflowCatalog`
   - `agentPolicyCatalog`
   - `agentErrorCatalog`
2. emit JSON artifacts under `docs/generated/`:
   - `capability-index.json`
   - `operation-index.json`
   - `workflow-index.json`
   - `error-index.json`
   - `search-index.json`
3. write a first-slice schema manifest for exported request schemas used by the selected operations

Create `scripts/docs/render-agent-pages.ts` to render a minimal overview page and keep Markdown generation deterministic.

Update `package.json` with:

```json
{
  "docs:agent": "tsx scripts/docs/build-agent-docs.ts",
  "docs:agent:check": "tsx scripts/docs/build-agent-docs.ts --check"
}
```

If `tsx` is not already available, add it as a dev dependency instead of writing ad hoc node loaders.

Create human-readable policy docs in `docs/agent/policies/` and a short `docs/agent/README.md` that explains:

- contract truth sources
- generated artifact locations
- runtime discovery intent

**Step 4: Run test and build to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentDocsBuild.test.ts
npm run docs:agent
```

Expected: PASS, and `docs/generated/` contains fresh machine-readable artifacts.

**Step 5: Commit**

```bash
git add scripts/docs/build-agent-docs.ts scripts/docs/render-agent-pages.ts docs/generated docs/agent package.json tests/unit/shared/agentDocsBuild.test.ts
git commit -m "feat: generate agent documentation artifacts"
```

### Task 3: Expose runtime metadata discovery over IPC, preload, and renderer API

**Files:**
- Create: `src/main/ipc/agentDocsIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/main/agentDocsIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing IPC and API tests**

Create `tests/unit/main/agentDocsIpc.test.ts` covering:

1. `archive:listAgentCapabilities` returns grouped capability metadata
2. `archive:getAgentOperationSpec` validates `operationId` and returns one operation spec
3. `archive:getAgentWorkflowSpec` validates `workflowId` and returns one workflow spec
4. `archive:searchAgentDocs` returns ranked results with:
   - `kind`
   - `id`
   - `summary`
   - `riskMarkers`

Extend `tests/unit/preload/index.test.ts` and `tests/unit/renderer/archiveApi.test.ts` so both surfaces expect:

- `listAgentCapabilities()`
- `getAgentOperationSpec(operationId)`
- `getAgentWorkflowSpec(workflowId)`
- `searchAgentDocs(input)`

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/agentDocsIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the metadata IPC and renderer-facing methods do not exist yet.

**Step 3: Add minimal metadata contracts and IPC wiring**

Update `src/shared/archiveContracts.ts` with:

- `AgentCapabilitySummary`
- `AgentOperationSpec`
- `AgentWorkflowSpec`
- `AgentDocSearchInput`
- `AgentDocSearchResult`

Update `src/shared/ipcSchemas.ts` with:

- `agentOperationIdSchema`
- `agentWorkflowIdSchema`
- `agentDocSearchInputSchema`

Create `src/main/ipc/agentDocsIpc.ts` that:

1. serves catalog data from `src/shared/agent*Catalog.ts`
2. registers:
   - `archive:listAgentCapabilities`
   - `archive:getAgentOperationSpec`
   - `archive:getAgentWorkflowSpec`
   - `archive:searchAgentDocs`
3. keeps search rule-based using:
   - summary match
   - domain match
   - intent tag match
   - side-effect fit

Register the new IPC module in `src/main/index.ts`.

Update `src/preload/index.ts` and `src/renderer/archiveApi.ts` to expose these methods with fallback-safe behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/agentDocsIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/ipc/agentDocsIpc.ts src/main/index.ts src/preload/index.ts src/renderer/archiveApi.ts src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/main/agentDocsIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose agent documentation metadata"
```

### Task 4: Add workflow guides and policy docs for the highest-risk agent flows

**Files:**
- Create: `docs/agent/workflows/memory-workspace-session.md`
- Create: `docs/agent/workflows/review-approved-draft.md`
- Create: `docs/agent/workflows/publish-share-package.md`
- Create: `docs/agent/workflows/create-hosted-share-link.md`
- Create: `docs/agent/workflows/backup-and-restore.md`
- Create: `docs/agent/errors/common-errors.md`
- Create: `docs/agent/errors/retry-matrix.md`
- Create: `tests/unit/shared/agentWorkflowDocs.test.ts`

**Step 1: Write the failing workflow-doc tests**

Create `tests/unit/shared/agentWorkflowDocs.test.ts` covering:

1. each first-slice workflow markdown file exists
2. each workflow file frontmatter includes:
   - `workflowId`
   - `summary`
   - `domain`
3. each `workflowId` matches a record in `agentWorkflowCatalog`
4. `retry-matrix.md` includes explicit guidance for:
   - read-only retry
   - non-idempotent retry
   - provider outbound retry
   - restore retry

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentWorkflowDocs.test.ts
```

Expected: FAIL because the workflow guide set is incomplete or absent.

**Step 3: Write the first workflow and error guides**

Create the workflow guides with frontmatter and sections for:

- when to use
- preconditions
- operation sequence
- failure handling
- completion criteria

Keep them aligned to the actual first-slice workflow ids from `agentWorkflowCatalog`.

Create `docs/agent/errors/common-errors.md` and `docs/agent/errors/retry-matrix.md` with explicit guidance for:

- local read failures
- local write failures
- outbound provider failures
- publication/open/share failures
- restore drill failures

Do not introduce speculative cloud-only guidance in this slice.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentWorkflowDocs.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/agent/workflows docs/agent/errors tests/unit/shared/agentWorkflowDocs.test.ts
git commit -m "docs: add agent workflow guides"
```

### Task 5: Add drift checks, verification commands, and project-level documentation handoff

**Files:**
- Create: `scripts/docs/check-agent-docs.ts`
- Modify: `package.json`
- Modify: `README.md`
- Create: `tests/unit/shared/agentDocsDriftCheck.test.ts`

**Step 1: Write the failing drift-check tests**

Create `tests/unit/shared/agentDocsDriftCheck.test.ts` covering:

1. every exposed `archive:*` invocation in `src/preload/index.ts` that belongs to the first documentation slice has a matching `invokeKey` in `agentOperationCatalog`
2. every workflow `operationId` points to a real operation record
3. every operation `requestSchemaRef` points to a real exported schema or is explicitly `undefined`
4. `docs:agent:check` fails when generated artifacts are stale

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentDocsDriftCheck.test.ts
```

Expected: FAIL because no drift-check script or staleness check exists yet.

**Step 3: Implement the drift-check command and README handoff**

Create `scripts/docs/check-agent-docs.ts` to:

1. compare current generated output to a fresh in-memory build
2. fail if any generated JSON artifact differs
3. fail if required first-slice operation coverage is missing

Update `package.json` so:

- `docs:agent:check` runs the drift-check script

Update `README.md` with a new section describing:

- where agent docs live
- how to regenerate them
- how to query runtime metadata APIs
- which files are truth sources

Also add verification commands:

```bash
npm run docs:agent
npm run docs:agent:check
```

**Step 4: Run final verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentOperationCatalog.test.ts tests/unit/shared/agentWorkflowCatalog.test.ts tests/unit/shared/agentDocsBuild.test.ts tests/unit/main/agentDocsIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/shared/agentWorkflowDocs.test.ts tests/unit/shared/agentDocsDriftCheck.test.ts
npm run docs:agent
npm run docs:agent:check
npm run test:typecheck
npm run build
git diff --check
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/docs/check-agent-docs.ts package.json README.md tests/unit/shared/agentDocsDriftCheck.test.ts docs/generated
git commit -m "docs: finalize agent documentation baseline"
```

Plan complete and saved to `docs/plans/2026-03-20-agent-self-server-documentation-system-implementation-plan.md`.
