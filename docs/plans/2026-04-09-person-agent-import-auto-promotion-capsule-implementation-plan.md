# Person-Agent Import Auto-Promotion Capsule Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make import- and relationship-heavy canonical people automatically materialize into durable person-agent capsules with isolated memory/runtime identity, then keep those capsules refreshed and inspectable through the existing backend.

**Architecture:** Build on the current `person_agents`, fact memory, interaction memory, refresh queue, runtime state, and task runner foundations rather than replacing them. Add a new capsule layer that gives each promoted person agent its own persisted identity spec, workspace root, memory checkpoint metadata, and session namespace, borrowing the isolation idea from OpenClaw-style per-agent workspaces while keeping execution inside this Electron + SQLite backend.

**Tech Stack:** TypeScript, Electron main-process services, SQLite migrations, local filesystem directories under app data, Vitest

---

### Task 1: Define person-agent capsule contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add inspection-level expectations for:
- `PersonAgentCapsuleRecord`
- `PersonAgentCapsuleMemoryCheckpointRecord`
- optional `capsule` metadata in `PersonAgentInspectionBundle`
- optional `capsuleStatus` / `activationSource` fields that the frontend can render without a second round-trip

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

Expected: FAIL because capsule types and inspection payload fields do not exist yet.

**Step 3: Write minimal implementation**

Add shared types for:
- durable capsule identity
- workspace root / state root / session namespace metadata
- memory checkpoint versions
- activation provenance (`import_batch`, `refresh_rebuild`, `interaction_promotion`, `manual_backfill`)

Keep the IPC surface additive so current consumers continue to work.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/schemas/workspace.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Add person-agent capsule contracts"
```

### Task 2: Add capsule persistence and app-data roots

**Files:**
- Modify: `src/main/services/appPaths.ts`
- Create: `src/main/services/migrations/043_person_agent_capsules.sql`
- Modify: `src/main/services/governancePersistenceService.ts`
- Test: `tests/unit/main/dbPersonAgents.test.ts`

**Step 1: Write the failing test**

Add persistence tests proving:
- app paths create stable `personAgentWorkspaceDir` and `personAgentStateDir`
- SQLite creates `person_agent_capsules` and `person_agent_capsule_memory_checkpoints`
- capsule rows can be upserted and read back
- checkpoint rows can be inserted and listed newest-first

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`

Expected: FAIL because the new directories, tables, and helpers do not exist yet.

**Step 3: Write minimal implementation**

Persist:
- capsule id
- `person_agent_id`
- `canonical_person_id`
- activation source and activation timestamp
- workspace/state roots
- identity/profile json
- latest checkpoint ids and timestamps

Prefer one capsule per person agent and one append-only checkpoint stream.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/appPaths.ts src/main/services/migrations/043_person_agent_capsules.sql src/main/services/governancePersistenceService.ts tests/unit/main/dbPersonAgents.test.ts
git commit -m "Persist person-agent capsules"
```

### Task 3: Expand promotion scoring for import breadth and relationship density

**Files:**
- Modify: `src/main/services/personAgentPromotionService.ts`
- Test: `tests/unit/main/importBatchService.test.ts`
- Test: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`

**Step 1: Write the failing test**

Add tests showing:
- repeated real imports plus relationship overlap deterministically activate a person agent
- relationship-linked communication breadth can promote a person even with sparse approved attributes
- weak single-file imports stay unpromoted
- promotion reason summaries mention the activation basis that triggered capsule creation

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/personAgentRefreshService.test.ts`

Expected: FAIL because current scoring does not explicitly track capsule activation provenance or stronger relationship-weighted thresholds.

**Step 3: Write minimal implementation**

Extend promotion signals with:
- linked import batch count
- relationship density across shared files
- communication breadth across unique files
- recent task / consultation activity if it helps break ties deterministically

Return activation metadata rich enough for later capsule materialization and audit rows.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/personAgentRefreshService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentPromotionService.ts tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/personAgentRefreshService.test.ts
git commit -m "Strengthen person-agent promotion signals"
```

### Task 4: Materialize capsules automatically during refresh rebuilds

**Files:**
- Create: `src/main/services/personAgentCapsuleService.ts`
- Modify: `src/main/services/personAgentRefreshService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`
- Create: `tests/unit/main/personAgentCapsuleService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- a promotion-ready person rebuild creates a capsule automatically
- the capsule is idempotent across repeated refreshes
- import-triggered refresh writes activation provenance (`import_batch`) and workspace/state roots
- demoted or inactive agents do not create new capsules

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts`

Expected: FAIL because rebuilds only upsert `person_agents` today and do not create capsule records/directories.

**Step 3: Write minimal implementation**

Create a capsule materializer that:
- resolves or creates the workspace/state directories
- persists the capsule row
- writes a baseline identity/profile document or JSON payload
- records an audit event when a capsule is first created

