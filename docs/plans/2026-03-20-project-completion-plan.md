# Project Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining high-leverage v1 roadmap by making `Memory Workspace` truly conversational inside a saved session, then hardening the repository so typecheck becomes a real release gate instead of an afterthought.

**Architecture:** Keep the current deterministic, archive-grounded answer pipeline. Add a thin session-aware continuity layer above it that folds recent prior turns into a transparent `Conversation Context` card for follow-up asks, rather than introducing opaque LLM chat memory. In parallel, normalize the TypeScript project layout so app code and node-side config code can be typechecked independently and included in the final verification path.

**Tech Stack:** Electron, React, TypeScript, SQLite (`node:sqlite`), Vitest, Playwright, existing `Memory Workspace` services / IPC / preload bridge.

---

## Assumptions

- Phase 10M hosted share links are already implemented, merged, and verified.
- `Memory Workspace` sessions already persist and replay immutable turns, but current answers are still generated as single-turn reads.
- Continuity must remain deterministic and archive-grounded; no free-form persona memory, no hidden chain-of-thought, no provider dependency.
- Project completion here means “feature-complete and verification-ready for v1 from the current repo state”, not “invent another unrelated phase”.

## Target Repository Changes

```text
docs/plans/2026-03-20-project-completion-plan.md
README.md
package.json
tsconfig.json
tsconfig.node.json
tsconfig.app.json
src/main/ipc/memoryWorkspaceIpc.ts
src/main/services/memoryWorkspaceService.ts
src/main/services/memoryWorkspaceSessionService.ts
src/preload/index.ts
src/renderer/archiveApi.ts
src/renderer/pages/MemoryWorkspacePage.tsx
src/shared/ipcSchemas.ts
tests/e2e/memory-workspace-flow.spec.ts
tests/unit/main/memoryWorkspaceIpc.test.ts
tests/unit/main/memoryWorkspaceService.test.ts
tests/unit/main/memoryWorkspaceSessionService.test.ts
tests/unit/preload/index.test.ts
tests/unit/renderer/archiveApi.test.ts
tests/unit/renderer/memoryWorkspacePage.test.tsx
```

## Scope Guardrails

In scope:

- follow-up continuity inside an existing saved `Memory Workspace` session
- replayable, user-visible conversation context in persisted turns
- deterministic heuristics for follow-up asks such as “那为什么”, “继续”, “展开说”, “具体一点”
- dedicated typecheck scripts and TS config cleanup for app vs node configs
- README verification updates for the new completion baseline

Out of scope:

- cross-session conversational memory
- provider-backed chat memory or summarization
- persona-sandbox continuity that tries to “stay in character” across turns
- release packaging / installer automation
- cloud sync, collaboration, or remote state

### Task 1: Normalize the TypeScript verification baseline

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `tsconfig.node.json`
- Create: `tsconfig.app.json`

**Step 1: Reproduce the current failure**

Run:

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: FAIL with `TS6305` because the root program currently mixes app sources with config-entry references.

**Step 2: Add failing verification commands to the repo surface**

Add scripts such as:

```json
{
  "typecheck:app": "tsc -p tsconfig.app.json --noEmit",
  "typecheck:node": "tsc -p tsconfig.node.json --noEmit",
  "test:typecheck": "npm run typecheck:app && npm run typecheck:node"
}
```

Do not hide failures behind `|| true`.

**Step 3: Split app and node TS programs**

Use:

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

and move the current app-facing compiler options into `tsconfig.app.json` so `src/` and `tests/` typecheck under the correct browser/app settings, while `tsconfig.node.json` handles `electron.vite.config.ts`, `playwright.config.ts`, and `vitest.config.ts` with node-appropriate module resolution.

**Step 4: Run typecheck to verify the new baseline**

Run:

```bash
npm run test:typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json tsconfig.app.json
git commit -m "build: normalize typecheck verification"
```

### Task 2: Add failing session-continuity tests before any implementation

**Files:**
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/e2e/memory-workspace-flow.spec.ts`

**Step 1: Add main-service failing tests**

Add unit coverage that proves:

- a persisted follow-up ask in the same session injects a `Conversation Context` card into the returned response
- the `Conversation Context` card references the immediately previous turn question and summary
- a new session or different scope does not inherit prior-turn context
- explicit follow-up wording prefers prior-turn context over generic summary selection when that is the only grounded way to answer “that / this / why / continue”

Concrete expectations should look like:

```ts
expect(turn.response.contextCards.map((card) => card.title)).toContain('Conversation Context')
expect(turn.response.contextCards.find((card) => card.title === 'Conversation Context')?.body).toContain('她现在有哪些还没解决的冲突？')
expect(turn.response.answer.summary).toContain('Based on the archive')
```

**Step 2: Add renderer failing tests**

Extend `MemoryWorkspacePage` tests so the page:

- shows `Continuing session` when asking into an existing session
- renders the replayed `Conversation Context` card for follow-up turns
- keeps `Turn 1` and `Turn 2` immutable while still allowing a third follow-up ask

**Step 3: Add e2e failing coverage**

Extend `tests/e2e/memory-workspace-flow.spec.ts` so the person-scoped path:

1. asks an initial question
2. asks a follow-up in the same workspace session such as `那为什么这个冲突最值得先处理？`
3. asserts the second turn shows `Conversation Context`
4. leaves and reopens the same session
5. asserts the replayed second turn still shows the `Conversation Context` card

**Step 4: Run targeted tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-flow.spec.ts
```

Expected: FAIL because session continuity is not implemented yet.

### Task 3: Implement deterministic follow-up continuity in the main services

