# Phase 9A Advice Mode Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a safe `Advice Mode` to `Memory Workspace` so users can ask for grounded next-step guidance that stays explicitly constrained by approved archive evidence, conflict state, and coverage gaps.

**Architecture:** Extend the existing `Memory Workspace` request/response contracts with a lightweight `expressionMode` field, reusing the current deterministic context assembly and guardrail pipeline instead of introducing a new truth source. Implement `advice` as a conservative presentation mode on top of the same dossier/portrait/context-card reads: when evidence is strong it reframes the answer into grounded guidance, and when evidence is conflicting, sparse, or persona-seeking it degrades back into the existing guardrail fallbacks. Persist the mode through conversation replay so later Phase 9 slices can build on the same session/audit foundation.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Playwright, existing `Memory Workspace` services and replay flow.

---

## Scope Decisions

- `Phase 9A advice mode baseline` **does include**:
  - a public `expressionMode: 'grounded' | 'advice'` input on `Memory Workspace`
  - deterministic, evidence-grounded advice phrasing for global / person / group asks
  - visible mode labeling in active responses and replayed turns
  - regression coverage for strong-evidence advice, conflict advice, low-coverage advice, and persona-like advice requests
  - zero write-back into truth tables, dossiers, portraits, or context packs

- `Phase 9A advice mode baseline` **does not include**:
  - “answer as this person” or imitation / roleplay
  - style transfer, tone cloning, or voice synthesis
  - remote provider synthesis as the default answer path
  - compare-mode support for expression-mode tournaments
  - long-term persona memory extraction or automatic fact promotion

- `Advice Mode` should follow these policy rules:
  1. it may say “based on the archive” / “the safest next step” but never “I am this person”
  2. it must preserve existing guardrail outcomes unchanged when conflicts or coverage gaps dominate
  3. it may only recommend next steps that are traceable to visible archive state (conflict groups, review pressure, timeline windows, approved facts)
  4. persona / style / “what would she say” asks still degrade to unsupported-request fallback, even in `advice` mode

---

### Task 1: Add expression-mode contracts and IPC validation

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspaceExpressionMode`
- `AskMemoryWorkspaceInput['expressionMode']`
- `AskMemoryWorkspacePersistedInput['expressionMode']`
- `MemoryWorkspaceResponse['expressionMode']`
- schema parsing for both `grounded` and `advice`

Example test shape:

```ts
expect(askMemoryWorkspaceInputSchema.parse({
  scope: { kind: 'global' },
  question: '现在最值得关注什么？',
  expressionMode: 'advice'
}).expressionMode).toBe('advice')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because `Memory Workspace` contracts do not expose a public expression mode yet.

**Step 3: Write minimal implementation**

Add:

- `MemoryWorkspaceExpressionMode = 'grounded' | 'advice'`
- optional input field defaulting to `grounded`
- response field echoing the resolved mode
- Zod validation for both ask APIs

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
git commit -m "feat: add memory workspace expression mode contracts"
```

---

### Task 2: Implement deterministic advice-mode synthesis in `memoryWorkspaceService`

**Files:**
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceQualityBaseline.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. `expressionMode: 'advice'` on a grounded person/global ask returns an advice-shaped summary while keeping citations and guardrail state
2. conflict-heavy asks in advice mode still return `fallback_to_conflict`
3. low-evidence asks in advice mode still return `fallback_insufficient_evidence`
4. persona-style asks in advice mode still return `fallback_unsupported_request`
5. grounded mode remains unchanged for the same question

Example test shape:

```ts
const result = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '我下一步最应该关注什么？',
  expressionMode: 'advice'
})

expect(result?.expressionMode).toBe('advice')
expect(result?.guardrail.decision).toBe('grounded_answer')
expect(result?.answer.summary).toContain('safest next step')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because the service only returns grounded-summary phrasing today.

**Step 3: Write minimal implementation**

Implement a narrow advice pipeline inside `memoryWorkspaceService.ts`:

