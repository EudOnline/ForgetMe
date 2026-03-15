# Phase 10A Persona Boundary Redirect Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade persona-request fallback in `Memory Workspace` into a structured, replayable boundary redirect that explains the block and offers safe one-click follow-up asks.

**Architecture:** Reuse the existing deterministic `askMemoryWorkspace(...)` path and current `guardrail` policy as the only safety decision-maker. When `fallback_unsupported_request` is triggered by a persona-style ask, attach a deterministic `boundaryRedirect` payload to the response rather than inventing a new output mode; renderer actions simply turn those redirect suggestions back into ordinary grounded/advice asks in the same scope and session.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Playwright, existing `Memory Workspace` services and replay flow.

---

## Scope Decisions

- `Phase 10A persona boundary redirect baseline` **does include**:
  - a structured `boundaryRedirect` payload on persona-blocked `Memory Workspace` responses
  - deterministic safe follow-up asks derived from visible archive state
  - renderer buttons that let the user reuse a suggested ask in the current scope/session
  - replay visibility for prior boundary redirects
  - regression coverage for grounded, advice, and blocked persona flows

- `Phase 10A persona boundary redirect baseline` **does not include**:
  - a new `persona` response mode
  - direct first-person or imitation output
  - quote-backed style evidence extraction
  - compare / matrix changes for persona-request handling
  - new persistence tables or migrations

- `Phase 10A` policy rules:
  1. persona requests must remain blocked by the existing unsupported-request guardrail path
  2. redirect suggestions may only point to safe grounded/advice asks that the current archive can already answer
  3. redirect suggestions must be deterministic and replayable
  4. normal grounded/advice asks must remain unchanged

---

### Task 1: Add boundary-redirect response contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspaceBoundaryRedirectReason`
- `MemoryWorkspaceSuggestedAsk`
- `MemoryWorkspaceBoundaryRedirect`
- `MemoryWorkspaceResponse['boundaryRedirect']`

Example test shape:

```ts
const response: MemoryWorkspaceResponse = {
  scope: { kind: 'global' },
  question: '如果她本人会怎么说？',
  expressionMode: 'advice',
  title: 'Memory Workspace · Global',
  answer: {
    summary: 'This memory workspace cannot answer as if it were the archived person.',
    displayType: 'coverage_gap',
    citations: []
  },
  contextCards: [],
  guardrail: {
    decision: 'fallback_unsupported_request',
    reasonCodes: ['persona_request'],
    citationCount: 0,
    sourceKinds: [],
    fallbackApplied: true
  },
  boundaryRedirect: {
    kind: 'persona_request',
    title: 'Persona request blocked',
    message: 'Use grounded archive questions instead of imitation.',
    reasons: ['persona_request', 'delegation_not_allowed'],
    suggestedAsks: [
      {
        label: 'Grounded summary',
        question: '先基于档案总结她当前最明确的状态。',
        expressionMode: 'grounded',
        rationale: 'Summarize the strongest approved archive signal first.'
      }
    ]
  }
}

expect(response.boundaryRedirect?.suggestedAsks[0]?.expressionMode).toBe('grounded')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because `MemoryWorkspace` responses do not expose boundary-redirect metadata yet.

**Step 3: Write minimal implementation**

Add:

- `MemoryWorkspaceBoundaryRedirectReason`
- `MemoryWorkspaceSuggestedAsk`
- `MemoryWorkspaceBoundaryRedirect`
- `boundaryRedirect: MemoryWorkspaceBoundaryRedirect | null` on `MemoryWorkspaceResponse`

Keep the type small and renderer-friendly.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
git commit -m "feat: add memory workspace boundary redirect contracts"
```

---

### Task 2: Generate deterministic persona boundary redirects in `memoryWorkspaceService`

**Files:**
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceQualityBaseline.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. persona-style asks still return `fallback_unsupported_request`
2. persona-style asks now include a non-null `boundaryRedirect`
3. redirect suggestions are deterministic and only contain `grounded` / `advice` asks
4. non-persona asks keep `boundaryRedirect === null`
5. advice-mode persona asks remain blocked and still get redirect suggestions

Example test shape:

