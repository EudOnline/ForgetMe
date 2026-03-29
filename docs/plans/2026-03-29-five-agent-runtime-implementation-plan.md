# Native Five-Agent Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a native five-agent runtime to ForgetMe so users can drive import, review, workspace, and governance workflows through one agent-facing surface backed by LiteLLM and the existing service layer.

**Architecture:** Keep the current archive, review, and Memory Workspace services as the source of truth. Introduce a new agent runtime in the Electron main process with five role adapters: `orchestrator`, `ingestion`, `review`, `workspace`, and `governance`. Persist agent runs, messages, memory, and policy versions in SQLite; route all model traffic through the existing LiteLLM client; expose a narrow IPC surface to the renderer through a new `Agent Console` page instead of replacing the current application screens.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing IPC/preload bridge, LiteLLM, Vitest, Playwright.

---

## Assumptions

- The current archive, review, enrichment, publication, and preservation flows remain authoritative and must not be bypassed by agents.
- High-risk review decisions still require explicit user confirmation or the existing hard-gated safe-batch logic.
- The first iteration should add one new agent-facing UI page, not rewrite the full renderer around agents.
- The existing `modelGatewayService.ts` remains the only LiteLLM HTTP client.
- Agent "memory improvement" means versioned operational memory and policy drafts, not self-modifying truth or unreviewed prompt mutation.

## Scope Guardrails

In scope:

- five logical agent roles inside one main-process runtime
- LiteLLM-backed orchestration and role-aware routing metadata
- persistent SQLite storage for agent runs, agent messages, operational memory, and policy versions
- one renderer-facing `Agent Console` entry point
- structured delegation into existing import, review, workspace, and governance services
- explicit safety gates for destructive or truth-changing actions

Out of scope:

- fully autonomous approval of high-risk candidates
- agent-written modifications directly into approved formal fact tables
- background self-modifying prompt logic without human review
- replacing every current screen with a conversational shell
- cloud agent coordination or remote multi-user collaboration

## Execution Notes

- Follow `@test-driven-development` for each task: write the failing test first, run it, implement the minimum, rerun, then commit.
- Follow `@verification-before-completion` before each completion claim and before any integration commit.
- Keep the first release YAGNI: ship one agent console, not an "all screens become agents" rewrite.

### Task 1: Define Shared Agent Contracts and IPC Schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/agentRuntimeContracts.test.ts`

**Step 1: Write the failing shared-contract tests**

Create `tests/unit/shared/agentRuntimeContracts.test.ts` with coverage for:

- `runAgentTaskInputSchema` parsing a minimal user prompt
- rejection when `role` is unknown
- rejection when a destructive task omits a confirmation token
- successful parsing of `listAgentRuns` and `getAgentRun` inputs

Use expectations shaped like:

```ts
expect(runAgentTaskInputSchema.safeParse({
  prompt: 'Import the latest chat export',
  role: 'orchestrator'
}).success).toBe(true)

expect(runAgentTaskInputSchema.safeParse({
  prompt: 'Approve this high-risk candidate',
  role: 'review',
  taskKind: 'review.apply_decision'
}).success).toBe(false)
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts
```

Expected: FAIL because the new shared types and schemas do not exist yet.

**Step 3: Add shared contract types**

In `src/shared/archiveContracts.ts`, add:

- `AgentRole`
- `AgentTaskKind`
- `AgentRunStatus`
- `AgentRunRecord`
- `AgentRunDetail`
- `AgentMessageRecord`
- `AgentMemoryRecord`
- `AgentPolicyVersionRecord`
- `RunAgentTaskInput`
- `RunAgentTaskResult`
- `ListAgentRunsInput`
- `GetAgentRunInput`
- `ListAgentMemoriesInput`

Extend `ArchiveApi` with:

- `runAgentTask`
- `listAgentRuns`
- `getAgentRun`
- `listAgentMemories`

**Step 4: Add IPC schemas**

In `src/shared/ipcSchemas.ts`, add Zod schemas for:

- `agentRoleSchema`
- `agentTaskKindSchema`
- `runAgentTaskInputSchema`
- `listAgentRunsInputSchema`
- `getAgentRunInputSchema`
- `listAgentMemoriesInputSchema`

