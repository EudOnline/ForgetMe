# Person-Agent Task Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add stable person-agent task identities, persisted task status transitions, and workspace APIs for listing and acting on person-agent tasks.

**Architecture:** Keep task derivation deterministic, but stop treating tasks as disposable rows. Each derived task will carry a stable `taskKey`, sync will preserve prior state for matching keys, and explicit task actions will update status plus append governance audit events. Workspace IPC will expose both direct task listing and task transitions so the frontend agent can act on backend state without custom SQL knowledge.

**Tech Stack:** TypeScript, Electron workspace IPC, SQLite migrations, Vitest

---

### Task 1: Define the Task Action Surface

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`

**Step 1: Write the failing test**

Add IPC-facing tests that expect:
- `listPersonAgentTasks` to be callable directly.
- `transitionPersonAgentTask` to accept a task id and a next status.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the new handlers/schemas/api methods do not exist yet.

**Step 3: Write minimal implementation**

Add the shared input types and API signatures for:
- `ListPersonAgentTasksInput`
- `TransitionPersonAgentTaskInput`
- `listPersonAgentTasks`
- `transitionPersonAgentTask`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS for the new shape checks once handlers are wired.

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/schemas/workspace.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Add person-agent task action API contracts"
```

### Task 2: Preserve Task State Across Sync

**Files:**
- Create: `src/main/services/migrations/040_person_agent_task_actions.sql`
- Modify: `src/main/services/governancePersistenceService.ts`
- Modify: `src/main/services/personAgentTaskService.ts`
- Test: `tests/unit/main/personAgentTaskService.test.ts`
- Test: `tests/unit/main/dbPersonAgents.test.ts`

**Step 1: Write the failing test**

Add persistence/service tests that prove:
- tasks include a stable `taskKey`
- a task transitioned to `dismissed` or `completed` keeps that state after a later sync if the derived task key is unchanged
- a new source fingerprint creates a new task instead of incorrectly reusing an old terminal state

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts tests/unit/main/dbPersonAgents.test.ts`
Expected: FAIL because the table and sync logic only support disposable pending tasks.

**Step 3: Write minimal implementation**

Add migration columns/indexes for stable task identity and richer status metadata, then update sync logic to:
- derive deterministic keys
- preserve existing rows/state when keys match
- delete tasks that are no longer derived

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts tests/unit/main/dbPersonAgents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/040_person_agent_task_actions.sql src/main/services/governancePersistenceService.ts src/main/services/personAgentTaskService.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/dbPersonAgents.test.ts
git commit -m "Persist person-agent task states across sync"
```

### Task 3: Implement Task Transitions and Audit Logging

**Files:**
- Modify: `src/main/services/governancePersistenceService.ts`
- Modify: `src/main/services/personAgentTaskService.ts`
- Test: `tests/unit/main/personAgentTaskService.test.ts`

**Step 1: Write the failing test**

Add tests for:
- transitioning `pending -> processing`
- transitioning `pending|processing -> completed|dismissed`
- appending a `task_status_updated` audit event with source metadata

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: FAIL because no transition helper exists.

**Step 3: Write minimal implementation**

Add a task transition service that validates status changes, persists timestamps/actor metadata, and writes an audit event.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/governancePersistenceService.ts src/main/services/personAgentTaskService.ts tests/unit/main/personAgentTaskService.test.ts
git commit -m "Track person-agent task transitions"
```

### Task 4: Expose Task Actions Through Workspace Runtime

**Files:**
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**

Add IPC tests that expect:
- direct task listing by canonical person id
- task transitions to be routed through workspace IPC

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: FAIL because the handlers and preload bridge do not exist.

**Step 3: Write minimal implementation**

Wire the new runtime methods end-to-end from IPC to preload to renderer bridge.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/modules/workspace/runtime/createWorkspaceModule.ts src/main/modules/workspace/registerWorkspaceIpc.ts src/preload/modules/workspace.ts src/renderer/clients/workspaceClient.ts tests/unit/main/memoryWorkspaceIpc.test.ts
git commit -m "Expose person-agent task actions over workspace IPC"
```

### Task 5: Sync Tasks from the Refresh Loop and Verify

**Files:**
- Modify: `src/main/services/personAgentRefreshService.ts`
- Modify: `tests/unit/main/personAgentRefreshService.test.ts`

**Step 1: Write the failing test**

Add a refresh test that proves completed refreshes resync task state without waiting for a consultation turn.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts`
Expected: FAIL because refresh processing does not currently resync tasks.

**Step 3: Write minimal implementation**

Call task sync after refresh rebuild completion so inspection/task views stay current.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentRefreshService.ts tests/unit/main/personAgentRefreshService.test.ts
git commit -m "Resync person-agent tasks after refresh"
```

### Task 6: Final Verification

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
git add docs/plans/2026-04-08-person-agent-task-actions-implementation-plan.md
git commit -m "Plan person-agent task actions"
```
