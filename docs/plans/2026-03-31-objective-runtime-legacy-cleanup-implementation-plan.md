# Objective Runtime Legacy Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the old run-centric agent system completely, make the message-native objective runtime the only supported runtime model, and prepare the codebase for the next phase of facilitator-driven multi-round deliberation.

**Architecture:** Treat the current `objective / thread / message / proposal / subagent / tool execution` model as the only runtime. Delete the legacy `AgentRun / AgentSuggestion / Agent Console / guided autonomy` stack instead of keeping bridge layers. Retain only governance and policy artifacts that are still consumed by the objective runtime, and rename them so they no longer read like leftovers from the previous architecture.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, Vitest, Playwright.

---

## Analysis Summary

The current repository is already mostly objective-native at the UI and IPC boundary:

- `Objective Workbench` is the only exposed runtime surface.
- `agentIpc` explicitly removes old run-centric handlers and only registers objective-native handlers.
- `ArchiveApi` no longer exposes legacy run/suggestion/autonomy methods.

The remaining legacy surface is now concentrated in shared contracts, persistence, helper services, tests, docs, and a few agent adapters:

- legacy types: `AgentRun*`, `AgentSuggestion*`, `AgentRuntimeSettings*`, `orchestrator.plan_next_action`
- legacy services: `agentPersistenceService`, `agentProactiveTriggerService`, `agentSuggestionRankingService`, `agentSuggestionFollowupService`, `agentAutonomyPolicy`
- legacy bridge: `objectiveSuggestionBridgeService`
- legacy docs and tests referencing `Agent Console`, proactive inbox, guided autonomy, and run-centric review flows
- confusing retained names such as `AgentMemoryRecord` and `AgentPolicyVersionRecord`, even though only policy-version style data is still plausibly useful in the objective runtime

## Cleanup Boundary

**Delete completely**

- run-centric task execution model
- proactive suggestions / guided autonomy / auto-run policy
- `Agent Console` terminology, docs, and tests
- `orchestrator` role and `orchestrator.plan_next_action`
- run-centric persistence/query/mutation code and schemas
- run-centric renderer components such as `AgentRunTimeline`

**Retain, but rename/re-scope**

- policy version storage used by governance and `policy-auditor`
- governance memory only if it still supports an objective-native workflow

**Do not change in this cleanup**

- objective runtime persistence tables
- proposal gate model
- subagent registry, tool broker, and verification broker
- Objective Workbench UX except for wording that still references the old model

## Recommended Next Phase After Cleanup

After the cleanup, the next phase should be:

**Objective Runtime Phase Six: Facilitated Multi-Round Deliberation**

Core outcomes:

1. Introduce a real facilitator loop that runs multiple rounds until convergence, block, stall, or operator handoff.
2. Replace old suggestion seeding with native objective triggers that directly create objectives or participant nudges.
3. Add objective-native stall handling, timeout handling, and checkpoint summarization.
4. Split oversized shared contracts into runtime-focused modules so the new runtime can evolve without dragging old concepts behind it.

This gives the team a clean line of evolution:

`legacy run cleanup -> single runtime model -> stronger facilitator loop -> native objective triggers`

### Task 1: Freeze the Cleanup Target with Failing Regression Tests

**Files:**
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Create: `tests/unit/shared/objectiveRuntimeContracts.test.ts`

**Step 1: Write failing tests that describe the post-cleanup boundary**

Add tests that prove:

- `ArchiveApi` no longer mentions run-centric agent methods anywhere.
- `agentIpc` no longer even references run-centric handler names in its registration logic.
- shared runtime contracts do not include `orchestrator`, `AgentRun*`, `AgentSuggestion*`, `AgentRuntimeSettings*`, or `proposal_followup`.

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/shared/objectiveRuntimeContracts.test.ts
```

Expected: FAIL because legacy runtime types and references still exist.

**Step 3: Commit**

```bash
git add tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/shared/objectiveRuntimeContracts.test.ts
git commit -m "test: lock objective-only runtime boundary"
```

### Task 2: Remove Legacy Runtime Contracts, Schemas, and Shared Types

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agents/agentTypes.ts`
- Modify: `src/main/services/agents/roleAgentRegistryService.ts`

