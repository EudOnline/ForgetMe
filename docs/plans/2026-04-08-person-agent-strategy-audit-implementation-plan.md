# Person-Agent Strategy Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add versioned person-agent strategy evolution with auditable provenance whenever refresh rebuilds materially change a person agent's strategy profile.

**Architecture:** Keep strategy derivation focused on content-only signals, then resolve the next persisted strategy profile during refresh by comparing the derived content against the stored profile. When the material strategy changes, increment the profile version, persist the new profile, and append a person-agent audit event capturing the source reason plus before/after state.

**Tech Stack:** TypeScript, Electron main-process services, SQLite persistence helpers, Vitest

---

### Task 1: Add failing persistence and refresh tests

**Files:**
- Modify: `tests/unit/main/dbPersonAgents.test.ts`
- Modify: `tests/unit/main/personAgentRefreshService.test.ts`

**Step 1: Write the failing test**
- Add a persistence test that appends a `person_agent_audit_events` row and asserts the stored payload is readable and ordered.
- Add a refresh test that starts from an active person-agent with an existing strategy profile, changes the archive signals, and expects:
  - strategy content to change
  - `profileVersion` to increment
  - one audit event describing the refresh-driven strategy update

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRefreshService.test.ts`

**Step 3: Commit**
- Commit after the failing assertions are confirmed and before implementation begins.

### Task 2: Implement auditable strategy profile evolution

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/services/governancePersistenceService.ts`
- Modify: `src/main/services/personAgentStrategyService.ts`
- Modify: `src/main/services/personAgentRefreshService.ts`

**Step 1: Write minimal implementation**
- Add a shared record type for person-agent audit events.
- Add persistence helpers to append and list person-agent audit events.
- Split strategy derivation into:
  - default/content derivation
  - next-profile resolution that preserves version when unchanged and increments version when strategy content changes
- Update refresh rebuild to append an audit event only when the strategy changes, with payload including:
  - `source`
  - `reason`
  - previous profile
  - next profile
  - a compact strategy diff summary

**Step 2: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRefreshService.test.ts`

### Task 3: Run regression verification

**Files:**
- Verify only

**Step 1: Run targeted regression coverage**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/importBatchService.test.ts tests/unit/main/personAgentPromotionService.test.ts`

**Step 2: Run end-to-end verification**
- Run: `npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts`

**Step 3: Commit**
- Commit the audited strategy evolution slice once verification is green.
