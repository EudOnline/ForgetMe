# Phase 8D Compare Target Preferences Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist `Memory Workspace` compare target control defaults in the renderer so users do not need to re-select compare targets and remote model overrides every time they revisit the page.

**Architecture:** Keep persistence renderer-local and lightweight by storing compare target control state in `localStorage`. Hydrate the compare-target fieldset from storage on first render and when scope changes, and write updates back whenever target enablement or remote model overrides change. Do not introduce a main-process settings service.

**Tech Stack:** TypeScript, React, localStorage, Vitest.

---

### Task 1: Add failing renderer persistence test

**Files:**
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing test**

Cover:

1. page reads saved compare target defaults from `localStorage`
2. changing target toggles / model overrides writes updated defaults back
3. changing scope reuses the stored compare target defaults

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because compare target controls are only held in component state.

### Task 2: Implement renderer-local compare target preference persistence

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`

**Step 1: Write minimal implementation**

Add:

- compare target storage key
- safe load/save helpers
- state initialization from storage
- scope-change reset behavior that reuses stored compare target defaults instead of hardcoded defaults

Reuse the existing compare-target control shape; do not add a second settings abstraction.

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

### Task 3: Document the persistence boundary

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Update docs**

Clarify that compare target selections and remote model overrides are currently renderer-local preferences, not synced app settings.

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