Model destructive review application so it requires:

```ts
confirmationToken: z.string().min(1)
```

when `taskKind` is one of:

- `review.apply_safe_group`
- `review.apply_item_decision`

**Step 5: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/agentRuntimeContracts.test.ts
git commit -m "feat: add shared agent runtime contracts"
```

### Task 2: Persist Agent Runs, Messages, Memory, and Policy Versions

**Files:**
- Create: `src/main/services/migrations/021_agent_runtime.sql`
- Create: `src/main/services/agentPersistenceService.ts`
- Create: `tests/unit/main/agentPersistenceService.test.ts`
- Create: `tests/unit/main/dbPhaseElevenAgentRuntime.test.ts`

**Step 1: Write the failing migration and persistence tests**

Create tests that prove:

- the migration creates `agent_runs`, `agent_messages`, `agent_memories`, and `agent_policy_versions`
- a run can be created and fetched
- messages append in ordinal order
- memory upserts by `(role, memory_key)`
- policy versions are append-only

Use expectations like:

```ts
expect(run.runId).toBeTruthy()
expect(detail.messages.map((item) => item.ordinal)).toEqual([1, 2])
expect(memories[0]?.memoryKey).toBe('review.safe_batch.rules')
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseElevenAgentRuntime.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: FAIL because the migration and persistence service do not exist yet.

**Step 3: Add the migration**

Create `src/main/services/migrations/021_agent_runtime.sql` with tables:

- `agent_runs`
- `agent_messages`
- `agent_memories`
- `agent_policy_versions`

Include:

- foreign keys from messages to runs
- unique key for memory on `(role, memory_key)`
- indexes on `created_at`, `status`, `role`, and `run_id`

**Step 4: Add the persistence service**

Create `src/main/services/agentPersistenceService.ts` with functions such as:

```ts
createAgentRun(db, input)
updateAgentRunStatus(db, input)
appendAgentMessage(db, input)
listAgentRuns(db, input)
getAgentRun(db, input)
upsertAgentMemory(db, input)
listAgentMemories(db, input)
createAgentPolicyVersion(db, input)
```

Keep writes deterministic and journal-like; do not mutate old messages.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/dbPhaseElevenAgentRuntime.test.ts tests/unit/main/agentPersistenceService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/migrations/021_agent_runtime.sql src/main/services/agentPersistenceService.ts tests/unit/main/dbPhaseElevenAgentRuntime.test.ts tests/unit/main/agentPersistenceService.test.ts
git commit -m "feat: persist agent runtime state"
```

### Task 3: Extend LiteLLM Routing for Agent Roles and Metadata

**Files:**
- Modify: `src/main/services/modelGatewayService.ts`
- Modify: `tests/unit/main/modelGatewayService.test.ts`

**Step 1: Write the failing model routing tests**

Extend `tests/unit/main/modelGatewayService.test.ts` to prove:

- `resolveModelRoute` can attach agent metadata headers
- `memory_dialogue` calls can differ by `agentRole`
- `callLiteLLM` forwards `x-forgetme-agent-role`, `x-forgetme-run-id`, and `x-forgetme-policy-version`

Add expectations like:

```ts
expect(route.headers['x-forgetme-agent-role']).toBe('workspace')
expect(route.headers['x-forgetme-run-id']).toBe('run-123')
expect(route.headers['x-forgetme-policy-version']).toBe('policy-v1')
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/modelGatewayService.test.ts
```

Expected: FAIL because agent metadata routing is not implemented.

**Step 3: Extend the gateway**

In `src/main/services/modelGatewayService.ts`:

- keep the current `ModelTaskType` surface
- extend `resolveModelRoute(...)` to accept optional:
  - `agentRole`
  - `runId`
  - `policyVersion`
  - `memoryProfile`
- extend headers with:
  - `x-forgetme-agent-role`
  - `x-forgetme-run-id`
  - `x-forgetme-policy-version`
  - `x-forgetme-memory-profile`

Do not add a second HTTP client.

**Step 4: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/modelGatewayService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/modelGatewayService.ts tests/unit/main/modelGatewayService.test.ts
git commit -m "feat: add agent-aware litellm routing metadata"
```

