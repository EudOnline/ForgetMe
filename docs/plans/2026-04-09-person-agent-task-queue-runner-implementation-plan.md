# Person-Agent Task Queue Runner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a long-lived background runner that periodically processes executable person-agent tasks across the archive.

**Architecture:** Reuse `processPersonAgentTaskQueue` as the single execution path and wrap it in a runner service modeled after existing polling services. The runner will open the archive database, run migrations, process a bounded batch of pending executable tasks, and close the database on each cycle. The main service container will start and stop this runner alongside existing background workers.

**Tech Stack:** TypeScript, Electron main process background runners, SQLite services, Vitest

---

### Task 1: Define Runner Behavior in Tests

**Files:**
- Create: `tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- a queue cycle processes pending executable tasks and returns `true`
- a queue cycle returns `false` when only blocked `await_refresh` tasks remain
- the polling runner starts on an interval and stops cleanly

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
Expected: FAIL because the runner service does not exist yet.

**Step 3: Write minimal implementation**

Use the new test file as the contract for:
- `runPersonAgentTaskQueueCycle`
- `createPersonAgentTaskQueueRunner`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/main/personAgentTaskQueueRunnerService.test.ts
git commit -m "Cover person-agent task queue runner"
```

### Task 2: Implement the Runner Service

**Files:**
- Create: `src/main/services/personAgentTaskQueueRunnerService.ts`
- Modify: `src/main/services/personAgentTaskService.ts` (only if tiny helper exposure is needed)

**Step 1: Write the failing test**

Use the tests from Task 1 to verify the missing service entry points.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
Expected: FAIL because the service file and runner functions do not exist.

**Step 3: Write minimal implementation**

Add:
- a cycle runner that opens the archive DB, runs migrations, processes pending executable tasks, and reports whether anything ran
- a polling wrapper with interval parsing, single-active-run protection, and `stop()`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentTaskQueueRunnerService.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts
git commit -m "Add person-agent task queue runner"
```

### Task 3: Integrate the Runner into Main Background Services

**Files:**
- Modify: `src/main/bootstrap/serviceContainer.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing test**

Rely on build/type integration plus a lightweight runtime smoke expectation if needed.

**Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL if runner wiring is incomplete.

**Step 3: Write minimal implementation**

Start and stop the new runner alongside:
- `enrichmentRunner`
- `approvedDraftProviderSendRetryRunner`

**Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/bootstrap/serviceContainer.ts src/main/index.ts
git commit -m "Wire person-agent task queue runner into main process"
```

### Task 4: Final Verification

**Files:**
- Verify only

**Step 1: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts
```

Expected: PASS

**Step 2: Run broader confidence checks**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts
npm run build
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-04-09-person-agent-task-queue-runner-implementation-plan.md
git commit -m "Plan person-agent task queue runner"
```
