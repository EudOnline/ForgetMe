# Person-Agent Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add promotion-based person agents with independent fact and interaction memory, then route person-centric memory-workspace answers through those agents while keeping one primary user-facing assistant.

**Architecture:** Introduce a new person-agent persistence layer, projection services for fact and interaction memory, a promotion scorer plus refresh queue, and an answer-pack orchestration service that plugs into existing memory-workspace flows. Keep current workspace APIs as the front door, and integrate person agents as a bounded backend consultation layer rather than a new direct-chat surface.

**Tech Stack:** TypeScript, Electron main-process services, SQLite migrations, Zod contracts, Vitest, Playwright

---

### Task 1: Add shared contracts for person agents and answer packs

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/shared/phaseEightContracts.test.ts`
- Test: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing test**
- Add shared-contract assertions for:
  - `PersonAgentRecord`
  - `PersonAgentPromotionScore`
  - `PersonAgentFactMemoryRecord`
  - `PersonAgentInteractionMemoryRecord`
  - `PersonAgentAnswerPack`
  - optional workspace metadata showing consulted person agents
- Add schema tests for any new workspace inputs needed to inspect person-agent state later, even if phase-one UI does not expose them yet.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 3: Write minimal implementation**
- Add new shared types for person-agent records, memory records, answer-pack records, refresh reasons, and promotion tiers.
- Extend workspace response metadata conservatively so current consumers continue working.
- Add any new Zod schemas for backend inspection endpoints planned in later tasks.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts`

### Task 2: Add SQLite tables and persistence helpers for person agents

**Files:**
- Create: `src/main/services/migrations/036_person_agents.sql`
- Modify: `src/main/services/db.ts`
- Modify: `src/main/services/governancePersistenceService.ts`
- Test: `tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts`
- Create: `tests/unit/main/dbPersonAgents.test.ts`

**Step 1: Write the failing test**
- Add database migration tests covering:
  - `person_agents`
  - `person_agent_fact_memory`
  - `person_agent_interaction_memory`
  - `person_agent_refresh_queue`
  - `person_agent_audit_events`
- Verify indexes on `canonical_person_id`, refresh status, and memory lookup keys.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`

**Step 3: Write minimal implementation**
- Create migration `036_person_agents.sql`.
- Add persistence helpers for insert/update/list/get operations around person agents and refresh queue records.
- Keep the persistence API rebuild-friendly: fact memory should be replaceable by version, not mutated field-by-field only.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts`

### Task 3: Implement promotion scoring and activation rules

**Files:**
- Create: `src/main/services/personAgentPromotionService.ts`
- Modify: `src/main/services/personDossierService.ts`
- Modify: `src/main/services/timelineService.ts`
- Test: `tests/unit/main/personAgentPromotionService.test.ts`

**Step 1: Write the failing test**
- Add promotion tests that prove:
  - low-signal people remain unpromoted
  - high approved-fact plus interaction counts activate a person agent
  - promotion output is deterministic for the same archive state
  - people with no approved evidence do not activate

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/personAgentPromotionService.test.ts`

**Step 3: Write minimal implementation**
- Compute promotion score from:
  - approved fact count
  - evidence source count
  - relationship degree
  - recent question frequency
  - recent citation frequency
- Return candidate/active tier decisions with a reason summary.
- Expose helper methods that can be reused by refresh orchestration.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/personAgentPromotionService.test.ts`

### Task 4: Implement person-agent fact memory projection

**Files:**
- Create: `src/main/services/personAgentFactMemoryService.ts`
- Modify: `src/main/services/personDossierService.ts`
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Test: `tests/unit/main/personAgentFactMemoryService.test.ts`

**Step 1: Write the failing test**
- Add tests proving the fact-memory projection:
  - captures approved facts, timeline, relationships, conflicts, and gaps
  - preserves evidence refs
  - marks conflict and coverage entries distinctly
  - avoids rewriting unchanged records when source hashes are stable

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/personAgentFactMemoryService.test.ts`

**Step 3: Write minimal implementation**
- Build a projection service that converts dossier-like approved views into fact-memory rows.
- Store projection version/hash metadata.
- Add helper methods to fetch a compact fact-memory summary for answer generation.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/personAgentFactMemoryService.test.ts`

### Task 5: Implement person-agent interaction memory

**Files:**
- Create: `src/main/services/personAgentInteractionMemoryService.ts`
- Modify: `src/main/services/memoryWorkspaceSessionService.ts`
- Modify: `src/main/services/memoryWorkspaceResponseService.ts`
- Test: `tests/unit/main/personAgentInteractionMemoryService.test.ts`
- Test: `tests/unit/main/memoryWorkspaceSessionService.test.ts`

**Step 1: Write the failing test**
- Add interaction-memory tests covering:
  - person-scoped questions increment topic counters
  - repeated asks merge into summarized topics instead of duplicating raw text
  - redirect / conflict / coverage outcomes are stored
  - cited evidence refs are captured as interaction context

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts`

**Step 3: Write minimal implementation**
- Add writeback helpers that record summarized interaction outcomes after persisted workspace turns complete.
- Prefer turn references and summaries over duplicating raw text bodies.
- Add topic extraction rules simple enough to stay deterministic in phase one.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts`

### Task 6: Add refresh queue and event-driven rebuild orchestration

