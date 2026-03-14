# Phase 8D Compare Target Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a renderer-side compare target control surface to `Memory Workspace` so users can choose which default compare targets run and override the two remote model names per compare execution.

**Architecture:** Keep the service-side compare runner unchanged because it already accepts optional `targets`. Add a compact renderer fieldset that models three fixed target slots (`Local baseline`, `SiliconFlow`, `OpenRouter`), only forwards a `targets` array when the user deviates from the default all-enabled preset, and blocks compare execution when no targets are selected.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing `Memory Workspace` compare flow.

---

### Task 1: Add failing renderer tests for compare target controls

**Files:**
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Add coverage for:

1. compare form renders target checkboxes for:
   - `Local baseline`
   - `SiliconFlow`
   - `OpenRouter`
2. default compare runs still omit `targets` so service defaults remain active
3. disabling one target forwards only the selected targets
4. changing a remote model override forwards the updated target model
5. `Run compare` is disabled when no compare target is selected

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the compare form does not expose target controls yet.

### Task 2: Implement compare target controls in the renderer

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`

**Step 1: Write minimal implementation**

Add:

- local renderer state for three fixed compare target slots
- helpers to:
  - build the selected `targets` payload
  - detect whether the current selection still matches the default preset
- compare form controls:
  - one checkbox per target
  - model override inputs for the two remote targets
- run-button guardrail for zero selected targets

Only include `targets` in `runMemoryWorkspaceCompare(...)` when the user has changed the preset selection or model overrides.

**Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

### Task 3: Document the compare target control boundary

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Update docs**

Clarify that compare UI now supports:

- including/excluding the default target slots per run
- per-run remote model overrides
- default service presets still remain the baseline when the renderer leaves `targets` unspecified

### Task 4: Extend focused compare-flow verification

**Files:**
- Modify: `tests/e2e/memory-workspace-compare-flow.spec.ts`

**Step 1: Write the failing e2e assertion**

Extend the compare flow to assert:

1. compare target controls render
2. disabling one remote target reduces the rendered compare runs

**Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: FAIL because the UI does not yet expose target controls.

**Step 3: Write minimal refinements**

- stabilize labels for the new target controls
- ensure compare results count matches the selected targets

### Task 5: Focused verification

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/e2e/memory-workspace-compare-flow.spec.ts`
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
npx playwright test tests/e2e/memory-workspace-compare-flow.spec.ts
```

Expected: PASS
