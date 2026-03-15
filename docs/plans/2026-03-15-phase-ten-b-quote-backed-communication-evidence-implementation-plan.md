# Phase 10B Quote-Backed Communication Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a chat-first communication-evidence layer so `Memory Workspace` can answer quote-oriented questions with direct archive-backed excerpts and use those excerpts as a safer follow-up path for persona-blocked requests.

**Architecture:** Introduce a dedicated local `communication_evidence` read model instead of overloading `file_derivatives`, and populate it during chat import after participant anchors are created. Reuse the existing deterministic `Memory Workspace` pipeline: quote-oriented asks select a new communication-evidence branch, return a grounded summary plus structured excerpts, and extend `boundaryRedirect` with a quote-backed follow-up when supporting evidence exists.

**Tech Stack:** TypeScript, SQLite migrations, Electron IPC, React, Vitest, Playwright, existing import/parser services and `Memory Workspace` replay flow.

---

## Scope Decisions

- `Phase 10B quote-backed communication evidence` **does include**:
  - a new local `communication_evidence` table populated from chat imports
  - chat-json and text-chat excerpt extraction
  - deterministic quote-oriented `Memory Workspace` answers for global/person/group scopes
  - structured excerpt rendering in active responses and replay
  - a new quote-backed redirect suggestion for blocked persona asks when evidence exists

- `Phase 10B quote-backed communication evidence` **does not include**:
  - document OCR excerpt ingestion
  - style clustering or tone synthesis
  - embedding retrieval
  - compare/judge-specific quote scoring
  - persona imitation or first-person outputs

- `Phase 10B` policy rules:
  1. quotes must be taken directly from imported local chat evidence, not synthesized
  2. quote asks may summarize the evidence, but they must show direct supporting excerpts beside the summary
  3. persona requests remain blocked; quote-backed asks are a safer redirect, not a loophole
  4. when relevant excerpts cannot be found, the system must fall back to `coverage_gap`

---

### Task 1: Add communication-evidence contracts and migration

**Files:**
- Create: `src/main/services/migrations/013_communication_evidence.sql`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`
- Modify: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing tests**

Add shared contract coverage for:

- `MemoryWorkspaceCommunicationExcerpt`
- `MemoryWorkspaceCommunicationEvidence`
- `MemoryWorkspaceResponse['communicationEvidence']`

Example test shape:

```ts
const response: MemoryWorkspaceResponse = {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '她过去是怎么表达这类事的？',
  expressionMode: 'grounded',
  title: 'Memory Workspace · Alice Chen',
  answer: {
    summary: 'Approved chat evidence includes direct expressions about keeping notes.',
    displayType: 'derived_summary',
    citations: []
  },
  contextCards: [],
  guardrail: {
    decision: 'grounded_answer',
    reasonCodes: ['multi_source_synthesis'],
    citationCount: 2,
    sourceKinds: ['file'],
    fallbackApplied: false
  },
  boundaryRedirect: null,
  communicationEvidence: {
    title: 'Communication Evidence',
    summary: 'Direct archive-backed excerpts related to this ask.',
    excerpts: [
      {
        excerptId: 'ce-1',
        fileId: 'f-1',
        fileName: 'chat-1.json',
        ordinal: 1,
        speakerDisplayName: 'Alice Chen',
        text: 'Let us keep personal notes for this archive.'
      }
    ]
  }
}

expect(response.communicationEvidence?.excerpts[0]?.speakerDisplayName).toBe('Alice Chen')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because `MemoryWorkspace` responses do not expose communication-evidence metadata yet.

**Step 3: Write minimal implementation**

Add:

- `MemoryWorkspaceCommunicationExcerpt`
- `MemoryWorkspaceCommunicationEvidence`
- `communicationEvidence: MemoryWorkspaceCommunicationEvidence | null` on `MemoryWorkspaceResponse`

Create migration `013` with a dedicated `communication_evidence` table and indexes on:

- `file_id`
- `speaker_anchor_person_id`
- `ordinal`

Suggested table shape:

