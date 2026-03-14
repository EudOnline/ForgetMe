# Phase 8D Compare Judge Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-product control surface for compare judge execution so users can enable or disable judge review per compare run and override the provider/model without relying only on environment variables.

**Architecture:** Extend the compare run input contract with an optional `judge` block, validate it in IPC, and thread it into `runMemoryWorkspaceCompare(...)` as the public runtime configuration source. In the renderer, add a compact compare-options panel beside the existing question box with a judge toggle, provider selector, and optional model override field. Keep the scope local to `Memory Workspace` compare runs instead of building a new global settings system.

**Tech Stack:** TypeScript, Electron IPC, React, Zod, Vitest, existing compare runner service.

---

## Scope Decisions

- `compare judge controls` **does include**:
  - per-run judge enable toggle
  - per-run provider selection
  - optional per-run model override
  - IPC validation and service plumbing
  - focused renderer / shared / service tests

- `compare judge controls` **does not include yet**:
  - persistent app-wide settings storage
  - saved presets
  - secret management or API-key UI
  - compare target matrix editing

### Task 1: Extend compare input contracts

**Files:**
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/phaseEightContracts.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- optional `judge` block on `RunMemoryWorkspaceCompareInput`
- schema parsing for disabled judge
- schema parsing for enabled judge with provider/model override

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: FAIL because compare input does not accept public judge config yet.

**Step 3: Write minimal implementation**

Add a compact `judge` input type and schema:

- `enabled: boolean`
- `provider?: 'siliconflow' | 'openrouter'`
- `model?: string`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts
```

Expected: PASS

---

### Task 2: Use public judge input in compare service

**Files:**
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `tests/unit/main/memoryWorkspaceCompareService.test.ts`

**Step 1: Write the failing tests**

Cover:

1. `input.judge.enabled: true` enables judge execution without service-only test hooks
2. `input.judge.enabled: false` forces judge to be skipped even if env enables it
3. provider/model overrides from input reach the judge caller

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: FAIL because the service currently only consumes judge config from implementation options / env.

**Step 3: Write minimal implementation**

Prefer `input.judge` as the public runtime source, with test-only `options.judge` still available as an override seam.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/main/memoryWorkspaceCompareService.test.ts
```

Expected: PASS

---

### Task 3: Add compare judge controls to renderer

**Files:**
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`

**Step 1: Write the failing tests**

Cover:

1. compare form shows a judge toggle
2. enabling judge reveals provider + model inputs
3. running compare forwards the selected judge config
4. disabling judge omits or disables judge execution cleanly

**Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: FAIL because the compare form does not expose judge controls.

**Step 3: Write minimal implementation**

Add a compact compare-options fieldset with:

- `Enable judge review` checkbox
- provider select
- model override input

Only show provider/model fields when judge is enabled.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/renderer/memoryWorkspacePage.test.tsx
```

Expected: PASS

---

### Task 4: Focused verification

**Files:**
- Modify: `docs/plans/2026-03-13-phase-eight-grounded-memory-dialogue-design.md`

**Step 1: Document the control surface**

Clarify that judge execution can now be toggled and overridden per compare run from the compare UI.

**Step 2: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/shared/phaseEightContracts.test.ts tests/unit/main/memoryWorkspaceCompareService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx
npm run build
```

Expected: PASS
