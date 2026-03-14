# Phase 8D Compare Judge Preferences Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist compare judge defaults in the renderer so users do not need to re-enable judge review and re-enter provider/model overrides every time they revisit `Memory Workspace`.

**Architecture:** Keep persistence renderer-local and lightweight by storing compare judge defaults in `localStorage`. Hydrate the `MemoryWorkspacePage` compare controls from storage on first render and when scope changes, and write updates back whenever judge settings change. Do not introduce a main-process settings service yet.

**Tech Stack:** TypeScript, React, localStorage, Vitest.

---

### Task 1: Add failing renderer persistence tests

**Files:**
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. page reads saved judge defaults from `localStorage`
2. changing judge controls writes updated defaults to `localStorage`
3. changing scope does not reset stored defaults

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because judge defaults are only held in component state.

### Task 2: Implement renderer-local preference persistence

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`

**Step 1: Write minimal implementation**

Add:

- compare judge storage key
- safe load/save helpers
- state initialization from storage
- scope-change reset behavior that reuses stored defaults instead of hardcoded defaults

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

### Task 3: Focused verification

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Document persistence boundary**

Clarify that compare judge defaults are currently renderer-local preferences, not synced app settings.

**Step 2: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
```

Expected: PASS
