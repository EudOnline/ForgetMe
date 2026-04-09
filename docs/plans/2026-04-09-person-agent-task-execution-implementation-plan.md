# Person-Agent Task Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persisted person-agent task execution records and deterministic execution outputs that frontend or background agents can consume.

**Architecture:** Keep task derivation and task state transitions separate from task execution history. Introduce a dedicated task-runs table plus execution service that reads current task context, emits a structured run result, and optionally completes executable tasks while leaving blocked tasks pending. Expose both `listPersonAgentTaskRuns` and `executePersonAgentTask` through workspace IPC so the frontend agent and future silent backend workers can share the same execution path.

**Tech Stack:** TypeScript, Electron workspace IPC, SQLite migrations, Vitest

---

### Task 1: Define Execution Contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add IPC-facing tests that expect:
- `listPersonAgentTaskRuns` to be callable directly
- `executePersonAgentTask` to accept a task id and return a structured task run

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the API surface and schemas do not exist yet.

**Step 3: Write minimal implementation**

Add shared types and input contracts for:
- `PersonAgentTaskRunRecord`
- `ListPersonAgentTaskRunsInput`
- `ExecutePersonAgentTaskInput`
- archive API methods for listing runs and executing a task

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS for the new contract-level shape checks.

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/schemas/workspace.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Add person-agent task execution contracts"
```

### Task 2: Persist Task Execution Runs

**Files:**
- Create: `src/main/services/migrations/041_person_agent_task_runs.sql`
- Modify: `src/main/services/governancePersistenceService.ts`
- Test: `tests/unit/main/dbPersonAgents.test.ts`

**Step 1: Write the failing test**

Add persistence tests that prove:
- the new task-runs table exists with expected columns/indexes
- task execution runs can be listed by task or canonical person

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`
Expected: FAIL because the table and persistence helpers do not exist yet.

**Step 3: Write minimal implementation**

Add the migration plus persistence helpers for:
- inserting a task run
- listing task runs with stable ordering

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/041_person_agent_task_runs.sql src/main/services/governancePersistenceService.ts tests/unit/main/dbPersonAgents.test.ts
git commit -m "Persist person-agent task execution runs"
```

### Task 3: Implement Deterministic Task Execution

**Files:**
- Modify: `src/main/services/personAgentTaskService.ts`
- Test: `tests/unit/main/personAgentTaskService.test.ts`

**Step 1: Write the failing test**

Add service tests that prove:
- executing `resolve_conflict` creates a completed run with a suggested follow-up question and marks the task completed
- executing `fill_coverage_gap`, `expand_topic`, or `review_strategy_change` emits task-specific action payloads
- executing `await_refresh` creates a blocked run and leaves the task pending
- execution appends a `task_executed` audit event

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: FAIL because execution helpers do not exist yet.

**Step 3: Write minimal implementation**

Implement a deterministic task executor that:
- reads the current task plus related memory state
- creates a task run record
- completes executable tasks through the existing transition path
- keeps blocked tasks pending
- appends a task-execution audit event

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentTaskService.ts tests/unit/main/personAgentTaskService.test.ts
git commit -m "Execute person-agent tasks deterministically"
```

### Task 4: Expose Task Execution Through Workspace Runtime

**Files:**
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add IPC tests that expect:
- direct task-run listing
- task execution routed through workspace IPC

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the runtime bridge does not expose execution methods yet.

**Step 3: Write minimal implementation**

Wire the new methods end-to-end through workspace runtime, IPC, preload, and renderer client.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/modules/workspace/runtime/createWorkspaceModule.ts src/main/modules/workspace/registerWorkspaceIpc.ts src/preload/modules/workspace.ts src/renderer/clients/workspaceClient.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Expose person-agent task execution over workspace IPC"
```

### Task 5: Final Verification

**Files:**
- Verify only

**Step 1: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts
```

Expected: PASS

**Step 2: Run broader confidence checks**

Run:

```bash
npm run build
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-04-09-person-agent-task-execution-implementation-plan.md
git commit -m "Plan person-agent task execution"
```
