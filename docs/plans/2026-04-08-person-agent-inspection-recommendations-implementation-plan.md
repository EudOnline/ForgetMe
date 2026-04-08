# Person-Agent Inspection Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend bundled person-agent inspection reads with UI-ready recommendations so the frontend can show the next best action, attention level, blocking reason, and recommended follow-up topics without recomputing backend state.

**Architecture:** Keep recommendation derivation inside the inspection bundle runtime layer. Reuse the already-computed state, memory summary, refresh queue, audit events, overview, and highlights to synthesize a compact recommendation block that stays deterministic and cheap to compute.

**Tech Stack:** TypeScript, Electron main-process workspace module, shared archive contracts, Vitest

---

### Task 1: Add failing inspection bundle recommendation tests

**Files:**
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 1: Write the failing test**
- Extend the bundled inspection IPC assertion to expect:
  - `attentionLevel`
  - `nextBestAction`
  - `blockingReason`
  - `suggestedQuestion`
  - `recommendedTopics`

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

### Task 2: Implement derived recommendation synthesis

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`

**Step 1: Write minimal implementation**
- Add shared types for inspection recommendations.
- Derive recommendations from current bundle inputs with bounded rules:
  - pending refresh => wait recommendation
  - open conflicts => resolve conflict recommendation
  - coverage gaps => fill coverage recommendation
  - strong repeated interaction topic => ask follow-up recommendation
  - recent strategy change => review strategy recommendation

**Step 2: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts`

### Task 3: Verify and commit

**Files:**
- Verify only

**Step 1: Run regression verification**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentPromotionService.test.ts`

**Step 2: Run build verification**
- Run: `npm run build`

**Step 3: Commit**
- Commit once both verification commands succeed.