- resolve `expressionMode` before answer generation
- keep current deterministic card selection / guardrail calculation as the source of truth
- when mode is `advice` and guardrails allow it, transform the selected grounded card into advice phrasing such as:
  - what the archive most strongly suggests
  - what the safest next focus is
  - what remains uncertain
- do **not** invent recommendations beyond visible archive reads
- if guardrail result is fallback-like, keep fallback semantics primary and only lightly rephrase if still honest

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceService.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
git commit -m "feat: add grounded advice mode synthesis"
```

---

### Task 3: Thread advice mode through persisted sessions and replay

**Files:**
- Modify: `src/main/services/memoryWorkspaceSessionService.ts`
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing tests**

Cover:

1. persisted turns keep `response.expressionMode`
2. `askMemoryWorkspacePersisted(...)` forwards `expressionMode` into the service
3. archive API typing and renderer bridge accept the new field without regressions

Example test shape:

```ts
const turn = askMemoryWorkspacePersisted(db, {
  scope: { kind: 'global' },
  question: '现在该先处理什么？',
  expressionMode: 'advice'
})

expect(turn.response.expressionMode).toBe('advice')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because persisted asks and renderer API do not yet cover advice mode.

**Step 3: Write minimal implementation**

Thread the field end-to-end while reusing existing response JSON persistence so no migration is needed.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/memoryWorkspaceSessionService.ts src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: persist memory workspace advice mode"
```

---

### Task 4: Add `Advice Mode` controls and replay labeling in the renderer

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspaceReplayPage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. the ask form exposes a mode selector / toggle with `Grounded` and `Advice`
2. running an ask in advice mode forwards `expressionMode: 'advice'`
3. active response rendering shows the current mode label
4. replayed turns show which mode produced that answer

Example test shape:

```tsx
fireEvent.change(screen.getByLabelText('Response mode'), {
  target: { value: 'advice' }
})
fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith(expect.objectContaining({
  expressionMode: 'advice'
}))
expect(await screen.findByText('Mode: advice')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the renderer does not yet expose or display expression mode.

**Step 3: Write minimal implementation**

Add:

- a compact `Response mode` control near the ask form
- pass-through into ask calls
- visible mode text in active response sections and replayed turns
- keep compare controls untouched in `9A`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspaceReplayPage.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: add advice mode controls and replay labels"
```

---

### Task 5: Lock the baseline with end-to-end advice-mode coverage and docs

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Create: `docs/plans/2026-03-15-phase-nine-advice-mode-design.md`
- Create: `tests/e2e/memory-workspace-advice-mode-flow.spec.ts`

**Step 1: Write the failing e2e test**

Cover at least this user path:

1. open `Memory Workspace`
2. switch to `Advice` mode
3. ask a priority/conflict-style question
4. verify the UI shows `Mode: advice`
5. verify fallback / conflict language remains visible rather than persona imitation

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-advice-mode-flow.spec.ts
```

Expected: FAIL because the UI does not yet expose advice mode.

**Step 3: Write minimal implementation refinements**

- document the `Phase 9A` non-goals and safety boundary in a dedicated design note
- update the Phase 8 design doc to point to `Phase 9A` as the first expression-mode slice
- stabilize labels used by the e2e flow

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-guardrails-flow.spec.ts tests/e2e/memory-workspace-advice-mode-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md docs/plans/2026-03-15-phase-nine-advice-mode-design.md tests/e2e/memory-workspace-advice-mode-flow.spec.ts
git commit -m "docs: define phase 9 advice mode baseline"
```

---

## Notes for the Implementer

- Prefer reusing `pickAnswerCard(...)`, `buildGuardrail(...)`, and existing dossier/portrait-derived cards over adding a second retrieval pipeline.
- Do not introduce any DB migration in `9A` unless replay truly cannot infer the mode from stored response JSON.
- Keep `Advice Mode` deterministic-first; provider/model compare for advice can be a later slice once the baseline is stable.
- If a proposed advice string sounds like direct impersonation, rewrite it until it clearly reads as archive-grounded guidance rather than first-person persona output.
