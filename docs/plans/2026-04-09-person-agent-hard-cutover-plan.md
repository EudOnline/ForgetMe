# Person-Agent Hard Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy agent runtime with the new per-person capsule agent runtime everywhere in the backend, remove all compatibility paths, and leave the repository with exactly one agent architecture.

**Architecture:** Treat `person-agent capsule runtime` as the only surviving agent system. The new runtime owns consultation, task execution, memory checkpointing, prompt assembly, background execution, and workspace IPC. The legacy `objective runtime` / `facilitator` / `role-agent registry` / `subagent registry` stack is deleted rather than wrapped, and persistence is cut over with destructive schema cleanup instead of bridge code.

**Tech Stack:** TypeScript, Electron main-process services, Node sqlite migrations, Vitest, Playwright

---

## Chosen Direction

**Recommended option: hard cutover to capsule runtime only**

Why this is the right option:
- It matches the explicit requirement: no compatibility layer, no dual path, no legacy fallback.
- It avoids carrying two conflicting mental models: `objective/subagent runtime` vs `per-person capsule runtime`.
- It makes future work on true independent per-person agents much simpler because every entry point, table, and IPC contract points at one runtime.

Alternatives considered and rejected:
- Keep both runtimes behind a facade: rejected because it preserves compatibility debt.
- Migrate only person-facing flows first: rejected because the old runtime would still shape backend architecture.

## Non-Negotiable Cutover Rules

- Do not preserve old IPC contracts if they belong to the legacy agent runtime.
- Do not keep old database tables “just in case”.
- Do not keep old tests for deleted behavior.
- Do not add fallback routing from the new runtime back into the legacy runtime.
- If existing persisted data cannot be transformed cleanly, drop it with an explicit migration.

## Scope Assumption

For this plan, “old agent design” means:
- `src/main/modules/objective/**`
- `src/main/services/objective*.ts`
- `src/main/services/subagentRegistryService.ts`
- `src/main/services/agents/*`
- associated shared contracts/schemas for the objective runtime
- associated unit and e2e tests for the objective workbench flows

For this plan, “new agent design” means:
- `src/main/services/personAgent*.ts`
- `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- `src/main/modules/workspace/registerWorkspaceIpc.ts`
- `src/shared/archiveContracts.ts`
- `src/shared/schemas/workspace.ts`
- `person-agent` capsule filesystem/runtime/state paths and related migrations

### Task 1: Define the single surviving runtime contract

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Test: `tests/unit/shared/phaseEightContracts.test.ts`

**Step 1: Write the failing test**

Add contract expectations proving the backend exposes only the new capsule-runtime operations. Remove assertions for legacy objective-runtime contracts from the relevant shared contract/schema tests and replace them with:
- a single capsule-runtime execution request shape
- a single capsule-runtime inspection/read shape
- no legacy objective-runtime IPC surface in workspace-facing schemas

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because the old contract surface still exists and the new single-runtime contract does not fully replace it.

**Step 3: Write minimal implementation**

Update the shared contract layer so the only supported backend agent operations are:
- capsule-runtime execution
- capsule-runtime inspection
- capsule-runtime session/task/memory reads only if still needed by the new UI

Delete legacy objective-runtime contract exports from the public surface where possible.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/schemas/workspace.ts src/main/modules/workspace/registerWorkspaceIpc.ts tests/unit/shared/phaseEightContracts.test.ts
git commit -m "Define capsule runtime as the only agent contract"
```

### Task 2: Replace split consultation/task services with a unified capsule runtime service

**Files:**
- Create: `src/main/services/personAgentRuntimeService.ts`
- Create: `src/main/services/personAgentRuntimeLoopService.ts`
- Modify: `src/main/services/personAgentAnswerPackService.ts`
- Modify: `src/main/services/personAgentCapsulePromptContextService.ts`
- Modify: `src/main/services/personAgentCapsulePromptBundleService.ts`
- Modify: `src/main/services/personAgentConsultationService.ts`
- Modify: `src/main/services/personAgentTaskService.ts`
- Test: `tests/unit/main/personAgentConsultationService.test.ts`
- Test: `tests/unit/main/personAgentTaskService.test.ts`
- Test: `tests/unit/main/personAgentCapsulePromptBundleService.test.ts`
- Test: `tests/unit/main/personAgentRuntimeService.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/main/personAgentRuntimeService.test.ts` proving:
- a single runtime entry can execute a consultation operation
- the same runtime entry can execute a task operation
- both operations share one capsule prompt/context assembly path
- old split services become thin wrappers or are removed entirely

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentRuntimeService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentCapsulePromptBundleService.test.ts
```

Expected: FAIL because no unified capsule runtime service exists yet.

**Step 3: Write minimal implementation**

Create a new runtime service that:
- resolves the active capsule
- assembles runtime context and prompt bundle once
- executes either `consultation` or `task_run`
- persists runtime state, activity log events, and run/session artifacts through one shared path

Refactor existing consultation/task code so it either delegates to this service or is deleted if unnecessary.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentRuntimeService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentCapsulePromptBundleService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/personAgentRuntimeService.ts src/main/services/personAgentRuntimeLoopService.ts src/main/services/personAgentAnswerPackService.ts src/main/services/personAgentCapsulePromptContextService.ts src/main/services/personAgentCapsulePromptBundleService.ts src/main/services/personAgentConsultationService.ts src/main/services/personAgentTaskService.ts tests/unit/main/personAgentRuntimeService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentCapsulePromptBundleService.test.ts
git commit -m "Unify capsule consultation and task execution runtime"
```

