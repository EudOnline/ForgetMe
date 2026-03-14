# Phase 8B Conversation Persistence & Replay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist memory workspace conversations as replayable, scope-bound sessions so users can reopen earlier answers, inspect the exact grounded response snapshot that was shown at the time, and continue asking within the same session without mutating truth tables.

**Architecture:** Keep `askMemoryWorkspace(...)` as the pure deterministic read path from `8A`, and add a parallel persistence layer that records immutable session turns. The main process will own session creation, turn persistence, hashing, and replay reads; the renderer will fetch scope-filtered session lists, render replay history, and submit persisted asks through a dedicated API that returns the grounded answer plus the persisted session/turn metadata.

**Tech Stack:** Electron IPC, React renderer, TypeScript, SQLite migrations, Node `crypto`, Vitest, Playwright.

---

## Scope Decisions

- `8B` **does include**: persisted sessions, immutable turns, scope-filtered session browse, replay of exact saved response snapshots, continuing asks in the same session, opening session history from global / person / group scopes.
- `8B` **does not include**: multi-turn retrieval that changes answer synthesis, prompt/provider switching UI, editable turn history, deleting sessions, exporting context packs, writing answers back into truth tables.
- The persisted record is an **interaction log**, not a truth source. Replay must show the exact stored `MemoryWorkspaceResponse` snapshot and timestamps rather than re-running live synthesis.

---

### Task 1: Add shared session contracts and input schemas

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Create: `tests/unit/shared/phaseEightConversationContracts.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/shared/phaseEightConversationContracts.test.ts` covering:

```ts
type MemoryWorkspaceSessionSummary = {
  sessionId: string
  scope: MemoryWorkspaceScope
  title: string
  latestQuestion: string | null
  turnCount: number
  createdAt: string
  updatedAt: string
}

type MemoryWorkspaceTurnRecord = {
  turnId: string
  sessionId: string
  ordinal: number
  question: string
  response: MemoryWorkspaceResponse
  provider: string | null
  model: string | null
  contextHash: string
  promptHash: string
  createdAt: string
}

type MemoryWorkspaceSessionDetail = MemoryWorkspaceSessionSummary & {
  turns: MemoryWorkspaceTurnRecord[]
}

type AskMemoryWorkspacePersistedInput = {
  scope: MemoryWorkspaceScope
  question: string
  sessionId?: string
}
```

Also cover:

```ts
listMemoryWorkspaceSessions: (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceSessionSummary[]>
getMemoryWorkspaceSession: (sessionId: string) => Promise<MemoryWorkspaceSessionDetail | null>
askMemoryWorkspacePersisted: (input: AskMemoryWorkspacePersistedInput) => Promise<MemoryWorkspaceTurnRecord | null>
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: FAIL because the new contracts and schemas do not exist yet.

**Step 3: Write minimal implementation**

Add the new shared contracts plus Zod schemas:

- `memoryWorkspaceSessionFilterSchema`
- `memoryWorkspaceSessionIdSchema`
- `askMemoryWorkspacePersistedInputSchema`

Keep the public contract intentionally small:

- no delete/update APIs yet
- no pagination yet
- no provider config input yet

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/archiveContracts.ts src/shared/ipcSchemas.ts tests/unit/shared/phaseEightConversationContracts.test.ts
git commit -m "feat: add phase 8b memory session contracts"
```

---

### Task 2: Add migration and persistence service for immutable sessions and turns

**Files:**
- Create: `src/main/services/migrations/008_memory_workspace_sessions.sql`
- Create: `src/main/services/memoryWorkspaceSessionService.ts`
- Create: `tests/unit/main/memoryWorkspaceSessionService.test.ts`
- Reference: `src/main/services/memoryWorkspaceService.ts`

**Step 1: Write the failing test**

Create `tests/unit/main/memoryWorkspaceSessionService.test.ts` covering:

