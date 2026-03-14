# Phase 8D Grounded Answer Quality & Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-pass quality and guardrail layer to `Memory Workspace` so grounded answers expose why they are safe, degrade clearly when evidence is insufficient or persona imitation is requested, and stay locked by regression coverage.

**Architecture:** Extend the existing deterministic `memoryWorkspaceService` with an explicit guardrail evaluation step that annotates each response, then render that guardrail summary in the `Memory Workspace` UI. Keep this slice local-only and deterministic: quality baselines live as regression fixtures/tests rather than a remote evaluation runner, and provider/model comparison stays metadata-ready rather than full orchestration.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Playwright, existing SQLite-backed read models.

---

## Scope Decisions

- `8D` **does include in this baseline slice**:
  - explicit `Memory Workspace` guardrail metadata on every response
  - clear fallback behavior for:
    - unresolved-conflict-first answers
    - insufficient-evidence answers
    - persona / style / “answer as this person” requests
  - a deterministic quality baseline set for:
    - conflict question
    - low coverage question
    - multi-evidence synthesis question
    - persona imitation question
  - renderer visibility for guardrail state

- `8D` **does not include yet**:
  - remote provider execution
  - automated provider-vs-provider batch compare UI
  - scoring dashboards
  - subjective style/persona simulation

---

### Task 1: Add guardrail contracts and regression baseline fixture

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`
- Create: `tests/unit/main/memoryWorkspaceQualityBaseline.test.ts`

**Step 1: Write the failing tests**

Add contract coverage for:

- `MemoryWorkspaceGuardrailDecision`
- `MemoryWorkspaceGuardrailReasonCode`
- `MemoryWorkspaceGuardrail`
- `MemoryWorkspaceResponse['guardrail']`

Add quality baseline tests covering:

1. conflict questions surface `fallback_to_conflict`
2. low-evidence questions surface `fallback_insufficient_evidence`
3. multi-evidence synthesis questions surface `grounded_answer` with `multi_source_synthesis`
4. persona imitation questions surface `fallback_unsupported_request`

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because guardrail contracts and the new baseline behavior do not exist yet.

**Step 3: Write minimal implementation**

Add contract types:

```ts
type MemoryWorkspaceGuardrailDecision =
  | 'grounded_answer'
  | 'fallback_to_conflict'
  | 'fallback_insufficient_evidence'
  | 'fallback_unsupported_request'

type MemoryWorkspaceGuardrailReasonCode =
  | 'open_conflict_present'
  | 'coverage_gap_present'
  | 'insufficient_citations'
  | 'multi_source_synthesis'
  | 'persona_request'
  | 'review_pressure_present'

type MemoryWorkspaceGuardrail = {
  decision: MemoryWorkspaceGuardrailDecision
  reasonCodes: MemoryWorkspaceGuardrailReasonCode[]
  citationCount: number
  sourceKinds: Array<'person' | 'group' | 'file' | 'journal' | 'review'>
  fallbackApplied: boolean
}
```

Attach `guardrail` to `MemoryWorkspaceResponse`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

---

### Task 2: Implement guardrail policy and deterministic fallback behavior

**Files:**
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`

**Step 1: Write the failing tests**

Extend `tests/unit/main/memoryWorkspaceService.test.ts` with coverage for:

1. persona imitation questions do not answer “as the person”
2. insufficient-evidence questions return a quality fallback with guardrail metadata
3. multi-evidence questions retain grounded citations and expose `multi_source_synthesis`
4. conflict-oriented questions explicitly annotate conflict-first fallback

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because the service does not emit guardrail metadata or persona-request fallback.

**Step 3: Write minimal implementation**

Inside `memoryWorkspaceService.ts`:

- add persona/style/advice imitation keyword detection
- add a single `buildGuardrail(...)` helper that inspects:
  - selected answer card
  - response citations
  - display types across cards
  - the user question
- return:
  - conflict-first answer when ambiguity is the safe answer
  - explicit insufficient-evidence fallback when no grounded support exists
  - explicit unsupported-request fallback when the user asks for imitation/persona mode

Keep the answer deterministic and grounded:

- never fabricate new facts
- never silently ignore open conflicts
- never present “how this person would say it” as archive truth

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

---

### Task 3: Render guardrail details in Memory Workspace

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Add renderer coverage for:

1. active responses show a `Guardrails` section
2. guardrail decision and reason codes render for the latest turn
3. replayed sessions preserve and display the saved guardrail metadata

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because the UI does not render guardrail state.

**Step 3: Write minimal implementation**

Render a compact guardrail panel under each turn:

- decision
- fallback applied yes/no
- reason codes
- citation count

Do not add new navigation yet; this slice is display-only.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

---

### Task 4: Document the baseline and add focused e2e

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`
- Create: `tests/e2e/memory-workspace-guardrails-flow.spec.ts`

**Step 1: Write the failing e2e test**

Cover:

1. person conflict question shows guardrail metadata
2. persona imitation question degrades instead of answering in-character

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-guardrails-flow.spec.ts
```

Expected: FAIL because the guardrail UI and persona-request fallback do not exist yet.

**Step 3: Write minimal implementation refinements**

- stabilize rendered guardrail labels
- ensure the fallback text is user-readable and grounded
- update design doc with the implemented `8D` baseline boundary

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-guardrails-flow.spec.ts
```

Expected: PASS

---

## Final Verification Checklist

- every `Memory Workspace` response includes explicit guardrail metadata
- conflict / low-coverage / multi-source / persona-request cases are regression-covered
- persona/style requests degrade safely rather than pretending to be the person
- renderer replay still shows persisted quality state
- design docs describe the exact `8D` baseline boundary