### Task 3: Hard-cut workspace module and IPC onto the new runtime

**Files:**
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `src/main/services/personAgentRoutingService.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Test: `tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts`

**Step 1: Write the failing test**

Update tests to require:
- workspace requests use the new capsule runtime execution API
- legacy consultation/task IPC handlers are removed or renamed to the new runtime entry
- person-agent routing no longer depends on legacy split services

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts
```

Expected: FAIL because the workspace module still exposes legacy split entry points.

**Step 3: Write minimal implementation**

Replace workspace runtime wiring so:
- one capsule-runtime execution handler becomes the only mutation path
- inspection/read handlers are trimmed to what the new UI still needs
- memory workspace person routing feeds directly into the capsule runtime instead of using older agent abstractions

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts
npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/modules/workspace/runtime/createWorkspaceModule.ts src/main/modules/workspace/registerWorkspaceIpc.ts src/main/services/memoryWorkspaceService.ts src/main/services/personAgentRoutingService.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts
git commit -m "Cut workspace runtime over to capsule agent execution"
```

### Task 4: Replace startup/background execution with a capsule runtime loop

**Files:**
- Modify: `src/main/bootstrap/serviceContainer.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/personAgentTaskQueueRunnerService.ts`
- Modify: `src/main/services/personAgentCapsuleBackfillService.ts`
- Create: `src/main/services/personAgentRuntimeRunnerService.ts`
- Test: `tests/unit/main/personAgentTaskQueueRunnerService.test.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`
- Test: `tests/unit/main/personAgentRuntimeRunnerService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- startup repairs and background loops are owned by the new capsule runtime runner
- old task-queue-only behavior is gone
- capsule refresh/backfill feeds the new runtime loop directly

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentRuntimeRunnerService.test.ts
```

Expected: FAIL because the app still boots the old task queue runner and split repair flow.

**Step 3: Write minimal implementation**

Introduce a single runtime runner that:
- starts after capsule backfill
- selects runnable capsule operations
- records loop health and latest processed capsule state
- replaces the old task queue runner registration

Delete or repurpose `personAgentTaskQueueRunnerService.ts` only if the new runtime runner fully subsumes it.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentRuntimeRunnerService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/bootstrap/serviceContainer.ts src/main/index.ts src/main/services/personAgentTaskQueueRunnerService.ts src/main/services/personAgentCapsuleBackfillService.ts src/main/services/personAgentRuntimeRunnerService.ts tests/unit/main/personAgentTaskQueueRunnerService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentRuntimeRunnerService.test.ts
git commit -m "Replace split background runners with capsule runtime loop"
```

### Task 5: Delete the legacy objective/role/subagent agent stack

**Files:**
- Delete: `src/main/modules/objective/registerObjectiveIpc.ts`
- Delete: `src/main/modules/objective/ipc/handlers.ts`
- Delete: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Delete: `src/main/services/subagentRegistryService.ts`
- Delete: `src/main/services/agents/agentTypes.ts`
- Delete: `src/main/services/agents/facilitatorAgentService.ts`
- Delete: `src/main/services/agents/governanceAgentService.ts`
- Delete: `src/main/services/agents/ingestionAgentService.ts`
- Delete: `src/main/services/agents/reviewAgentService.ts`
- Delete: `src/main/services/agents/roleAgentRegistryService.ts`
- Delete: `src/main/services/agents/workspaceAgentService.ts`
- Delete: `src/main/services/objectiveRuntimeService.ts`
- Delete: `src/main/services/objectiveRuntime*.ts`
- Delete: `src/main/services/objectiveSubagent*.ts`
- Delete: `src/shared/objectiveRuntimeContracts.ts`
- Delete: `src/shared/contracts/objective.ts`
- Delete: `src/shared/schemas/objective.ts`
- Modify: `src/main/bootstrap/registerIpc.ts`
- Test: `tests/e2e/objective-workbench-*.spec.ts`
- Test: `tests/unit/main/*objective*.test.ts`