1. Creating the first persisted ask for a scope creates a new session and first turn.
2. Asking again with the returned `sessionId` appends `ordinal = 2` without mutating the first turn snapshot.
3. `listMemoryWorkspaceSessions(...)` returns the newest session first and respects scope filters.
4. `getMemoryWorkspaceSession(...)` returns replayable stored `response` snapshots.
5. Missing `sessionId` or mismatched scope returns `null` instead of cross-linking to the wrong session.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts
```

Expected: FAIL because the migration and persistence service do not exist yet.

**Step 3: Write minimal implementation**

Add migration tables:

```sql
create table if not exists memory_workspace_sessions (
  id text primary key,
  scope_kind text not null,
  scope_target_id text,
  title text not null,
  latest_question text,
  turn_count integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists memory_workspace_turns (
  id text primary key,
  session_id text not null,
  ordinal integer not null,
  question text not null,
  response_json text not null,
  provider text,
  model text,
  prompt_hash text not null,
  context_hash text not null,
  created_at text not null,
  foreign key(session_id) references memory_workspace_sessions(id)
);
```

Create service exports:

```ts
export function listMemoryWorkspaceSessions(db, input?)
export function getMemoryWorkspaceSession(db, input)
export function askMemoryWorkspacePersisted(db, input)
```

Implementation rules:

- Reuse `askMemoryWorkspace(...)` for deterministic response generation.
- Persist the full `MemoryWorkspaceResponse` snapshot as JSON.
- Use hashes derived from the persisted snapshot / input payload via `crypto.createHash('sha256')`.
- If `sessionId` is provided, verify the session scope matches the ask scope.
- Do not recompute replay responses when loading history; return stored snapshots.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceSessionService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/migrations/008_memory_workspace_sessions.sql src/main/services/memoryWorkspaceSessionService.ts tests/unit/main/memoryWorkspaceSessionService.test.ts
git commit -m "feat: persist memory workspace sessions"
```

---

### Task 3: Expose session persistence and replay through IPC and renderer API

**Files:**
- Modify: `src/main/ipc/memoryWorkspaceIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

Extend `tests/unit/renderer/archiveApi.test.ts` with:

```ts
await expect(archiveApi.listMemoryWorkspaceSessions()).resolves.toEqual([])
await expect(archiveApi.getMemoryWorkspaceSession('session-1')).resolves.toBeNull()
await expect(archiveApi.askMemoryWorkspacePersisted({
  scope: { kind: 'global' },
  question: '现在最值得关注什么？'
})).resolves.toBeNull()
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts
```

Expected: FAIL because the new fallback methods do not exist yet.

**Step 3: Write minimal implementation**

Add IPC handlers:

- `archive:listMemoryWorkspaceSessions`
- `archive:getMemoryWorkspaceSession`
- `archive:askMemoryWorkspacePersisted`

Parse payloads with the new schemas, open/close the DB around each call, and expose matching preload + renderer methods.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/archiveApi.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/shared/phaseEightConversationContracts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/memoryWorkspaceIpc.ts src/preload/index.ts src/renderer/archiveApi.ts tests/unit/renderer/archiveApi.test.ts
git commit -m "feat: expose memory workspace session api"
```

---

### Task 4: Add session list, replay, and continue-asking UI in Memory Workspace

**Files:**
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Create: `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Write the failing test**

Create `tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx` covering:

1. Scope load fetches matching sessions and shows the newest summary first.
2. Selecting a session replays stored turns without re-asking.
3. Asking from an existing session appends a new turn and keeps earlier turns visible.
4. Clicking a replayed citation still routes to person/group/file/review targets.
5. Starting from a fresh scope with no sessions shows an empty replay state.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
```

Expected: FAIL because replay UI does not exist yet.

**Step 3: Write minimal implementation**

Renderer rules:

- Load `listMemoryWorkspaceSessions({ scope })` on scope changes.
- If sessions exist, select the newest one by default.
- Load session detail via `getMemoryWorkspaceSession(sessionId)`.
- Submit new asks through `askMemoryWorkspacePersisted(...)`.
- Keep replay read-only: old turns can be viewed but not edited.
- Add a `Start new session` button that clears the selected session before the next ask.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/MemoryWorkspaceView.tsx src/renderer/pages/MemoryWorkspacePage.tsx src/renderer/App.tsx tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx
git commit -m "feat: add memory workspace replay ui"
```

---

### Task 5: Add end-to-end coverage and update docs

**Files:**
- Modify: `tests/e2e/memory-workspace-flow.spec.ts`
- Modify: `tests/e2e/group-portrait-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Write the failing e2e test**

Extend the memory workspace flow to verify:

1. First ask creates a persisted session.
2. Reopening the same scope shows replay history.
3. Continuing the session appends another turn.
4. Replayed turns still show grounded citations.

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-flow.spec.ts
```

Expected: FAIL because replay persistence is not visible yet.

**Step 3: Write minimal implementation refinements**

- Stabilize replay labels and timestamps for tests.
- Keep session ordering deterministic (`updated_at desc`, `created_at desc`, `id asc`).
- Ensure scope filters do not leak sessions across person/group/global views.

**Step 4: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightConversationContracts.test.ts tests/unit/main/memoryWorkspaceSessionService.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/memoryWorkspaceReplayPage.test.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-flow.spec.ts tests/e2e/group-portrait-flow.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/memory-workspace-flow.spec.ts tests/e2e/group-portrait-flow.spec.ts docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md
git commit -m "feat: verify phase 8b memory replay"
```

---

## Implementation Notes

- Do **not** make `askMemoryWorkspace(...)` implicitly persist; keep it as the pure read path from `8A`.
- The first persisted API should call the pure ask path and then snapshot the returned response.
- Replayed sessions must survive later truth changes; they are historical interaction records.
- Multi-turn conversational context influencing future answers remains out of scope for `8B`.
- `provider` / `model` fields may be `null` in the deterministic baseline, but the columns should exist now so `8C/8D` can reuse them.

## Final Verification Checklist

- Global / person / group memory workspace views show persisted session history
- Reopening a session replays the exact stored answer snapshot
- Continuing a session appends immutable turns in order
- Scope filters only show matching sessions
- Replay citations remain clickable
- No truth tables are written by replay persistence
- `askMemoryWorkspace(...)` still works as the pure deterministic read path
