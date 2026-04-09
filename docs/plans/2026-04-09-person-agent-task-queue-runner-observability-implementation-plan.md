# Person-Agent Task Queue Runner Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and expose health/state for the person-agent task queue runner so frontend agents can tell whether the background loop is alive and productive.

**Architecture:** Add a small SQLite-backed runner-state table keyed by runner name rather than relying on in-memory state. The task queue runner will mark cycle start, cycle completion, processed counts, and last errors on every run. Workspace IPC will expose a read method for the current state so frontend agents can inspect health without touching lower-level ops modules.

**Tech Stack:** TypeScript, Electron workspace IPC, SQLite migrations, Vitest

---

### Task 1: Define Runner State Contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add IPC-facing tests that expect:
- `getPersonAgentTaskQueueRunnerState` to be callable directly
- the returned payload to include last-run timestamps, processed counts, and error state

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the API contract and handler do not exist yet.

**Step 3: Write minimal implementation**

Add shared types and archive API surface for:
- `PersonAgentTaskQueueRunnerStateRecord`
- `getPersonAgentTaskQueueRunnerState`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS once the runtime bridge is wired.

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/schemas/workspace.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Add person-agent task runner state contracts"
```

### Task 2: Persist Runner State

**Files:**
- Create: `src/main/services/migrations/042_person_agent_task_queue_runner_state.sql`
- Modify: `src/main/services/governancePersistenceService.ts`
- Test: `tests/unit/main/dbPersonAgents.test.ts`

**Step 1: Write the failing test**

Add persistence tests that prove:
- the runner-state table exists with expected columns
- state can be upserted and read back

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`
Expected: FAIL because no runner-state table or helpers exist yet.

**Step 3: Write minimal implementation**

Add the migration plus persistence helpers for:
- upserting runner state
- reading the current runner state

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/042_person_agent_task_queue_runner_state.sql src/main/services/governancePersistenceService.ts tests/unit/main/dbPersonAgents.test.ts
git commit -m "Persist person-agent task runner state"
```

### Task 3: Update the Background Runner and Expose Reads

**Files:**
- Modify: `src/main/services/personAgentTaskQueueRunnerService.ts`
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Test: `tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- a runner cycle records started/completed timestamps and processed counts
- runner failures record `lastError`
- workspace IPC returns the latest runner state

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the runner does not persist state and IPC cannot read it.

**Step 3: Write minimal implementation**

Update the runner to:
- record cycle start before processing
- record cycle completion with processed counts
- record failures with last error
- expose a read method through workspace runtime and IPC

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentTaskQueueRunnerService.ts src/main/modules/workspace/runtime/createWorkspaceModule.ts src/main/modules/workspace/registerWorkspaceIpc.ts src/preload/modules/workspace.ts src/renderer/clients/workspaceClient.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Expose person-agent task runner state"
```

### Task 4: Final Verification

**Files:**
- Verify only

**Step 1: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts
```

Expected: PASS

**Step 2: Run broader confidence checks**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts
npm run build
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-04-09-person-agent-task-queue-runner-observability-implementation-plan.md
git commit -m "Plan person-agent task runner observability"
```