### Task 4: Implement the Core Agent Runtime and Orchestrator

**Files:**
- Create: `src/main/services/agentRuntimeService.ts`
- Create: `src/main/services/agentOrchestratorService.ts`
- Create: `src/main/services/agents/agentTypes.ts`
- Create: `tests/unit/main/agentRuntimeService.test.ts`

**Step 1: Write the failing runtime tests**

Create `tests/unit/main/agentRuntimeService.test.ts` to prove:

- orchestrator runs create a persisted run row
- runtime delegates to the requested role adapter
- messages are appended for `system`, `user`, `assistant`, and `tool`
- unknown task kinds fail cleanly

Use expectations like:

```ts
expect(result.status).toBe('completed')
expect(detail.messages.map((item) => item.role)).toContain('assistant')
expect(detail.assignedRoles).toContain('workspace')
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts
```

Expected: FAIL because the runtime and orchestrator services do not exist.

**Step 3: Create the agent type surface**

In `src/main/services/agents/agentTypes.ts`, define:

```ts
export type AgentExecutionContext = { ... }
export type AgentAdapter = {
  role: AgentRole
  canHandle(taskKind: AgentTaskKind): boolean
  execute(context: AgentExecutionContext): Promise<AgentAdapterResult>
}
```

**Step 4: Create the orchestrator**

In `src/main/services/agentOrchestratorService.ts`, implement:

- task-to-role resolution
- delegation rules
- explicit block for unsafe destructive tasks without confirmation
- final summary generation

**Step 5: Create the runtime**

In `src/main/services/agentRuntimeService.ts`, implement:

- run creation
- message persistence
- adapter registry
- orchestrator dispatch
- error-to-run-status mapping

**Step 6: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/main/services/agents/agentTypes.ts src/main/services/agentOrchestratorService.ts src/main/services/agentRuntimeService.ts tests/unit/main/agentRuntimeService.test.ts
git commit -m "feat: add core five-agent runtime"
```

### Task 5: Implement the Ingestion and Review Agent Adapters

**Files:**
- Create: `src/main/services/agents/ingestionAgentService.ts`
- Create: `src/main/services/agents/reviewAgentService.ts`
- Create: `tests/unit/main/ingestionAgentService.test.ts`
- Create: `tests/unit/main/reviewAgentService.test.ts`

**Step 1: Write the failing ingestion-agent tests**

Cover:

- `ingestion.import_batch` produces a tool plan instead of touching UI
- `ingestion.rerun_enrichment` delegates into the enrichment services
- `ingestion.summarize_document_evidence` reads evidence and returns structured assistant output

**Step 2: Write the failing review-agent tests**

Cover:

- `review.summarize_queue` reads queue/workbench state
- `review.suggest_safe_group_action` identifies safe batch opportunities
- `review.apply_safe_group` refuses to execute without a confirmation token

**Step 3: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/ingestionAgentService.test.ts tests/unit/main/reviewAgentService.test.ts
```

Expected: FAIL because the adapters do not exist yet.

**Step 4: Implement the ingestion adapter**

Use existing services only:

- `importBatchService.ts`
- `dedupService.ts`
- `parserRegistry.ts`
- `documentOcrService.ts`
- `imageUnderstandingService.ts`
- `enrichmentDispatchService.ts`
- `enrichmentReadService.ts`

Do not duplicate parser logic.

**Step 5: Implement the review adapter**

Use existing services only:

- `reviewQueueService.ts`
- `reviewWorkbenchReadService.ts`
- `reviewImpactService.ts`
- `reviewEvidenceTraceService.ts`
- `enrichmentReviewService.ts`

Allow:

- queue summaries
- candidate summaries
- safe-group proposals

Block:

