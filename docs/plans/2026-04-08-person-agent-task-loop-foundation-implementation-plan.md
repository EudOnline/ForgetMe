# Person-Agent Task Loop Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persisted person-agent internal task queue so each active person agent can accumulate backend-generated follow-up work items such as waiting for refresh completion, resolving conflicts, filling coverage gaps, or expanding repeated consultation topics.

**Architecture:** Introduce a dedicated `person_agent_tasks` table plus persistence helpers, then build a deterministic task derivation service that rebuilds the active task set from the person agent's current refresh queue, fact memory, interaction memory, and audit trail. Expose the derived tasks through the existing inspection bundle and keep the task set in sync after consultation turns.

**Tech Stack:** TypeScript, SQLite migrations, Electron main-process services, shared archive contracts, Vitest

---

### Task 1: Add failing persistence and derivation tests

**Files:**
- Modify: `tests/unit/main/dbPersonAgents.test.ts`
- Create: `tests/unit/main/personAgentTaskService.test.ts`

**Step 1: Write the failing test**
- Extend migration coverage to expect `person_agent_tasks`.
- Add task service tests that prove:
  - sync creates tasks for pending refreshes, open conflicts, coverage gaps, repeated interaction topics, and recent strategy changes
  - syncing again replaces stale tasks instead of duplicating them

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts`

### Task 2: Implement task queue persistence and derivation

**Files:**
- Create: `src/main/services/migrations/039_person_agent_tasks.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/governancePersistenceService.ts`
- Create: `src/main/services/personAgentTaskService.ts`
- Modify: `src/main/services/personAgentConsultationService.ts`

**Step 1: Write minimal implementation**
- Add task contracts and persistence helpers.
- Implement task derivation rules for:
  - pending refresh
  - open conflict
  - coverage gap
  - repeated interaction topic
  - recent strategy change
- Trigger task synchronization after persisted person-agent consultations.

**Step 2: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentConsultationService.test.ts`

### Task 3: Add inspection bundle task visibility

**Files:**
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**
- Extend the inspection bundle IPC test to expect a `tasks` array with the derived task kinds visible to the frontend.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 3: Write minimal implementation**
- Load tasks into the inspection bundle.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

### Task 4: Verify and commit

**Files:**
- Verify only

**Step 1: Run regression verification**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentTaskService.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentPromotionService.test.ts`

**Step 2: Run build verification**
- Run: `npm run build`

**Step 3: Commit**
- Commit once tests and build pass.
