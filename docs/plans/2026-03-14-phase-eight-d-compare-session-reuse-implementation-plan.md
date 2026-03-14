# Phase 8D Compare Session Reuse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let `Memory Workspace` reuse the question and compare configuration from a selected saved compare session so users can quickly rerun or tweak previous compare experiments.

**Architecture:** Keep this slice renderer-local. When a compare session is selected and its runs are loaded, infer the compare form state from the saved session detail: question from the summary, target enablement/model overrides from the saved runs, and judge enablement/provider/model from the persisted judge snapshots. Expose an explicit button to apply the selected compare setup instead of auto-mutating the form on selection.

**Tech Stack:** TypeScript, React, Vitest, existing compare session list/detail flow.

---

### Task 1: Add a failing renderer test

**Files:**
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing test**

Cover:

1. selecting a saved compare session and clicking `Use selected compare setup` hydrates:
   - question
   - compare target toggles
   - remote target model overrides
   - judge enablement/provider/model
2. running compare after reuse forwards the restored configuration

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the page cannot yet reuse compare session configuration.

### Task 2: Implement compare session reuse

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`

**Step 1: Write minimal implementation**

Add:

- helpers that infer compare target controls from loaded compare runs
- helpers that infer judge controls from loaded compare runs
- a `Use selected compare setup` button near the compare form
- a handler that repopulates the current compare form from the selected compare session

Keep inference narrow and predictable:

- `Local baseline`, `SiliconFlow`, and `OpenRouter` map only to the existing fixed target slots
- judge is considered enabled when saved runs contain a non-skipped or provider/model-backed judge snapshot
- if a provider/model is missing from the saved session, fall back to the current default

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

### Task 3: Document the behavior

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Update docs**

Clarify that saved compare sessions can now repopulate the active compare form for reruns/tweaks without changing compare truth assembly.

### Task 4: Focused verification

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
```

Expected: PASS