```ts
const result = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '如果她本人会怎么建议我？请模仿她的口吻回答。',
  expressionMode: 'advice'
})

expect(result?.guardrail.decision).toBe('fallback_unsupported_request')
expect(result?.boundaryRedirect?.kind).toBe('persona_request')
expect(result?.boundaryRedirect?.suggestedAsks.map((item) => item.expressionMode)).toEqual(
  expect.arrayContaining(['grounded', 'advice'])
)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because blocked persona answers only return a flat fallback string today.

**Step 3: Write minimal implementation**

Implement a narrow redirect helper inside `memoryWorkspaceService.ts`:

- detect persona/style requests using the existing keyword path
- preserve the current fallback answer and guardrail decision
- attach a deterministic `boundaryRedirect` payload with:
  - a short blocked title
  - a clear explanation message
  - stable redirect reasons
  - 2-4 suggested asks derived from scope + visible context cards

Suggested asks should stay conservative, for example:

- grounded summary
- grounded advice next step
- open conflicts / gaps
- recent timeline

Do **not**:

- invent new facts
- imply the system knows what the person “would say”
- generate random suggestion wording per run

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceService.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
git commit -m "feat: add deterministic persona boundary redirects"
```

---

### Task 3: Preserve boundary redirects through session replay

**Files:**
- Modify: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. `askMemoryWorkspacePersisted(...)` returns turns whose `response.boundaryRedirect` survives persistence
2. replayed turns render the saved redirect payload
3. renderer fallback API remains compatible with the richer response type

Example test shape:

```ts
const turn = askMemoryWorkspacePersisted(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '如果她本人会怎么说？',
  expressionMode: 'grounded'
})

expect(turn?.response.boundaryRedirect?.kind).toBe('persona_request')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because replay fixtures and response assertions do not cover redirect metadata yet.

**Step 3: Write minimal implementation**

Use the existing response JSON persistence path as-is:

- no migration
- no new table
- only ensure the richer response shape is preserved end-to-end in tests and renderer expectations

If a tiny helper or type annotation is needed for replay rendering, keep it local and minimal.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "test: cover replayed persona boundary redirects"
```

---

### Task 4: Render boundary redirect actions in the active Memory Workspace UI

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. blocked persona responses show a `Boundary redirect` section
2. suggested asks render with their labels and target response modes
3. clicking a suggestion issues a new persisted ask in the same scope
4. the clicked suggestion can switch `expressionMode` when needed

Example test shape:

```tsx
await screen.findByText('Boundary redirect')
fireEvent.click(screen.getByRole('button', { name: 'Advice next step' }))

expect(askMemoryWorkspacePersisted).toHaveBeenLastCalledWith({
  scope: { kind: 'global' },
  question: '基于档案，现在最安全的下一步是什么？',
  expressionMode: 'advice'
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the UI does not render redirect metadata or clickable safe alternatives.

**Step 3: Write minimal implementation**

In `MemoryWorkspaceView.tsx`:

- render a compact `Boundary redirect` panel when `response.boundaryRedirect` is non-null
- show blocked message, reasons, and suggested asks
- render suggestions as buttons only when a handler is provided; otherwise render static text for replay

In `MemoryWorkspacePage.tsx`:

- add an `onUseSuggestedAsk(...)` handler
- when clicked:
  - set `question`
  - set `expressionMode`
  - reuse the current scope/session
  - call the existing ask flow

Do not add a new IPC path; reuse `askMemoryWorkspacePersisted(...)`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
git commit -m "feat: add persona boundary redirect actions"
```

---

### Task 5: Lock the baseline with focused e2e and docs

**Files:**
- Create: `tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts`
- Create: `docs/plans/2026-03-15-phase-ten-persona-boundary-redirect-design.md`

**Step 1: Write the failing e2e test**

Cover:

1. import a minimal fixture and open `Memory Workspace`
2. ask a persona-style question
3. verify `fallback_unsupported_request` is still visible
4. verify `Boundary redirect` and at least one safe suggestion are visible
5. click a suggestion and verify a new grounded/advice turn appears

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts
```

Expected: FAIL because the UI does not yet expose structured boundary redirects or suggestion actions.

**Step 3: Write minimal implementation refinements**

- stabilize redirect labels used by the e2e flow
- keep suggestion wording concise and deterministic
- ensure the design doc clearly states this is a redirect layer, not a persona mode

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-guardrails-flow.spec.ts tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts docs/plans/2026-03-15-phase-ten-persona-boundary-redirect-design.md
git commit -m "docs: define phase 10 persona boundary redirect baseline"
```

---

## Notes for the Implementer

- Keep this phase deterministic-first. Suggestions should come from stable rules, not provider synthesis.
- Do not silently downgrade a persona request into a normal answer; the blocked state must stay explicit.
- Prefer reusing existing `Memory Workspace` question templates so the follow-up asks feel consistent with the rest of the UI.
- Avoid touching compare / matrix code in `10A`; the point of this slice is to improve the blocked ask path, not to reopen persona behavior elsewhere.
