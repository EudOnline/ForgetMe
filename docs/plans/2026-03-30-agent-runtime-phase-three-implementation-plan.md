# Agent Runtime Phase Three Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current agent runtime from a strong internal prototype into an operator-grade workflow surface by making ingestion actually executable, exposing agent memory/policy state, and making orchestration decisions previewable before execution.

**Architecture:** Keep the existing import, review, Memory Workspace, and governance services authoritative. Extend the current runtime and `Agent Console` instead of introducing a second orchestration stack: pass structured ingestion inputs into the existing import pipeline, surface persisted memory/policy records through the same IPC bridge, and expose a read-only execution preview built from the current orchestrator logic so operators can see what the runtime will do before it mutates anything.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Zod, existing IPC/preload bridge, Vitest, Playwright.

---

## Assumptions

- `main` already contains the five-agent runtime baseline plus phase-two replay and destructive-review gating.
- The current import pipeline in `src/main/services/importBatchService.ts` remains the only supported way to create import batches.
- The current runtime is intentionally local-first and role-based; the next phase should improve trust and completeness, not chase a generic autonomous-agent platform.
- Destructive review actions must remain confirmation-gated, while new ingestion flows may use file picking + preflight without adding a second confirmation step.

## Scope Guardrails

In scope:

- make `ingestion.import_batch` execute a real import through the existing import services
- let `Agent Console` select files, run import preflight, and submit structured ingestion input
- expose persisted agent memories and governance policy versions in the renderer
- add a previewable execution plan so the operator can inspect routing before running
- strengthen unit and e2e coverage around the new operator workflow

Out of scope:

- a generalized planner/executor with arbitrary tool use
- background autonomous loops or scheduled agent runs
- policy auto-activation or self-modifying prompts
- replacing `Import`, `Review Queue`, or `Memory Workspace` with a fully conversational shell
- cloud or multi-device agent coordination

## Execution Notes

- Follow `@test-driven-development` for each task: write the failing test first, run it, implement the minimum, rerun, then commit.
- Follow `@verification-before-completion` before every completion claim and before any integration commit.
- Prefer explicit structured inputs over prompt magic when an action needs data the prompt cannot safely provide, especially for local file import.
- Keep YAGNI pressure high. The goal is a trustworthy operator console, not a full autonomous runtime rewrite.

### Task 1: Make `ingestion.import_batch` Execute Through the Existing Import Pipeline

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/main/services/agents/ingestionAgentService.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/shared/agentRuntimeContracts.test.ts`
- Modify: `tests/unit/main/ingestionAgentService.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`
- Create: `tests/e2e/agent-console-ingestion-flow.spec.ts`

**Step 1: Write the failing ingestion-console tests**

Add tests that prove:

- an ingestion task can carry structured `sourcePaths` and `sourceLabel`
- `Agent Console` can pick files through the existing file picker when the operator runs an import task
- the console runs `preflightImportBatch(...)` before submitting the task
- `ingestion.import_batch` calls a real dependency instead of returning a planning-only response
- the operator sees a batch-oriented result such as batch id, file count, and review count

Use expectations shaped like:

```ts
expect(runAgentTask).toHaveBeenCalledWith({
  prompt: 'Import these files into the archive',
  role: 'ingestion',
  taskKind: 'ingestion.import_batch',
  sourcePaths: ['/tmp/chat.json'],
  sourceLabel: 'Agent Console import'
})