```sql
create table communication_evidence (
  id text primary key,
  file_id text not null,
  ordinal integer not null,
  speaker_display_name text,
  speaker_anchor_person_id text,
  excerpt_text text not null,
  created_at text not null,
  foreign key(file_id) references vault_files(id),
  foreign key(speaker_anchor_person_id) references people(id)
);
```

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/013_communication_evidence.sql src/shared/archiveContracts.ts tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
git commit -m "feat: add communication evidence contracts and migration"
```

---

### Task 2: Persist chat excerpts during import

**Files:**
- Modify: `src/main/services/parsers/chatJsonParser.ts`
- Modify: `src/main/services/parsers/textChatParser.ts`
- Modify: `src/main/services/peopleService.ts`
- Modify: `src/main/services/importBatchService.ts`
- Modify: `tests/unit/main/parserRegistry.test.ts`
- Modify: `tests/unit/main/importBatchService.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. chat JSON parsing returns lightweight message excerpts with `ordinal`, `speakerDisplayName`, and `text`
2. text chat parsing returns lightweight excerpts with `ordinal` and `text`
3. importing a chat file persists one `communication_evidence` row per excerpt
4. known participant speakers are matched to the same-file people anchors when display names line up

Example test shape:

```ts
const parsed = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-chat.json'))

expect(parsed.summary.messageCount).toBeGreaterThan(0)
expect(parsed.summary.communicationExcerpts?.[0]).toMatchObject({
  ordinal: 1,
  speakerDisplayName: 'Alice',
  text: 'Hello Bob'
})
```

Import verification example:

```ts
const rows = db.prepare(`
  select speaker_display_name as speakerDisplayName,
         speaker_anchor_person_id as speakerAnchorPersonId,
         excerpt_text as excerptText
  from communication_evidence
  order by ordinal asc
`).all()

expect(rows[0]?.speakerDisplayName).toBe('Alice')
expect(rows[0]?.excerptText).toContain('Hello')
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/parserRegistry.test.ts tests/unit/main/importBatchService.test.ts
```

Expected: FAIL because parsers only return summary preview text and import does not persist excerpt rows yet.

**Step 3: Write minimal implementation**

Update the parsers so chat outputs include a lightweight `communicationExcerpts` array:

- `chatJsonParser.ts`
  - emit `{ ordinal, speakerDisplayName, text }[]`
- `textChatParser.ts`
  - emit `{ ordinal, speakerDisplayName: null, text }[]`

In `importBatchService.ts`:

- keep existing `parsed_summary` derivative behavior
- after anchors are persisted, derive speaker-to-anchor matches by `fileId + displayName`
- insert excerpt rows into `communication_evidence`

Keep the match rule deterministic:

- exact display-name match only
- if no exact match, leave `speaker_anchor_person_id` null

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/parserRegistry.test.ts tests/unit/main/importBatchService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/parsers/chatJsonParser.ts src/main/services/parsers/textChatParser.ts src/main/services/peopleService.ts src/main/services/importBatchService.ts tests/unit/main/parserRegistry.test.ts tests/unit/main/importBatchService.test.ts
git commit -m "feat: persist chat communication evidence"
```

---

### Task 3: Add communication-evidence reads and quote-aware `Memory Workspace` synthesis

**Files:**
- Create: `src/main/services/communicationEvidenceService.ts`
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `tests/unit/main/helpers/memoryWorkspaceScenario.ts`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/memoryWorkspaceQualityBaseline.test.ts`

**Step 1: Write the failing tests**

Cover at least these behaviors:

1. person quote asks return `communicationEvidence` excerpts tied to that person
2. global quote asks return excerpts across multiple chat files when relevant
3. quote asks with no relevant excerpts fall back to `coverage_gap`
4. persona requests remain `fallback_unsupported_request`
5. persona requests with communication evidence now expose a `Past expressions` redirect suggestion
6. ordinary summary/advice asks keep `communicationEvidence === null`

Example test shape:

```ts
const result = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '她过去是怎么表达记录和归档这类事的？',
  expressionMode: 'grounded'
})

expect(result?.guardrail.decision).toBe('grounded_answer')
expect(result?.communicationEvidence?.excerpts.length ?? 0).toBeGreaterThan(0)
expect(result?.communicationEvidence?.excerpts[0]?.speakerDisplayName).toBe('Alice Chen')
expect(result?.boundaryRedirect).toBeNull()
```

Persona redirect example:

