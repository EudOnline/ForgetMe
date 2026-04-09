# Person-Agent Task Queue Auto-Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically process executable person-agent tasks after task sync points while leaving blocked tasks pending.

**Architecture:** Reuse the deterministic task execution logic added in the previous slice instead of inventing a second execution path. Introduce a queue processor that scans pending tasks, skips blocked-only work like `await_refresh`, executes eligible tasks in deterministic order, and returns the created task runs. Integrate it immediately after task sync in refresh and consultation flows so the backend can silently prepare next-step outputs without waiting for a frontend click.

**Tech Stack:** TypeScript, SQLite-backed services, Vitest

---

### Task 1: Define the Queue Processor Behavior in Tests

**Files:**
- Modify: `tests/unit/main/personAgentTaskService.test.ts`
- Modify: `tests/unit/main/personAgentRefreshService.test.ts`
- Modify: `tests/unit/main/personAgentConsultationService.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- queue processing executes pending non-refresh tasks in deterministic order
- `await_refresh` remains pending and does not create repeated blocked runs during auto-processing
- refresh completion auto-processes generated tasks into task runs
- persisted consultation auto-processes generated tasks into task runs

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts`
Expected: FAIL because no queue processor exists and sync points do not trigger it.

**Step 3: Write minimal implementation**

Implement the tests with specific expected statuses, task run order, and blocked-task behavior.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts`
Expected: PASS after queue processor integration is complete.

**Step 5: Commit**

```bash
git add tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts
git commit -m "Cover person-agent task queue auto-processing"
```

### Task 2: Implement Queue Processing Service Logic

**Files:**
- Modify: `src/main/services/personAgentTaskService.ts`

**Step 1: Write the failing test**

Use the new service tests from Task 1 to confirm:
- `processPersonAgentTaskQueue`
- deterministic ordering
- auto-executable filtering

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: FAIL because the processor function does not exist.

**Step 3: Write minimal implementation**

Add a queue processor that:
- lists pending tasks
- filters to auto-executable task kinds
- executes them in existing list order
- supports optional canonical person filtering and a limit

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentTaskService.ts tests/unit/main/personAgentTaskService.test.ts
git commit -m "Process person-agent task queue automatically"
```

### Task 3: Integrate Queue Processing into Sync Points

**Files:**
- Modify: `src/main/services/personAgentRefreshService.ts`
- Modify: `src/main/services/personAgentConsultationService.ts`
- Modify: `tests/unit/main/personAgentRefreshService.test.ts`
- Modify: `tests/unit/main/personAgentConsultationService.test.ts`

**Step 1: Write the failing test**

Use the new refresh and consultation tests from Task 1 to prove auto-processing fires after task sync.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts`
Expected: FAIL because sync points only refresh tasks and do not process them.

**Step 3: Write minimal implementation**

Call the queue processor:
- after refresh-driven task sync
- after consultation-driven task sync

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentRefreshService.ts src/main/services/personAgentConsultationService.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts
git commit -m "Auto-process person-agent tasks after sync"
```

### Task 4: Final Verification

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
git add docs/plans/2026-04-09-person-agent-task-queue-auto-processing-implementation-plan.md
git commit -m "Plan person-agent task queue auto-processing"
```