expect(createImportBatch).toHaveBeenCalledWith({
  sourcePaths: ['/tmp/chat.json'],
  sourceLabel: 'Agent Console import'
})
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-ingestion-flow.spec.ts
```

Expected: FAIL because the agent input model cannot yet carry import files and the ingestion adapter still returns a planning-only message.

**Step 3: Extend the agent input model for executable ingestion**

In `src/shared/archiveContracts.ts`, extend the ingestion branch of `RunAgentTaskInput` so it can safely carry:

```ts
sourcePaths?: string[]
sourceLabel?: string
```

In `src/shared/ipcSchemas.ts`, validate:

- `sourcePaths` as a non-empty string array when present
- `sourceLabel` as a non-empty string when present
- `sourcePaths` / `sourceLabel` only for the `ingestion` role

Do not add these fields to every role’s business logic; keep them narrow and ingestion-specific.

**Step 4: Wire executable import behavior into the ingestion adapter**

Update `src/main/services/agents/ingestionAgentService.ts` so `ingestion.import_batch`:

- requires `sourcePaths` for actual execution
- uses the injected import dependency instead of telling the user to use the old flow
- returns tool + agent messages summarizing the created batch

Use a dependency shape like:

```ts
createImportBatch?: (input: {
  sourcePaths: string[]
  sourceLabel: string
}) => Promise<{
  batchId: string
  summary?: {
    frozenCount: number
    parsedCount: number
    duplicateCount: number
    reviewCount: number
  }
}>
```

In `src/main/ipc/agentIpc.ts`, inject the real import implementation by wrapping `createImportBatch({ appPaths, ...input })`.

**Step 5: Let `Agent Console` pick files and preflight before submit**

Update `src/renderer/pages/AgentConsolePage.tsx` so:

- when the operator chooses `ingestion` and the inferred task is `ingestion.import_batch`, the page uses `archiveApi.selectImportFiles()`
- the selected files are preflighted through `archiveApi.preflightImportBatch(...)`
- unsupported files are filtered out before submission
- the final agent task is submitted with `sourcePaths` and a stable default label such as `Agent Console import`

Keep this flow separate from destructive-review confirmation. Import should not reuse the confirmation-token affordance.

Add UI copy in `src/renderer/i18n.tsx` for:

- a file-picking status
- preflight summary
- a clear empty-state/error when no supported files remain after preflight

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-ingestion-flow.spec.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/ipc/agentIpc.ts src/main/services/agents/ingestionAgentService.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx tests/e2e/agent-console-ingestion-flow.spec.ts
git commit -m "feat: execute ingestion imports through agent console"
```

### Task 2: Expose Agent Memories and Policy Versions as First-Class Runtime State

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentPersistenceService.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `tests/unit/shared/agentRuntimeContracts.test.ts`
- Modify: `tests/unit/main/agentPersistenceService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`

**Step 1: Write the failing observability tests**

Add tests that prove:

- policy versions can be listed, filtered, and returned in reverse chronological order
- the IPC/preload/archive API exposes `listAgentPolicyVersions(...)`
- `Agent Console` can render memory records and policy versions for the selected role or run target

Use expectations shaped like:

```ts
expect(policyVersions[0]?.policyKey).toBe('governance.review.policy')
expect(screen.getByText('Operational memory')).toBeInTheDocument()
expect(screen.getByText('Policy history')).toBeInTheDocument()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: FAIL because policy-version listing is not available in the runtime or renderer yet.

**Step 3: Add policy-version read support to the runtime contracts and persistence layer**

In `src/shared/archiveContracts.ts`, add:

```ts
export type ListAgentPolicyVersionsInput = {
  role?: AgentRole
  policyKey?: string
}
```

Extend `ArchiveApi` with:

```ts
listAgentPolicyVersions: (
  input?: ListAgentPolicyVersionsInput
) => Promise<AgentPolicyVersionRecord[]>
```

In `src/main/services/agentPersistenceService.ts`, add:

```ts
listAgentPolicyVersions(db, input = {})
```

Sort newest-first and support filtering by `role` and `policyKey`.

**Step 4: Carry the new read model through runtime, IPC, preload, and renderer API**

Update:

- `src/main/services/agentRuntimeService.ts`
- `src/main/ipc/agentIpc.ts`
- `src/preload/index.ts`
- `src/renderer/archiveApi.ts`
- `src/shared/ipcSchemas.ts`

to expose `archive:listAgentPolicyVersions` alongside the existing memory listing call.

Keep memory and policy reads side-effect-free. This task is only about observability, not policy activation.

**Step 5: Render operational state in `Agent Console`**

Update `src/renderer/pages/AgentConsolePage.tsx` so the detail area includes a compact operational-state section:

- `Operational memory`
- `Policy history`

Recommended behavior:

- if a run is selected, default to the run’s `targetRole ?? role`
- if no run is selected, use the current role override
- load both lists in parallel
- show a friendly empty state for roles with no records

Do not bury this behind a separate navigation page yet. Keep it inline with the existing console detail surface.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentPersistenceService.ts src/main/services/agentRuntimeService.ts src/main/ipc/agentIpc.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
git commit -m "feat: surface agent memories and policy history"
```

### Task 3: Add Previewable Execution Plans and Stronger Intent Routing

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/services/agentOrchestratorService.ts`
- Modify: `src/main/services/agentRuntimeService.ts`
- Modify: `src/main/ipc/agentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/AgentConsolePage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Create: `tests/unit/main/agentOrchestratorService.test.ts`
- Modify: `tests/unit/main/agentRuntimeService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/agentConsolePage.test.tsx`

**Step 1: Write the failing plan-preview tests**

Add tests that prove:

- the runtime can preview the inferred task kind, target role, and assigned roles without executing the task
- previews expose whether confirmation will be required
- `Agent Console` renders the preview before the operator clicks `Run agent task`
- routing remains narrow and predictable for review, ingestion, workspace, and governance prompts

