# Phase 8D Compare Runner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a provider/model compare runner for `Memory Workspace` so the same grounded scope/question can be executed against a local baseline plus optional remote synthesis targets, with persisted compare records and a minimal review UI.

**Architecture:** Keep truth assembly deterministic by reusing `askMemoryWorkspace(...)` as the baseline context builder, then fan out compare targets that either reuse the local baseline directly or synthesize an alternate answer summary from the same grounded context. Persist compare sessions separately from normal conversation sessions so compare artifacts stay inspectable without mutating the truth/read-model path.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Playwright, SQLite migrations, existing LiteLLM routing.

---

## Scope Decisions

- `8D compare runner` **does include**:
  - compare targets for:
    - `local_baseline`
    - `provider_model` via LiteLLM
  - separate compare session/run persistence
  - default compare presets for local baseline + SiliconFlow + OpenRouter
  - minimal renderer support to trigger a compare run and inspect saved compare runs
  - fixture-friendly execution for unit/e2e coverage

- `8D compare runner` **does not include yet**:
  - automatic scoring or judge models
  - bulk matrix orchestration across many scopes/questions
  - editable compare presets in UI
  - export/share bundles for compare sessions

### Task 1: Add compare contracts, schemas, and persistence migration

**Files:**
- Create: `src/main/services/migrations/009_memory_workspace_compare.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing tests**

Add contract/schema coverage for:

- `MemoryWorkspaceCompareTarget`
- `RunMemoryWorkspaceCompareInput`
- `MemoryWorkspaceCompareRunRecord`
- `MemoryWorkspaceCompareSessionSummary`
- `MemoryWorkspaceCompareSessionDetail`
- compare IPC schemas

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because compare runner contracts and schemas do not exist yet.

**Step 3: Write minimal implementation**

Add types for:

- compare target descriptors
- compare session summaries/details
- compare run records
- compare IPC inputs

Add a new migration for compare session/run tables.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

---

### Task 2: Implement compare runner service with TDD

**Files:**
- Create: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `src/main/services/modelGatewayService.ts`
- Create: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. running compare creates a persisted compare session with multiple runs
2. local baseline compare run reuses deterministic `askMemoryWorkspace(...)`
3. provider/model compare runs reuse the same grounded context but replace the synthesized summary
4. failed remote syntheses are persisted as failed compare runs without breaking the session
5. listing/getting compare sessions returns stable saved records

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because compare service and persistence do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- default compare targets
- compare session persistence helpers
- local baseline execution
- remote synthesis execution using LiteLLM-compatible routing
- fixture mode for deterministic tests/e2e

Keep compare isolated:

- do not write compare runs into `memory_workspace_sessions`
- do not promote compare results into truth tables
- do not let one failed target abort other targets

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

---

### Task 3: Wire IPC, preload, renderer API, and page UI

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. renderer fallback API exposes compare methods
2. page can trigger a compare run from the current question
3. compare results render target labels, provider/model metadata, status, and summaries
4. saved compare sessions load for the current scope

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare APIs and UI do not exist yet.

**Step 3: Write minimal implementation**

Add compare API wiring and a compact compare panel in `Memory Workspace`:

- `Run compare` button
- saved compare sessions list
- run cards for each target
- response summary and guardrail snapshot per run

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Document the slice and add focused e2e

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Create: `tests/e2e/memory-workspace-compare-flow.spec.ts`

**Step 1: Write the failing e2e test**

Cover:

1. open `Memory Workspace`
2. ask a grounded question
3. run compare
4. see baseline + remote fixture compare results render

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: FAIL because compare UI and compare IPC flow do not exist yet.

**Step 3: Write minimal implementation refinements**

- stabilize compare labels
- document the implemented `8D` compare-runner boundary
- ensure fixture mode makes e2e deterministic

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-flow.spec.ts tests/e2e/memory-workspace-guardrails-flow.spec.ts tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: PASS
