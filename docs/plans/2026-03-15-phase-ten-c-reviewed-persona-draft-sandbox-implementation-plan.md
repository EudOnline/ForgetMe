# Phase 10C Reviewed Persona Draft Sandbox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a quote-backed reviewed persona draft sandbox so blocked persona requests can open an explicit simulation workflow with warning labels, direct quote trace, and compare / judge / replay audit support.

**Architecture:** Keep ordinary `Memory Workspace` asks on the existing `grounded | advice` path and preserve the current persona block as the primary safety boundary. Introduce a separate `workflowKind = persona_draft_sandbox` lane that can only run when quote-backed communication evidence exists, stores structured `personaDraft` metadata in the response JSON, and reuses the existing compare / judge / replay infrastructure with sandbox-aware prompts and rubric logic.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite migrations, LiteLLM model gateway, Vitest, Playwright, existing `Memory Workspace` services.

---

## Scope Decisions

- `Phase 10C reviewed persona draft sandbox` **does include**:
  - a new `persona_draft_sandbox` workflow kind for `Memory Workspace`
  - redirect actions that can open the sandbox when quote evidence exists
  - quote-backed simulation draft generation with explicit disclaimer + trace
  - replay rendering for saved sandbox turns
  - compare / judge support for sandbox drafts

- `Phase 10C reviewed persona draft sandbox` **does not include**:
  - a normal open-ended `persona` ask mode
  - long-running persona chat sessions
  - OCR / doc excerpt support beyond the current chat-first evidence layer
  - voice synthesis, TTS, or style cloning
  - automatic export/send/publish of drafts

- `Phase 10C` policy rules:
  1. ordinary persona requests must remain blocked on the default ask path
  2. sandbox runs must require direct communication evidence and show non-delegation labeling
  3. draft text is simulation, while excerpts remain the source of truth
  4. compare / judge / replay must preserve the sandbox workflow metadata

---

### Task 1: Add sandbox contracts and compare-session persistence metadata

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`
- Create: `src/main/services/migrations/014_memory_workspace_persona_draft_sandbox.sql`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspaceWorkflowKind`
- `MemoryWorkspaceSuggestedAction`
- `MemoryWorkspacePersonaDraft`
- `MemoryWorkspaceResponse['workflowKind']`
- `MemoryWorkspaceResponse['personaDraft']`
- `MemoryWorkspaceGuardrailDecision = 'sandbox_review_required'`

Example test shape:

```ts
const response: MemoryWorkspaceResponse = {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '如果她来写这段话，会怎么写？',
  expressionMode: 'grounded',
  workflowKind: 'persona_draft_sandbox',
  title: 'Memory Workspace · Alice Chen',
  answer: {
    summary: 'Reviewed simulation draft generated from archive-backed excerpts.',
    displayType: 'derived_summary',
    citations: []
  },
  contextCards: [],
  guardrail: {
    decision: 'sandbox_review_required',
    reasonCodes: ['persona_draft_sandbox', 'quote_trace_required'],
    citationCount: 2,
    sourceKinds: ['file'],
    fallbackApplied: false
  },
  boundaryRedirect: null,
  communicationEvidence: null,
  personaDraft: {
    title: 'Reviewed draft sandbox',
    disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
    draft: '也许我们先把这些记录整理好，再继续往下推进。',
    reviewState: 'review_required',
    supportingExcerpts: ['ce-1', 'ce-2'],
    trace: [
      {
        traceId: 'trace-1',
        excerptIds: ['ce-1'],
        explanation: 'Opening sentence is grounded in the archive quote about organizing the records first.'
      }
    ]
  }
}

expect(response.workflowKind).toBe('persona_draft_sandbox')
expect(response.personaDraft?.reviewState).toBe('review_required')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because `Memory Workspace` contracts do not expose sandbox workflow or persona-draft metadata yet.

**Step 3: Write minimal implementation**

Add:

- `MemoryWorkspaceWorkflowKind = 'default' | 'persona_draft_sandbox'`
- a richer `MemoryWorkspaceSuggestedAction` union:
  - `kind: 'ask'`
  - `kind: 'open_persona_draft_sandbox'`
- `MemoryWorkspacePersonaDraft`
- `workflowKind` and `personaDraft` on `MemoryWorkspaceResponse`
- `sandbox_review_required` plus the minimal new reason codes

Create migration `014` to add `workflow_kind` with default `'default'` on:

- `memory_workspace_compare_sessions`

Keep ask-turn persistence inside the existing response JSON path for v1.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts src/main/services/migrations/014_memory_workspace_persona_draft_sandbox.sql
git commit -m "feat: add persona draft sandbox contracts"
```