**Step 1: Delete run-centric shared types**

Remove:

- `AgentRunStatus`
- `AgentRunExecutionOrigin`
- `AgentRunRecord`
- `AgentMessageRecord`
- `AgentRunDetail`
- `AgentTriggerKind`
- `AgentSuggestionStatus`
- `AgentSuggestionPriority`
- `AgentAutonomyMode`
- `AgentRuntimeSettingsRecord`
- `ListAgentRunsInput`
- `GetAgentRunInput`
- `ListAgentSuggestionsInput`
- `DismissAgentSuggestionInput`
- `RunAgentSuggestionInput`
- `GetAgentRuntimeSettingsInput`
- `UpdateAgentRuntimeSettingsInput`

Also remove:

- `orchestrator` from `AgentRole`
- `orchestrator.plan_next_action` from `AgentTaskKindByRole`
- `proposal_followup` from `AgentObjectiveInitiator`

**Step 2: Simplify schemas**

Delete obsolete schemas from `src/shared/ipcSchemas.ts`:

- `agentRunStatusSchema`
- `agentSuggestionStatusSchema`
- `agentSuggestionPrioritySchema`
- `agentRunExecutionOriginSchema`
- `agentAutonomyModeSchema`
- `runAgentTaskInputSchema`
- `previewAgentTaskInputSchema`
- `listAgentRunsInputSchema`
- `getAgentRunInputSchema`
- `listAgentSuggestionsInputSchema`
- `refreshAgentSuggestionsInputSchema`
- `dismissAgentSuggestionInputSchema`
- `runAgentSuggestionInputSchema`
- `getAgentRuntimeSettingsInputSchema`
- `updateAgentRuntimeSettingsInputSchema`

**Step 3: Remove legacy role assumptions**

Update `agentTypes.ts` and `roleAgentRegistryService.ts` so they no longer depend on run-centric records or `orchestrator`.

**Step 4: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/shared/objectiveRuntimeContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agents/agentTypes.ts src/main/services/agents/roleAgentRegistryService.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/shared/objectiveRuntimeContracts.test.ts
git commit -m "refactor: delete legacy run-centric agent contracts"
```

### Task 3: Delete Legacy Runtime Services and Persistence

**Files:**
- Delete: `src/main/services/agentPersistenceService.ts`
- Delete: `src/main/services/agentPersistenceQueryService.ts`
- Delete: `src/main/services/agentPersistenceMutationService.ts`
- Delete: `src/main/services/agentProactiveTriggerService.ts`
- Delete: `src/main/services/agentSuggestionRankingService.ts`
- Delete: `src/main/services/agentSuggestionFollowupService.ts`
- Delete: `src/main/services/agentAutonomyPolicy.ts`
- Delete: `src/renderer/components/AgentRunTimeline.tsx`
- Modify: any remaining imports that reference these files

**Step 1: Write failing import/build tests**

Add or update tests so the build fails if any production file still imports the deleted modules.

**Step 2: Remove the modules**

Delete the legacy services and any dead imports.

**Step 3: Replace retained dependencies where necessary**

If governance policy history is still needed by the objective runtime, create narrowly named replacements such as:

- `governancePolicyService.ts`
- `governancePolicyQueryService.ts`

Do not preserve the old runtime surface under the old names.

**Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/toolBrokerService.test.ts tests/unit/main/externalVerificationBrokerService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services src/renderer/components tests/unit/main tests/unit/renderer
git commit -m "refactor: remove legacy agent runtime services"
```

### Task 4: Remove the Legacy Objective Bridge and Make Objectives Native