- direct high-risk approval without explicit confirmation

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/ingestionAgentService.test.ts tests/unit/main/reviewAgentService.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/main/services/agents/ingestionAgentService.ts src/main/services/agents/reviewAgentService.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/reviewAgentService.test.ts
git commit -m "feat: add ingestion and review agent adapters"
```

### Task 6: Implement the Workspace and Governance Agent Adapters

**Files:**
- Create: `src/main/services/agents/workspaceAgentService.ts`
- Create: `src/main/services/agents/governanceAgentService.ts`
- Create: `src/main/services/agentMemoryService.ts`
- Create: `src/main/services/agentPolicyService.ts`
- Create: `tests/unit/main/workspaceAgentService.test.ts`
- Create: `tests/unit/main/governanceAgentService.test.ts`
- Create: `tests/unit/main/agentMemoryService.test.ts`

**Step 1: Write the failing workspace-agent tests**

Cover:

- `workspace.ask` delegates to `askMemoryWorkspacePersisted`
- `workspace.compare` delegates to compare services
- `workspace.publish_draft` delegates to the existing publication stack

**Step 2: Write the failing governance-agent tests**

Cover:

- memory upsert and recall
- failure summarization from prior runs
- policy proposal creation without direct policy activation

**Step 3: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/workspaceAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentMemoryService.test.ts
```

Expected: FAIL because the services do not exist yet.

**Step 4: Implement the workspace adapter**

Use existing services only:

- `memoryWorkspaceService.ts`
- `memoryWorkspaceSessionService.ts`
- `memoryWorkspaceCompareService.ts`
- `memoryWorkspaceCompareMatrixService.ts`
- `memoryWorkspaceDraftReviewService.ts`
- `personaDraftHandoffService.ts`
- `approvedDraftPublicationService.ts`
- `approvedDraftProviderSendService.ts`
- `approvedDraftHostedShareLinkService.ts`

**Step 5: Implement governance memory and policy services**

Create:

- `agentMemoryService.ts` for operational memory CRUD over `agent_memories`
- `agentPolicyService.ts` for append-only policy version creation over `agent_policy_versions`

**Step 6: Implement the governance adapter**

It should:

- record structured feedback
- summarize repeated failures
- propose policy drafts

It must not:

- auto-activate a policy
- edit approved facts

**Step 7: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/workspaceAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentMemoryService.test.ts
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/main/services/agents/workspaceAgentService.ts src/main/services/agents/governanceAgentService.ts src/main/services/agentMemoryService.ts src/main/services/agentPolicyService.ts tests/unit/main/workspaceAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentMemoryService.test.ts
git commit -m "feat: add workspace and governance agent adapters"
```

### Task 7: Wire Agent Runtime into IPC, Preload, and Renderer API

**Files:**
- Create: `src/main/ipc/agentIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/shared/archiveContracts.ts`
- Create: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing IPC and bridge tests**

Cover:

- IPC handler registration for:
  - `archive:runAgentTask`
  - `archive:listAgentRuns`
  - `archive:getAgentRun`
  - `archive:listAgentMemories`
- preload exposes the new methods
- renderer archive API fallback implements them

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the IPC and bridge methods are not wired.

**Step 3: Add the IPC layer**

In `src/main/ipc/agentIpc.ts`, register handlers that:

- parse inputs with the new schemas
- open the database
- build the runtime with all five adapters
- return structured run results and detail records

**Step 4: Register IPC in main**

Modify `src/main/index.ts` to call:

```ts
registerAgentIpc(appPaths)
```

after the other archive IPC registrations.

**Step 5: Expose the bridge**

Modify:

- `src/preload/index.ts`
- `src/renderer/archiveApi.ts`

to surface the new methods end-to-end.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/main/ipc/agentIpc.ts src/main/index.ts src/preload/index.ts src/renderer/archiveApi.ts src/shared/archiveContracts.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose agent runtime through ipc bridge"
```

### Task 8: Add a Minimal Agent Console Renderer Surface

**Files:**
- Create: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `src/renderer/styles.css`
- Create: `tests/unit/renderer/agentConsolePage.test.tsx`

**Step 1: Write the failing renderer tests**

Cover:

- the new page appears in navigation
- a prompt can be submitted through the new archive API
- run history renders status, assigned roles, and latest assistant response
- destructive review actions show a confirmation affordance before resubmission

Use assertions like:

```ts
expect(await screen.findByRole('heading', { name: 'Agent Console' })).toBeInTheDocument()
expect(screen.getByText('Assigned roles: orchestrator, workspace')).toBeInTheDocument()
```

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: FAIL because the page does not exist yet.