Call it from refresh rebuilds after promotion decides the person agent is active.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentCapsuleService.ts src/main/services/personAgentRefreshService.ts src/main/services/importBatchService.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts
git commit -m "Auto-create person-agent capsules on refresh"
```

### Task 5: Seed isolated memory checkpoints from fact and interaction memory

**Files:**
- Modify: `src/main/services/personAgentCapsuleService.ts`
- Modify: `src/main/services/personAgentFactMemoryService.ts`
- Modify: `src/main/services/personAgentInteractionMemoryService.ts`
- Test: `tests/unit/main/personAgentCapsuleService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- capsule creation records an initial checkpoint containing fact-memory version, interaction-memory version, strategy profile version, and task snapshot version
- later refreshes append a new checkpoint only when any source version changes
- checkpoint summaries never duplicate raw conversation text

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts`

Expected: FAIL because capsules currently have no checkpointing logic.

**Step 3: Write minimal implementation**

Append checkpoint rows using existing versioned sources:
- `factsVersion`
- `interactionVersion`
- strategy-profile hash/version
- latest task queue snapshot timestamp

Use compact JSON summaries instead of raw full payload duplication.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentCapsuleService.ts src/main/services/personAgentFactMemoryService.ts src/main/services/personAgentInteractionMemoryService.ts tests/unit/main/personAgentCapsuleService.test.ts
git commit -m "Checkpoint person-agent capsule memory state"
```

### Task 6: Bind consultations and task loops to capsule identity

**Files:**
- Modify: `src/main/services/personAgentConsultationService.ts`
- Modify: `src/main/services/personAgentTaskService.ts`
- Modify: `src/main/services/personAgentTaskQueueRunnerService.ts`
- Modify: `src/main/services/governancePersistenceService.ts`
- Test: `tests/unit/main/personAgentConsultationService.test.ts`
- Test: `tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- person-agent consultations update the active capsule checkpoint/session namespace
- task execution runs include capsule identifiers when available
- task queue runner state can report which capsule was processed most recently

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

Expected: FAIL because capsule identity is not yet threaded into consultations or background task runs.

**Step 3: Write minimal implementation**

Attach capsule metadata opportunistically:
- read capsule by `personAgentId`
- update latest consultation/task timestamps
- propagate capsule id into audit payloads and optional run metadata

Keep current task behavior unchanged beyond metadata enrichment.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentConsultationService.ts src/main/services/personAgentTaskService.ts src/main/services/personAgentTaskQueueRunnerService.ts src/main/services/governancePersistenceService.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts
git commit -m "Thread capsule identity through person-agent runtime"
```

### Task 7: Expose capsule inspection through workspace APIs

**Files:**
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add inspection tests proving:
- `getPersonAgentInspectionBundle` returns capsule identity and latest checkpoint summary
- standalone capsule reads are available if the frontend later needs a deep inspector
- stalled or missing capsules are surfaced as highlights/recommendations only when grounded by persisted state

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

Expected: FAIL because capsule inspection fields and handlers do not exist yet.

**Step 3: Write minimal implementation**

Expose bounded read models only:
- capsule summary
- latest checkpoint metadata
- activation provenance
- workspace/state root labels if safe to surface

Avoid exposing internal raw JSON blobs directly.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/modules/workspace/runtime/createWorkspaceModule.ts src/main/modules/workspace/registerWorkspaceIpc.ts src/preload/modules/workspace.ts src/renderer/clients/workspaceClient.ts src/shared/archiveContracts.ts src/shared/schemas/workspace.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Expose person-agent capsule inspection"
```

### Task 8: Add repair/backfill flow for existing archives and verify end-to-end

**Files:**
- Create: `src/main/services/personAgentCapsuleBackfillService.ts`
- Modify: `src/main/bootstrap/serviceContainer.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/main/importBatchService.test.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`
- Test: `tests/unit/main/personAgentCapsuleService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- historical promoted person agents without capsules can be backfilled safely
- backfill does not duplicate capsules
- import + refresh + capsule materialization works end-to-end in one pass

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts`

Expected: FAIL because there is no repair/backfill service yet.

**Step 3: Write minimal implementation**

Implement a bounded repair service that:
- scans active/high-signal person agents
- creates missing capsules/checkpoints
- can run once at startup or on demand

Keep it idempotent and auditable.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentCapsuleBackfillService.ts src/main/bootstrap/serviceContainer.ts src/main/index.ts tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentCapsuleService.test.ts
git commit -m "Backfill person-agent capsules for existing imports"
```

### Task 9: Final verification

**Files:**
- Verify only

**Step 1: Run focused capsule tests**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts
```

Expected: PASS

**Step 2: Run broader import and session confidence checks**

Run:

```bash
npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts
npm run build
```

Expected: PASS

**Step 3: Commit the plan if it is the only remaining change**

```bash
git add docs/plans/2026-04-09-person-agent-import-auto-promotion-capsule-implementation-plan.md
git commit -m "Plan person-agent capsule auto-promotion"
```
