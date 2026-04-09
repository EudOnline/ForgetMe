# Person-Agent Consultation Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade person-agent consultations from one-off answer-pack generation into persisted person-agent sessions with independent runtime state that can be replayed and inspected later.

**Architecture:** Add dedicated consultation tables for person-agent sessions, turns, and runtime state. Build a consultation service that answers through the existing person-agent answer-pack generator, persists consultation turns into the new tables, and keeps a compact runtime state projection up to date. Expose the new read/write methods through the workspace API so the frontend can use the person-agent runtime directly.

**Tech Stack:** TypeScript, SQLite migrations, Electron main-process services, shared archive contracts, Vitest

---

### Task 1: Add failing persistence and consultation tests

**Files:**
- Modify: `tests/unit/main/dbPersonAgents.test.ts`
- Create: `tests/unit/main/personAgentConsultationService.test.ts`

**Step 1: Write the failing test**
- Extend migration coverage to expect:
  - `person_agent_consultation_sessions`
  - `person_agent_consultation_turns`
  - `person_agent_runtime_state`
- Add consultation service tests that prove:
  - asking a person-agent consultation creates a dedicated session and persisted turn
  - reusing a session appends turns in order
  - runtime state tracks latest question, classification, and consulted timestamps
  - missing or inactive person agents safely return `null`

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentConsultationService.test.ts`

### Task 2: Implement consultation persistence and service

**Files:**
- Create: `src/main/services/migrations/038_person_agent_consultation_runtime.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/governancePersistenceService.ts`
- Create: `src/main/services/personAgentConsultationService.ts`

**Step 1: Write minimal implementation**
- Add consultation session, turn, and runtime-state contracts.
- Add persistence helpers to:
  - upsert runtime state
  - create/list/get consultation sessions
  - append/list consultation turns
- Implement a consultation service that:
  - resolves the active person agent
  - calls `buildPersonAgentAnswerPack`
  - persists the consultation turn
  - updates runtime state

**Step 2: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentConsultationService.test.ts`

### Task 3: Expose consultation runtime through workspace APIs

**Files:**
- Modify: `src/shared/schemas/workspace.ts`
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**
- Add IPC coverage for:
  - `askPersonAgentConsultation`
  - `listPersonAgentConsultationSessions`
  - `getPersonAgentConsultationSession`
  - `getPersonAgentRuntimeState`

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 3: Write minimal implementation**
- Wire the new consultation service into workspace runtime, IPC registration, preload, and renderer client fallbacks.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

### Task 4: Verify and commit

**Files:**
- Verify only

**Step 1: Run regression verification**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentConsultationService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentPromotionService.test.ts`

**Step 2: Run build verification**
- Run: `npm run build`

**Step 3: Commit**
- Commit once tests and build pass.