---

### Task 2: Add redirect actions and quote-backed sandbox draft generation

**Files:**
- Create: `src/main/services/memoryWorkspacePersonaDraftService.ts`
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `src/main/services/modelGatewayService.ts`
- Modify: `tests/unit/main/helpers/memoryWorkspaceScenario.ts`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceQualityBaseline.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. persona-blocked responses expose `suggestedActions`, and quote-backed scopes include `open_persona_draft_sandbox`
2. `workflowKind = persona_draft_sandbox` returns a non-null `personaDraft` when enough excerpts exist
3. sandbox runs set `guardrail.decision = 'sandbox_review_required'`
4. sandbox runs without enough direct excerpts return no draft and keep the safe fallback path
5. normal grounded / advice asks still return `workflowKind = 'default'` and `personaDraft === null`

Example test shape:

```ts
const blocked = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '如果她本人来回我，会怎么说？',
  expressionMode: 'grounded'
})

expect(blocked?.boundaryRedirect?.suggestedActions.some((action) => action.kind === 'open_persona_draft_sandbox')).toBe(true)

const sandbox = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '如果她来写这段话，会怎么写？',
  expressionMode: 'grounded',
  workflowKind: 'persona_draft_sandbox'
})

expect(sandbox?.workflowKind).toBe('persona_draft_sandbox')
expect(sandbox?.guardrail.decision).toBe('sandbox_review_required')
expect(sandbox?.personaDraft?.draft).toContain('记录')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because `Memory Workspace` does not yet expose sandbox actions or generate reviewed drafts.

**Step 3: Write minimal implementation**

Implement a narrow `memoryWorkspacePersonaDraftService.ts` helper that:

- receives the current scope, question, and supporting communication excerpts
- requires at least 2 excerpts before attempting a draft
- builds a strict JSON-only sandbox prompt
- uses `modelGatewayService` on the `memory_dialogue` route
- supports a deterministic fixture mode for tests/e2e
- returns:
  - `draft`
  - `disclaimer`
  - `supportingExcerpts`
  - `trace`
  - `reviewState = review_required`

Then update `memoryWorkspaceService.ts` to:

- replace `suggestedAsks` with `suggestedActions`
- preserve the existing persona block on default requests
- add a new `workflowKind` input path
- run the sandbox draft helper only when:
  - `workflowKind === 'persona_draft_sandbox'`
  - quote-backed evidence exists
- keep ordinary grounded/advice behavior unchanged

Do **not**:

- silently downgrade sandbox requests into normal persona answers
- generate a draft without quote evidence
- remove the existing block from the default persona path

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspacePersonaDraftService.ts src/main/services/memoryWorkspaceService.ts src/main/services/modelGatewayService.ts tests/unit/main/helpers/memoryWorkspaceScenario.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
git commit -m "feat: add quote-backed persona draft sandbox generation"
```

---

### Task 3: Persist and render sandbox turns with redirect actions

**Files:**
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. persisted turns keep `workflowKind` and `personaDraft`
2. redirect UI renders `Reviewed draft sandbox` as a button distinct from normal ask actions
3. active and replayed responses render:
  - workflow label
  - disclaimer
  - draft body
  - trace items
4. clicking the sandbox redirect action runs a new turn in `persona_draft_sandbox`