```ts
const blocked = askMemoryWorkspace(db, {
  scope: { kind: 'person', canonicalPersonId: 'cp-1' },
  question: '请模仿她的口吻告诉我该怎么做。',
  expressionMode: 'advice'
})

expect(blocked?.guardrail.decision).toBe('fallback_unsupported_request')
expect(blocked?.boundaryRedirect?.suggestedAsks.some((item) => item.label === 'Past expressions')).toBe(true)
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: FAIL because `Memory Workspace` has no quote-oriented retrieval branch or communication-evidence response payload yet.

**Step 3: Write minimal implementation**

Create `communicationEvidenceService.ts` with deterministic readers such as:

- `listGlobalCommunicationEvidence(...)`
- `listPersonCommunicationEvidence(...)`
- `listGroupCommunicationEvidence(...)`

Query/filter rules:

- load candidate excerpts by scope
- remove blank excerpts
- score keyword overlap after stripping quote-intent keywords
- keep top 2-3 excerpts deterministically

In `memoryWorkspaceService.ts`:

- add communication / quote keywords such as:
  - `原话`
  - `quote`
  - `怎么表达`
  - `怎么说过`
  - `措辞`
- branch quote-oriented asks into a quote-backed answer builder
- attach `communicationEvidence`
- extend `boundaryRedirect` suggestion building so `Past expressions` appears when quote evidence exists

Do **not**:

- synthesize paraphrased “voice”
- add random ranking
- weaken the persona block

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/communicationEvidenceService.ts src/main/services/memoryWorkspaceService.ts tests/unit/main/helpers/memoryWorkspaceScenario.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts
git commit -m "feat: add quote-backed memory workspace evidence"
```

---

### Task 4: Preserve and render communication evidence in active responses and replay

**Files:**
- Modify: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. persisted turns keep `response.communicationEvidence`
2. active `Memory Workspace` responses render a `Communication Evidence` section with excerpts
3. replayed turns render the same excerpt evidence
4. quote-backed persona redirect follow-up remains clickable and opens a new ask result

Example renderer test shape:

```tsx
expect(await screen.findByText('Communication Evidence')).toBeInTheDocument()
expect(screen.getByText(/Alice Chen/)).toBeInTheDocument()
expect(screen.getByText(/keep personal notes/i)).toBeInTheDocument()
```

Replay test example:

```tsx
expect(screen.getByText('Communication Evidence')).toBeInTheDocument()
expect(screen.getByText('chat-1.json')).toBeInTheDocument()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because replay fixtures and renderer output do not include structured communication evidence yet.

**Step 3: Write minimal implementation**

Use the existing persisted response JSON path:

- no new replay table
- no new IPC method

In `MemoryWorkspaceView.tsx`:

- render a `Communication Evidence` section when `response.communicationEvidence` is non-null
- show excerpt speaker, text, and source file
- keep rendering simple and deterministic

For active responses, if `onOpenEvidenceFile` exists, render file names as buttons.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts src/renderer/components/MemoryWorkspaceView.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: render replayable communication evidence"
```

---

### Task 5: Lock the baseline with focused e2e and docs

**Files:**
- Create: `tests/e2e/memory-workspace-communication-evidence-flow.spec.ts`
- Create: `docs/plans/2026-03-15-phase-ten-b-quote-backed-communication-evidence-design.md`

**Step 1: Write the failing e2e test**

Cover:

1. import a minimal chat fixture with repeated speaker messages
2. open `Memory Workspace`
3. ask a quote-oriented question
4. verify `Communication Evidence` and direct excerpts are visible
5. ask a blocked persona question
6. verify `Past expressions` redirect action appears
7. click it and verify a quote-backed response is rendered

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-communication-evidence-flow.spec.ts
```

Expected: FAIL because the UI does not yet render quote-backed excerpts or the new redirect action.

**Step 3: Write minimal implementation refinements**

- stabilize quote labels used by the e2e flow
- keep excerpt count small and readable
- ensure quote-backed asks still read as archive evidence, not imitation

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/parserRegistry.test.ts tests/unit/main/importBatchService.test.ts tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/memoryWorkspaceQualityBaseline.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-guardrails-flow.spec.ts tests/e2e/memory-workspace-persona-boundary-redirect-flow.spec.ts tests/e2e/memory-workspace-communication-evidence-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-communication-evidence-flow.spec.ts docs/plans/2026-03-15-phase-ten-b-quote-backed-communication-evidence-design.md
git commit -m "docs: define phase 10b communication evidence baseline"
```

---

## Notes for the Implementer

- Keep `10B` chat-first. Do not widen to OCR/document excerpts unless the baseline is already stable.
- Prefer direct excerpts over clever paraphrases. The whole point is to show evidence, not style synthesis.
- If a quote-oriented ask turns up no relevant excerpt evidence, fail honestly with `coverage_gap`.
- Reuse the existing `boundaryRedirect` shape; only extend its deterministic suggestion set when communication evidence actually exists.