**Files:**
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `src/main/services/memoryWorkspaceSessionService.ts`

**Step 1: Add a small internal prior-turn context shape**

Inside the service layer, introduce something like:

```ts
type MemoryWorkspacePriorTurnContext = {
  turnId: string
  question: string
  answerSummary: string
  workflowKind: MemoryWorkspaceResponse['workflowKind']
  expressionMode: MemoryWorkspaceResponse['expressionMode']
  createdAt: string
}
```

Keep it internal unless a shared contract truly becomes necessary.

**Step 2: Build a transparent `Conversation Context` card**

Add helpers in `memoryWorkspaceService.ts` along the lines of:

```ts
function isFollowUpQuestion(question: string): boolean
function buildConversationContextCard(
  question: string,
  priorTurns: MemoryWorkspacePriorTurnContext[]
): MemoryWorkspaceContextCard | null
```

Rules:

- only use the most recent 1-3 prior turns
- only activate for explicit follow-up language
- do not synthesize new facts; only restate prior turn question/answer summaries
- do not override persona guardrails

**Step 3: Thread session history through `askMemoryWorkspacePersisted(...)`**

In `memoryWorkspaceSessionService.ts`:

- load prior turns for `sessionId` before generating the new answer
- pass condensed prior-turn context into `askMemoryWorkspace(...)`
- include prior-turn ids or summaries in the `promptHash` so continuity-affecting inputs are traceable
- keep persisted responses immutable after save

**Step 4: Update answer selection heuristics minimally**

Only when a `Conversation Context` card exists, allow follow-up asks to prefer that card before the generic summary / conflict / timeline card selection.

Do not change:

- quote-backed communication evidence routing
- persona request blocking
- provider compare flows
- replay semantics

**Step 5: Run targeted unit tests**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/memoryWorkspaceService.ts src/main/services/memoryWorkspaceSessionService.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts
git commit -m "feat: add memory workspace follow-up continuity"
```

### Task 4: Wire IPC, preload, archive API, and page UX for session continuity

**Files:**
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/main/memoryWorkspaceIpc.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Keep transport changes minimal**

Only add schema/API surface if implementation truly needs it. If session continuity can stay internal to `askMemoryWorkspacePersisted(...)`, do not widen the IPC contract gratuitously.

If a UX hint is needed, derive it in the renderer from existing session/turn state rather than introducing a new backend method.

**Step 2: Add session-status UI in `MemoryWorkspacePage`**

Render concise copy near the question form:

- `New session` when no saved session is selected
- `Continuing session · N previous turns` when asking inside an existing session

This must be purely informational; it should not alter replay-mode behavior.

**Step 3: Ensure replay still renders the persisted context card**

No recomputation during replay. The page should display the stored `Conversation Context` card from `turn.response.contextCards`.

**Step 4: Run targeted transport + renderer tests**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/ipcSchemas.ts src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: surface memory workspace session continuity"
```

### Task 5: Add end-to-end proof and update project status docs

**Files:**
- Modify: `tests/e2e/memory-workspace-flow.spec.ts`
- Modify: `README.md`

**Step 1: Finalize the e2e follow-up scenario**

The e2e should prove:

- first ask creates a saved session
- second ask in the same session shows `Conversation Context`
- reopening the session replays both turns unchanged
- switching scope does not leak prior context into another scope

**Step 2: Update README completion notes**

Document that `Memory Workspace` now supports:

- immutable saved-session replay
- deterministic multi-turn follow-up continuity inside the same session
- quote-backed, advice, persona-guardrail, publication, provider-send, and hosted-share flows under one archive-backed workspace

Also add:

```bash
npm run test:typecheck
```

to the verification block that represents the final completion baseline.

**Step 3: Run e2e and docs sanity verification**

Run:

```bash
npm run test:e2e -- tests/e2e/memory-workspace-flow.spec.ts
npm run test:typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add tests/e2e/memory-workspace-flow.spec.ts README.md
git commit -m "docs: finalize completion baseline"
```

### Task 6: Run the final completion verification suite

**Files:**
- All touched files

**Step 1: Run focused completion verification**

Run:

```bash
npm run test:typecheck
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run test:e2e -- tests/e2e/memory-workspace-flow.spec.ts
npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts tests/e2e/review-workbench-safe-batch-flow.spec.ts tests/e2e/memory-workspace-approved-draft-publication-flow.spec.ts tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts
npm run build
git diff --check
```

Expected:

- all targeted tests PASS
- typecheck PASS
- build PASS
- `git diff --check` reports no whitespace or conflict-marker issues

**Step 2: Review completion criteria**

Confirm before merging:

- `Memory Workspace` follow-up continuity is visible, deterministic, and replayable
- no scope leakage occurs between global / person / group sessions
- persona guardrails still block imitation requests
- project verification now includes a real typecheck step
- the message-native `Objective Workbench` is the active agent surface, with persisted proposal provenance, tool execution history, and subagent lineage
- final completion verification includes the dedicated objective runtime e2e slice instead of the removed agent-console flow

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete v1 conversation continuity"
```

### Post-Completion Addendum: Objective Runtime Baseline

As of 2026-03-31, the repository completion baseline also includes the shipped message-native objective runtime:

- `Objective Workbench` replaces the old run-centric agent surface
- facilitator-led deliberation, governed proposals, brokered external verification, and bounded subagents are persisted for replay
- operators can inspect proposal provenance, runtime tool execution history, and subagent lineage directly from the objective detail view

Runtime verification addendum:

```bash
npm run test:typecheck
npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx tests/unit/repo/objectiveRuntimeCleanup.test.ts
npm run test:e2e:objective
npm run build
```