**Step 3: Add the page**

Create `src/renderer/pages/AgentConsolePage.tsx` with:

- prompt textarea
- optional role override select
- run history sidebar
- latest run detail panel
- confirmation token flow for blocked destructive actions

**Step 4: Add navigation and copy**

Modify:

- `src/renderer/App.tsx`
- `src/renderer/i18n.tsx`
- `src/renderer/styles.css`

Add one new nav entry under `Workspace` or `Ops`, but do not remove existing pages.

**Step 5: Run the targeted test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer/pages/AgentConsolePage.tsx src/renderer/App.tsx src/renderer/i18n.tsx src/renderer/styles.css tests/unit/renderer/agentConsolePage.test.tsx
git commit -m "feat: add agent console page"
```

### Task 9: Add End-to-End Coverage and Final Docs

**Files:**
- Create: `tests/e2e/agent-console-flow.spec.ts`
- Modify: `README.md`
- Modify: `package.json`

**Step 1: Write the failing e2e flow**

Create `tests/e2e/agent-console-flow.spec.ts` covering:

1. open `Agent Console`
2. ask the orchestrator to summarize pending review work
3. verify a completed run shows assigned roles and assistant output
4. ask the workspace agent to run an archive-grounded question
5. verify the run detail links back into the existing workspace/review surfaces

Keep the first flow read-heavy and low-risk; do not require destructive approval to pass.

**Step 2: Run the targeted e2e test to verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts
```

Expected: FAIL because the page and runtime path are not fully wired yet.

**Step 3: Update maintainer docs**

In `README.md`, add:

- the five-agent architecture overview
- role descriptions
- LiteLLM configuration notes for agent traffic
- the fact that approved truth remains review-gated

**Step 4: Add agent verification scripts**

In `package.json`, add a script such as:

```json
{
  "test:e2e:agent": "npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts"
}
```

Do not add the new agent flow to release smoke until it proves stable.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/workspaceAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/agentConsolePage.test.tsx
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add tests/e2e/agent-console-flow.spec.ts README.md package.json
git commit -m "docs: add five-agent runtime docs and e2e coverage"
```

### Task 10: Run Full Verification and Ship the Baseline

**Files:**
- No new files; verification only

**Step 1: Run full typecheck**

Run:

```bash
npm run test:typecheck
```

Expected: PASS

**Step 2: Run full unit test suite**

Run:

```bash
npm run test:unit
```

Expected: PASS

**Step 3: Run the release smoke suite**

Run:

```bash
npm run test:smoke:release
```

Expected: PASS

**Step 4: Run the new agent e2e flow**

Run:

```bash
npm run test:e2e:agent
```

Expected: PASS

**Step 5: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

**Step 6: Commit the final verification-only delta if needed**

If any documentation or snapshots changed during final stabilization:

```bash
git add <files>
git commit -m "chore: finalize five-agent runtime baseline"
```

If nothing changed: do not create an empty commit.

## Recommended Implementation Order

1. Contracts and schemas
2. SQLite persistence
3. LiteLLM metadata routing
4. Orchestrator runtime
5. Ingestion + review adapters
6. Workspace + governance adapters
7. IPC bridge
8. Agent console UI
9. E2E + docs
10. Full verification

## Expected First-Cut User Experience

- User opens `Agent Console`
- User types a goal such as "Summarize the highest-priority pending review work"
- Orchestrator creates a persisted run
- Runtime delegates to `review`
- Review adapter summarizes queue and returns structured assistant output
- User sees:
  - run status
  - assigned roles
  - assistant summary
  - any blocked action requiring explicit confirmation

## Safety Rules That Must Stay True

- No agent directly writes approved formal facts without the existing review gate.
- No agent auto-applies policy drafts.
- No high-risk destructive action proceeds without explicit confirmation.
- Agent memory is operational only; evidence and approved facts remain authoritative in their existing tables.

## Follow-Up Phase After This Plan

If this baseline succeeds, the next plan should cover:

- agent-driven preservation flows
- scheduled/background agent runs
- richer run visualization and replay diffing
- policy evaluation sets and offline scoring