Example test shape:

```ts
expect(screen.getByText('Workflow: persona draft sandbox')).toBeInTheDocument()
expect(screen.getByText('Simulation draft based on archived expressions.')).toBeInTheDocument()
expect(screen.getByLabelText('Persona Draft Trace')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because persistence fixtures, archive API typing, and renderer components do not yet handle sandbox actions or persona draft rendering.

**Step 3: Write minimal implementation**

Update the renderer to:

- show `Workflow: default` or `Workflow: persona draft sandbox`
- branch redirect actions by `action.kind`
- keep `ask` actions on the existing turn-submission path
- submit `open_persona_draft_sandbox` through `askMemoryWorkspacePersisted(...)` with `workflowKind = 'persona_draft_sandbox'`
- render a dedicated `Persona Draft Sandbox` section with:
  - warning text
  - draft body
  - review state
  - trace list

Reuse the current session/replay persistence path rather than inventing a new storage layer.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/archiveApi.ts src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: render replayable persona draft sandbox turns"
```

---

### Task 4: Extend compare and judge to audit sandbox drafts

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. compare sessions persist `workflowKind = 'persona_draft_sandbox'`
2. provider compare runs generate candidate persona drafts rather than plain summary rewrites
3. deterministic evaluation remains four-dimensional but uses sandbox-aware rationales
4. judge prompts classify sandbox drafts with the same `aligned | needs_review | not_grounded` outcomes
5. renderer labels sandbox compare sessions clearly and still shows recommendation provenance

Example test shape:

```ts
expect(compareSession.workflowKind).toBe('persona_draft_sandbox')
expect(compareRun.response?.personaDraft?.draft).toContain('归档')
expect(compareRun.evaluation.dimensions.find((d) => d.key === 'guardrail_alignment')?.rationale).toContain('simulation')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare runs currently rewrite answer summaries and do not understand sandbox workflow metadata.

**Step 3: Write minimal implementation**

Refactor `memoryWorkspaceCompareService.ts` so that:

- compare sessions read/write `workflowKind`
- default workflow behavior stays unchanged
- sandbox workflow uses the new persona-draft helper for provider runs
- local baseline run reuses the current saved sandbox response
- deterministic scoring keeps the same keys but changes rationale for sandbox runs:
  - `groundedness`: quote fidelity / unsupported claims
  - `traceability`: visible quote trace quality
  - `guardrail_alignment`: simulation labeling and non-delegation wording
  - `usefulness`: draft readability and editability
- judge prompts explicitly forbid rewarding unlabeled roleplay or unsupported certainty

Update the page so compare sections show the workflow label and keep the current recommendation UI.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceCompareService.ts src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add compare and judge audit for persona draft sandbox"
```

---

### Task 5: Add end-to-end coverage and document the new boundary

**Files:**
- Modify: `tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts`
- Create: `tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts`
- Modify: `docs/plans/2026-03-15-phase-ten-c-reviewed-persona-draft-sandbox-design.md`

**Step 1: Write the failing e2e assertions**

Cover at least two user journeys:

1. blocked persona request -> click `Reviewed draft sandbox` -> see disclaimer + trace
2. sandbox compare run with judge enabled -> see workflow label + judge verdict

**Step 2: Run tests to verify they fail**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts
```

Expected: FAIL because there is no sandbox action or sandbox UI yet.

**Step 3: Write minimal implementation refinements**

- stabilize labels for sandbox actions, warning copy, and trace panels
- document any final boundary wording decisions in the `10C` design doc
- keep fixture-mode generation deterministic for e2e

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts tests/e2e/memory-workspace-persona-draft-sandbox-flow.spec.ts docs/plans/2026-03-15-phase-ten-c-reviewed-persona-draft-sandbox-design.md
git commit -m "docs: define phase 10c reviewed persona draft sandbox baseline"
```

---

Plan complete and saved to `docs/plans/2026-03-15-phase-ten-c-reviewed-persona-draft-sandbox-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
