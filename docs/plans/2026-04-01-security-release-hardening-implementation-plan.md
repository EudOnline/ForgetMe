# Security And Release Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the Electron security boundary, remove renderer-side Node fallbacks, and add release-complete lint and packaging workflows.

**Architecture:** Move the renderer onto a preload-only `archiveApi` bridge, tighten `BrowserWindow` security flags, and verify those invariants with repo-level tests. Add packaging and lint tooling as first-class release gates so the repository can produce distributable desktop artifacts with explicit documentation.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, Playwright, ESLint, electron-builder

---

### Task 1: Lock Security Invariants With Failing Tests

**Files:**
- Create: `tests/unit/repo/electronSecurityHardening.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`

**Step 1: Write the failing test**

Add repo-level assertions that:
- `src/main/index.ts` enables `contextIsolation`, disables `nodeIntegration`, and enables `sandbox`
- `src/renderer/archiveApi.ts` no longer references `window.require` or renderer-side `ipcRenderer`

Add a renderer archive API test that expects `getArchiveApi()` to rely on `window.archiveApi` when provided and otherwise use the fallback API without trying to build an Electron bridge from `window.require`.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/repo/electronSecurityHardening.test.ts tests/unit/renderer/archiveApi.test.ts`

Expected: FAIL because the current main window is still permissive and the renderer API still contains `window.require('electron')`.

**Step 3: Update the affected e2e helper**

Adjust the objective confirmation e2e helper to read proposal state only from `window.archiveApi`, matching the hardened runtime.

**Step 4: Run test to verify it still fails for the right reason**

Run: `npm run test:unit -- tests/unit/repo/electronSecurityHardening.test.ts tests/unit/renderer/archiveApi.test.ts`

Expected: still FAIL, but only on the actual production-code hardening gaps.

### Task 2: Refactor To A Preload-Only Renderer Bridge

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Create: `src/renderer/global.d.ts`

**Step 1: Write the failing test**

Extend `tests/unit/preload/index.test.ts` or `tests/unit/renderer/archiveApi.test.ts` to require typed `window.archiveApi` access without renderer-side Electron imports.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/repo/electronSecurityHardening.test.ts`

Expected: FAIL until the bridge and security flags are updated.

**Step 3: Write minimal implementation**

- Change `BrowserWindow` web preferences to `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`
- Keep `preload` wired up
- Remove `createIpcArchiveApi()` and any `window.require` fallback from the renderer
- Add global window typing for `archiveApi`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/repo/electronSecurityHardening.test.ts`

Expected: PASS.

### Task 3: Add Release Tooling And Packaging

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `eslint.config.js`
- Create: `electron-builder.yml`
- Create: `build/icon.png`
- Create: `tests/unit/repo/releaseTooling.test.ts`

**Step 1: Write the failing test**

Add repo-level assertions that:
- `package.json` contains `lint`, `dist`, and `pack` scripts
- release verification includes lint
- `electron-builder.yml` exists and defines app metadata / output configuration

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/repo/releaseTooling.test.ts`

Expected: FAIL because the scripts and builder config do not exist yet.

**Step 3: Write minimal implementation**

- Add ESLint flat config for TypeScript/React files
- Add `lint`, `lint:fix`, `pack`, and `dist` scripts
- Add `electron-builder` and required lint dependencies
- Add a minimal build asset and builder config
- Include lint in `verify:release`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/repo/releaseTooling.test.ts`

Expected: PASS.

### Task 4: Document And Verify The Hardened Release Flow

**Files:**
- Modify: `README.md`
- Modify: `docs/release/v1-rc-checklist.md`

**Step 1: Write the failing test**

If practical, extend `tests/unit/repo/releaseTooling.test.ts` to assert README mentions lint and distribution commands.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/repo/releaseTooling.test.ts`

Expected: FAIL until documentation is updated.

**Step 3: Write minimal implementation**

- Document the new lint gate and distribution commands
- Update the RC checklist to include lint and package verification

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/repo/releaseTooling.test.ts`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- No new files

**Step 1: Run focused verification**

Run:
- `npm run test:unit -- tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/repo/electronSecurityHardening.test.ts tests/unit/repo/releaseTooling.test.ts`
- `npm run lint`

Expected: PASS.

**Step 2: Run broader regression checks**

Run:
- `npm run test:unit`
- `npm run build`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`

Expected: PASS.