**Files:**
- Delete: `src/main/services/objectiveSuggestionBridgeService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: any code or docs still referencing `proposal_followup`

**Step 1: Rewrite tests away from suggestion seeding**

Remove bridge-driven tests and replace them with direct objective creation tests.

**Step 2: Delete bridge code**

Delete `objectiveSuggestionBridgeService.ts` and any references to `proposal_followup`.

**Step 3: Reframe the behavior**

Any future auto-created objective should come from a native objective trigger service, not from a suggestion bridge carrying run-centric baggage.

**Step 4: Run tests**

Run:

```bash
npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveRuntimeService.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "refactor: remove legacy objective suggestion bridge"
```

### Task 5: Clean Docs, Terminology, and Release Checklists

**Files:**
- Modify: `README.md`
- Modify: `docs/release/agent-runtime-phase-three-checklist.md`
- Modify: `docs/release/agent-runtime-phase-four-checklist.md`
- Modify: `docs/release/agent-runtime-phase-five-checklist.md`
- Modify: legacy plan docs only if they are meant to remain active references

**Step 1: Remove stale terminology**

Delete or replace:

- `Agent Console`
- proactive inbox
- guided autonomy
- run-centric preview/execute wording

Replace with:

- `Objective Workbench`
- objective-native runtime
- facilitator, proposal gate, subagent, verification broker

**Step 2: Run doc grep**

Run:

```bash
rg -n "Agent Console|guided autonomy|runAgentTask|listAgentRuns|listAgentSuggestions|proposal_followup|orchestrator.plan_next_action" README.md docs src tests
```

Expected: only historical docs that are intentionally preserved, or zero matches if fully scrubbed.

**Step 3: Commit**

```bash
git add README.md docs
git commit -m "docs: remove legacy agent runtime terminology"
```

### Task 6: Optional Database Schema Cleanup

**Files:**
- Create: `src/main/services/migrations/026_remove_legacy_agent_runtime.sql`
- Modify: tests that assert current runtime migrations

**Step 1: Decide migration posture**

Recommended:

- If backward compatibility with local dev archives is not a concern, drop legacy tables outright.
- If compatibility matters, leave tables in place for one release but make them unreachable from code, then drop them in the following phase.

**Step 2: Implement the chosen migration**

Preferred end state:

- no legacy run/suggestion/autonomy tables remain
- only objective-native runtime tables and retained governance policy tables remain

**Step 3: Run migration tests**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseElevenAgentRuntime.test.ts tests/unit/main/dbPhaseTwelveAgentRuntimeRunMetadata.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS after test updates reflect the new schema boundary.

**Step 4: Commit**

```bash
git add src/main/services/migrations tests/unit/main
git commit -m "refactor: drop legacy agent runtime tables"
```

## Next Phase Design: Objective Runtime Phase Six

After the cleanup lands, implement the next phase in this order:

1. **Facilitator loop**
   Add a real round scheduler in `objectiveRuntimeService` and `objectiveRuntimeDeliberationService` so the runtime can continue until convergence, challenge, veto, operator wait, or stall.

2. **Native stall management**
   Turn `detectStall(...)` into real runtime behavior with checkpoints like `stalled` and `awaiting_operator_confirmation`.

3. **Native objective triggers**
   Replace legacy proactive suggestions with a small `objectiveTriggerService` that creates objective seeds directly from archive state.

4. **Contract splitting**
   Split `src/shared/archiveContracts.ts` into runtime-specific modules such as:
   - `src/shared/objectiveRuntimeContracts.ts`
   - `src/shared/reviewContracts.ts`
   - `src/shared/workspaceContracts.ts`

5. **Objective-native ops UI**
   Expand `Objective Workbench` to show facilitator state, round count, stall reason, and convergence reason instead of inheriting any old “agent console” behavior.

## Recommended Order of Execution

1. Freeze boundary with tests.
2. Delete legacy contracts and schemas.
3. Delete legacy services and persistence.
4. Remove the suggestion bridge.
5. Clean docs and naming.
6. Decide whether to drop legacy DB tables now or one phase later.
7. Start Phase Six only after the codebase compiles with a single runtime model.

Plan complete and saved to `docs/plans/2026-03-31-objective-runtime-legacy-cleanup-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