Use expectations shaped like:

```ts
expect(preview).toEqual({
  taskKind: 'review.apply_item_decision',
  targetRole: 'review',
  assignedRoles: ['orchestrator', 'review'],
  requiresConfirmation: true
})

expect(screen.getByText('Execution preview')).toBeInTheDocument()
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/agentOrchestratorService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: FAIL because the runtime has no preview API and the renderer cannot surface planned execution yet.

**Step 3: Add a preview result contract and runtime entry point**

In `src/shared/archiveContracts.ts`, add a shape like:

```ts
export type AgentExecutionPreview = {
  taskKind: AgentTaskKind
  targetRole: AgentRole
  assignedRoles: AgentRole[]
  requiresConfirmation: boolean
}
```

Extend `ArchiveApi` with:

```ts
previewAgentTask: (input: RunAgentTaskInput) => Promise<AgentExecutionPreview>
```

In `src/main/services/agentRuntimeService.ts`, add:

```ts
previewTask(input: RunAgentTaskInput): AgentExecutionPreview
```

This preview must be side-effect-free and must not create a persisted run row.

**Step 4: Refactor orchestrator planning into previewable logic**

Update `src/main/services/agentOrchestratorService.ts` so:

- the logic that infers `taskKind`, `targetRole`, and `assignedRoles` is reusable for both preview and execution
- confirmation requirements are exposed as data instead of only as thrown errors
- routing remains deterministic and keyword-bounded

Do not add model-backed planning in this phase. Make the current heuristic layer visible and auditable first.

**Step 5: Render live execution preview in `Agent Console`**

Update `src/renderer/pages/AgentConsolePage.tsx` so:

- prompt/role changes trigger `previewAgentTask(...)`
- the page shows inferred `taskKind`, `targetRole`, and `assignedRoles`
- destructive actions are marked before execution
- preview failures are rendered as lightweight validation/help text, not fatal page errors

Prefer a simple inline card over a separate modal.

**Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/agentOrchestratorService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts src/main/services/agentOrchestratorService.ts src/main/services/agentRuntimeService.ts src/main/ipc/agentIpc.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/pages/AgentConsolePage.tsx src/renderer/i18n.tsx tests/unit/main/agentOrchestratorService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
git commit -m "feat: add previewable agent execution plans"
```

### Task 4: Harden the Operator Flow With End-to-End Coverage and a Release Checklist

**Files:**
- Modify: `tests/e2e/agent-console-flow.spec.ts`
- Modify: `tests/e2e/agent-console-replay-and-review-item-flow.spec.ts`
- Create: `docs/release/agent-runtime-phase-three-checklist.md`

**Step 1: Write the failing operator-acceptance assertions**

Extend or add e2e coverage so the release path proves:

1. an operator opens `Agent Console`
2. sees an execution preview before submit
3. runs a real ingestion import from the console
4. sees replay metadata after completion
5. can inspect operational memory/policy state for governance or selected runs
6. destructive review actions are still confirmation-gated

**Step 2: Run the targeted e2e flows to verify gaps**

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts
```

Expected: at least one FAIL until the preview and observability flows are wired through the renderer.

**Step 3: Write the release checklist**

Create `docs/release/agent-runtime-phase-three-checklist.md` with sections for:

- import execution
- review safety
- workspace links
- governance observability
- replay durability
- regression commands

Include exact verification commands:

```bash
npm run test:unit -- tests/unit/main/agentRuntimeService.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/agentConsolePage.test.tsx
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts
```

**Step 4: Run the full targeted verification set**

Run:

```bash
npm run test:unit -- tests/unit/main/agentOrchestratorService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
```

Run:

```bash
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts docs/release/agent-runtime-phase-three-checklist.md
git commit -m "docs: finalize agent runtime phase three rollout"
```

## Recommended Delivery Order

1. Execute Task 1 first. It closes the most visible functional gap and turns `ingestion` from a stub into a real operator path.
2. Execute Task 2 next. Once import works, operators need visibility into agent memory/policy state to trust governance behavior.
3. Execute Task 3 after observability lands. Previewable planning makes the heuristic runtime auditable without overcommitting to a bigger planner rewrite.
4. Execute Task 4 last as the ship gate.

## Definition of Done

- `ingestion.import_batch` creates real import batches through the existing services
- `Agent Console` can preview planned execution before submit
- `Agent Console` shows operational memories and policy history inline
- destructive review actions remain confirmation-gated
- replay/history still works across relaunch
- targeted unit and e2e suites pass
- release checklist exists in `docs/release/agent-runtime-phase-three-checklist.md`