**Step 1: Write the failing test**

Add or update tests to assert:
- objective IPC registration no longer exists
- importing the deleted runtime files is impossible from active modules
- no active backend code references facilitator/role/subagent services

**Step 2: Run test to verify it fails**

Run:

```bash
rg -n "registerObjectiveIpc|createObjectiveModule|createFacilitatorAgentService|createRoleAgentRegistryService|createSubagentRegistryService|objectiveRuntime|objectiveSubagent" src/main src/shared tests
```

Expected: non-empty output showing the legacy stack is still present.

**Step 3: Write minimal implementation**

Delete the legacy files and remove all imports/usages from surviving modules. Remove obsolete tests rather than adapting them to dead behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
rg -n "registerObjectiveIpc|createObjectiveModule|createFacilitatorAgentService|createRoleAgentRegistryService|createSubagentRegistryService|objectiveRuntime|objectiveSubagent" src/main src/shared tests
```

Expected: empty output or only references inside migration-history comments if any are intentionally preserved.

**Step 5: Commit**

```bash
git add src/main/bootstrap/registerIpc.ts src/main/modules/objective src/main/services/subagentRegistryService.ts src/main/services/agents src/main/services/objectiveRuntimeService.ts src/main/services/objectiveRuntime*.ts src/main/services/objectiveSubagent*.ts src/shared/objectiveRuntimeContracts.ts src/shared/contracts/objective.ts src/shared/schemas/objective.ts tests/e2e tests/unit/main
git commit -m "Remove legacy objective and role agent runtime"
```

### Task 6: Destructively clean the database and persistence layer

**Files:**
- Create: `src/main/services/migrations/045_drop_legacy_agent_runtime.sql`
- Create: `src/main/services/migrations/046_drop_split_person_agent_runtime_tables.sql`
- Modify: `src/main/services/governancePersistenceService.ts`
- Modify: `src/main/services/db.ts`
- Test: `tests/unit/main/dbPersonAgents.test.ts`
- Test: `tests/unit/main/personAgentRuntimeService.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- legacy `agent_*`, objective-runtime, and split runtime tables are no longer queryable through active persistence code
- persistence code supports only the new capsule-runtime tables

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRuntimeService.test.ts
```

Expected: FAIL because old tables and persistence helpers still exist.

**Step 3: Write minimal implementation**

Add destructive migrations that:
- drop legacy objective/agent runtime tables
- drop split consultation/task tables if they have been superseded by unified capsule runtime tables
- remove dead persistence helpers from `governancePersistenceService.ts`

If the new runtime still needs some historical records, migrate them into the new capsule-runtime tables before dropping the old ones in the same migration sequence.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/045_drop_legacy_agent_runtime.sql src/main/services/migrations/046_drop_split_person_agent_runtime_tables.sql src/main/services/governancePersistenceService.ts src/main/services/db.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRuntimeService.test.ts
git commit -m "Drop legacy agent runtime schema and persistence"
```

### Task 7: End-to-end cleanup and verification

**Files:**
- Verify only

**Step 1: Run dead-code and reference checks**

Run:

```bash
rg -n "objectiveRuntime|objectiveSubagent|createObjectiveModule|registerObjectiveIpc|createFacilitatorAgentService|createRoleAgentRegistryService|createSubagentRegistryService|createWorkspaceAgentService|createReviewAgentService|createGovernanceAgentService|createIngestionAgentService" src/main src/shared tests
```

Expected: empty output.

**Step 2: Run focused backend verification**

Run:

```bash
npm run test:unit -- tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/personAgentCapsulePromptContextService.test.ts tests/unit/main/personAgentCapsulePromptBundleService.test.ts tests/unit/main/personAgentRuntimeService.test.ts tests/unit/main/personAgentRuntimeRunnerService.test.ts tests/unit/main/personAgentCapsuleService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts
```

Expected: PASS

**Step 3: Run end-to-end and build verification**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts
npm run build
```

Expected: PASS

**Step 4: Inspect repository state**

Run:

```bash
git status --short
```

Expected: clean or only intended release notes/docs changes.

**Step 5: Commit**

```bash
git add -A
git commit -m "Complete hard cutover to capsule agent runtime"
```

## Delivery Checklist

- The backend exposes only one agent runtime architecture.
- Capsule runtime owns all person-agent execution.
- Legacy objective/role/subagent runtime code is deleted.
- Legacy agent-runtime schema is dropped.
- No compatibility/fallback code remains.
- Workspace IPC points only at the new runtime.
- Tests and build pass after the cutover.

Plan complete and saved to `docs/plans/2026-04-09-person-agent-hard-cutover-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
