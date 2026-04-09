# Person-Agent Capsule Filesystem Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn person-agent capsules into real isolated runtime shells by persisting identity, memory snapshot, checkpoint, and runtime-state artifacts inside each capsule's filesystem roots.

**Architecture:** Keep SQLite as the source of truth, but mirror bounded runtime artifacts into each capsule's `workspaceRoot` and `stateRoot` so every promoted person has a durable, inspectable agent shell. Reuse the existing capsule, consultation, and task services rather than introducing a second orchestration stack.

**Tech Stack:** TypeScript, Node filesystem APIs, Electron main-process services, SQLite-backed read models, Vitest

---

### Task 1: Define capsule artifact shapes and synchronization surface

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Create: `src/main/services/personAgentCapsuleRuntimeArtifactsService.ts`
- Test: `tests/unit/main/personAgentCapsuleService.test.ts`

**Step 1: Write the failing test**

Add expectations proving capsule sync can produce:
- `identity.json` with stable capsule identity/profile data
- `memory-snapshot.json` with bounded fact/interaction/task versions and counts
- `runtime-state.json` with session namespace and latest runtime markers
- checkpoint files under a dedicated `checkpoints/` directory

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts`

Expected: FAIL because no filesystem runtime artifact service exists yet.

**Step 3: Write minimal implementation**

Create a capsule artifact sync service that:
- resolves artifact file paths from `workspaceRoot` and `stateRoot`
- writes deterministic JSON payloads
- keeps payloads compact and grounded in persisted data only
- returns the written artifact paths for callers/tests

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/main/services/personAgentCapsuleRuntimeArtifactsService.ts tests/unit/main/personAgentCapsuleService.test.ts
git commit -m "Add person-agent capsule runtime artifacts"
```

### Task 2: Write artifact sync into capsule materialization and backfill

**Files:**
- Modify: `src/main/services/personAgentCapsuleService.ts`
- Modify: `src/main/services/personAgentCapsuleBackfillService.ts`
- Test: `tests/unit/main/personAgentCapsuleService.test.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- initial capsule materialization writes the runtime artifact set
- refresh materialization updates memory snapshot metadata without duplicating checkpoints
- startup backfill writes the same artifact set for historical active agents

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts`

Expected: FAIL because current capsule code only creates directories and database rows.

**Step 3: Write minimal implementation**

Update capsule materialization to:
- hydrate artifact payloads from existing fact/interaction/task/runtime state
- write/update checkpoint files whenever a new capsule checkpoint is appended
- preserve idempotency for unchanged versions

Ensure backfill reuses the same synchronization path.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentCapsuleService.ts src/main/services/personAgentCapsuleBackfillService.ts tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts
git commit -m "Sync capsule runtime artifacts on materialization"
```

### Task 3: Refresh capsule runtime-state artifacts after consultations and task runs

**Files:**
- Modify: `src/main/services/personAgentConsultationService.ts`
- Modify: `src/main/services/personAgentTaskService.ts`
- Modify: `src/main/services/personAgentTaskQueueRunnerService.ts`
- Test: `tests/unit/main/personAgentConsultationService.test.ts`
- Test: `tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- consultation turns update `runtime-state.json` with latest session and consultation markers
- task execution updates `runtime-state.json` with latest task run markers
- queue runner updates runtime-state metadata for the most recently processed capsule

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

Expected: FAIL because runtime artifact files are not refreshed after live runtime activity.

**Step 3: Write minimal implementation**

After persisted runtime changes:
- read the capsule by `personAgentId`
- rewrite only the bounded runtime-state artifact payload
- avoid introducing any new source-of-truth fields beyond mirrored metadata

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentConsultationService.ts src/main/services/personAgentTaskService.ts src/main/services/personAgentTaskQueueRunnerService.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts
git commit -m "Refresh capsule runtime artifacts from live activity"
```

### Task 4: Final verification

**Files:**
- Verify only

**Step 1: Run focused capsule runtime tests**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts
```

Expected: PASS

**Step 2: Run broader regression coverage and build**

Run:

```bash
npm run test:unit -- tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts
npm run build
```

Expected: PASS

**Step 3: Commit the plan if it is the only remaining change**

```bash
git add docs/plans/2026-04-09-person-agent-capsule-filesystem-runtime-implementation-plan.md
git commit -m "Plan person-agent capsule filesystem runtime"
```