**Files:**
- Create: `src/main/services/personAgentRefreshService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Modify: `src/main/services/reviewQueueDecisionService.ts`
- Modify: `src/main/services/relationService.ts`
- Modify: `src/main/services/profileProjectionService.ts`
- Test: `tests/unit/main/personAgentRefreshService.test.ts`

**Step 1: Write the failing test**
- Add tests proving:
  - import-linked events enqueue refreshes for affected people
  - approved review decisions enqueue refreshes
  - relationship changes enqueue refreshes
  - repeated events coalesce for the same person when a refresh is already pending

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts`

**Step 3: Write minimal implementation**
- Create refresh queue helpers and reason coalescing.
- Add synchronous enqueue calls in existing import/review/relation paths.
- Implement rebuild routines that:
  - recompute promotion
  - activate/update person agents
  - refresh fact memory
  - leave interaction memory intact except version metadata

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/personAgentRefreshService.test.ts`

### Task 7: Implement person answer-pack generation

**Files:**
- Create: `src/main/services/personAgentAnswerPackService.ts`
- Modify: `src/main/services/communicationEvidenceService.ts`
- Modify: `src/main/services/memoryWorkspaceResponseHelperService.ts`
- Test: `tests/unit/main/personAgentAnswerPackService.test.ts`

**Step 1: Write the failing test**
- Add tests showing answer-pack generation:
  - prioritizes stable fact memory for factual questions
  - includes conflicts and coverage gaps when applicable
  - includes recent interaction topics for context
  - falls back safely when communication evidence is insufficient

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/personAgentAnswerPackService.test.ts`

**Step 3: Write minimal implementation**
- Build a deterministic classifier for question kinds such as:
  - identity / profile fact
  - relationship
  - recent timeline
  - quote request
  - advice
- Assemble answer packs from fact memory, interaction memory, and communication evidence.
- Preserve citations and warning metadata so the primary assistant can still apply current guardrails.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/personAgentAnswerPackService.test.ts`

### Task 8: Route memory workspace answers through person agents

**Files:**
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `src/main/services/memoryWorkspaceResponseService.ts`
- Modify: `src/main/services/memoryWorkspaceSessionService.ts`
- Create: `src/main/services/personAgentRoutingService.ts`
- Test: `tests/unit/main/memoryWorkspaceService.test.ts`
- Test: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Test: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing test**
- Add backend tests proving:
  - person-scoped questions use an active person agent when available
  - global questions that resolve to one promoted person consult that person agent
  - non-promoted people still use the existing archive-backed path
  - response metadata can reveal whether a person agent was consulted without breaking the renderer

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 3: Write minimal implementation**
- Insert routing before current card-only answer selection.
- Keep final response ownership inside existing workspace response creation.
- Add person-agent consultation metadata only if it does not force immediate frontend rework.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx`

### Task 9: Expose bounded backend inspection APIs for person-agent state

**Files:**
- Modify: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Modify: `src/main/modules/workspace/runtime/createWorkspaceModule.ts`
- Modify: `src/preload/modules/workspace.ts`
- Modify: `src/renderer/clients/workspaceClient.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/schemas/workspace.ts`
- Test: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Test: `tests/unit/preload/index.test.ts`

**Step 1: Write the failing test**
- Add IPC and preload tests for minimal inspection endpoints such as:
  - `getPersonAgentState(canonicalPersonId)`
  - `listPersonAgentRefreshQueue()`
  - `getPersonAgentMemorySummary(canonicalPersonId)`
- Keep them optional for phase-one frontend usage.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/preload/index.test.ts`

**Step 3: Write minimal implementation**
- Add workspace-module methods for bounded read access to person-agent state.
- Extend the bridge and renderer client with no-op fallbacks matching current patterns.
- Do not expose mutation-heavy debugging APIs in phase one.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/preload/index.test.ts`

### Task 10: Verify the end-to-end path and document residual risks

**Files:**
- Test: `tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts`
- Test: `tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts`
- Create: `tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts`
- Modify: `README.md`

**Step 1: Write the failing test**
- Add an end-to-end flow that seeds a high-signal person, triggers promotion, asks a factual person question, and verifies the final answer is grounded, cited, and still displayed through the primary workspace surface.

**Step 2: Run test to verify it fails**
- Run: `npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts`

**Step 3: Write minimal implementation**
- Fill any missing plumbing discovered by the end-to-end path.
- Update README architecture notes and verification guidance with the new person-agent layer.

**Step 4: Run test to verify it passes**
- Run: `npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts`

### Task 11: Run broader verification

**Files:**
- No additional file changes required unless regressions are found

**Step 1: Run focused backend suite**
- Run: `npm run test:unit -- tests/unit/main/dbPersonAgents.test.ts tests/unit/main/personAgentPromotionService.test.ts tests/unit/main/personAgentFactMemoryService.test.ts tests/unit/main/personAgentInteractionMemoryService.test.ts tests/unit/main/personAgentRefreshService.test.ts tests/unit/main/personAgentAnswerPackService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts`

**Step 2: Run renderer and bridge regressions**
- Run: `npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/preload/index.test.ts`

**Step 3: Run broader repo checks**
- Run: `npm run lint`
- Run: `npm run test:typecheck`
- Run: `npm run test:e2e -- tests/e2e/memory-workspace-person-agent-answer-flow.spec.ts tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts`

**Step 4: Summarize residual risks**
- Confirm whether:
  - promotion thresholds need tuning
  - global-to-person resolution is too conservative
  - interaction-memory summaries are too lossy
  - direct objective-runtime consultation should remain deferred

---

Plan complete and saved to `docs/plans/2026-04-06-person-agent-backend-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
