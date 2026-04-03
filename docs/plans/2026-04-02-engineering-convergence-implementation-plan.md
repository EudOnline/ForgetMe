# Engineering Convergence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the app into clean renderer, preload, shared-contract, and main-process modules so future feature work lands on smaller, more coherent surfaces instead of growing the current app shell, IPC, and runtime bottlenecks.

**Architecture:** Replace the current top-heavy `App.tsx`, giant preload bridge, and mixed-responsibility IPC modules with a feature-oriented structure. Introduce a renderer app shell, split contracts and schemas by domain, centralize main-process dependency assembly in bootstrap code, and move objective/workspace/review logic behind module-local entry points. Do not keep compatibility shims; migrate each slice fully, then delete the old slice.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Zod, Vitest, Playwright

---

## Scope Guardrails

- Do not preserve `window.archiveApi` as a giant compatibility surface after migration.
- Do not leave old `src/main/ipc/*.ts` or `src/shared/ipcSchemas.ts` as aliases once the new module owns the domain.
- Do not combine structural migration with feature expansion.
- Prefer full-slice replacement per domain over partial indirection layers.
- Keep every migration step test-backed before deleting the old implementation.

## Target Structure

```text
src/
  main/
    bootstrap/
      registerIpc.ts
      serviceContainer.ts
    modules/
      import/
      people/
      review/
      workspace/
      objective/
      ops/
  preload/
    modules/
      import.ts
      people.ts
      review.ts
      workspace.ts
      objective.ts
      ops.ts
    index.ts
  renderer/
    app-shell/
      AppShell.tsx
      appReducer.ts
      navigation.ts
      routeState.ts
    features/
      import/
      people/
      review/
      workspace/
      objective/
      ops/
  shared/
    contracts/
      import.ts
      people.ts
      review.ts
      workspace.ts
      objective.ts
      ops.ts
    schemas/
      import.ts
      people.ts
      review.ts
      workspace.ts
      objective.ts
      ops.ts
```

### Task 1: Lock The Refactor Boundary With Repo Tests

**Files:**
- Create: `tests/unit/repo/engineeringConvergenceStructure.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`

**Step 1: Write the failing test**

Add repo-level assertions that the final repository must satisfy:
- `src/shared/ipcSchemas.ts` no longer exists
- `src/renderer/App.tsx` is not the main orchestration surface for app navigation
- `src/preload/index.ts` does not declare a giant inline `archiveApi` object
- `src/main/index.ts` delegates IPC registration into bootstrap code

Add focused tests that expect:
- preload exports module-composed APIs rather than one hand-written mega object
- the agent/objective IPC tests exercise module registration through bootstrap, not direct legacy registration

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/repo/engineeringConvergenceStructure.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/preload/index.test.ts tests/unit/main/agentIpc.test.ts`

Expected: FAIL because the legacy structure is still present.

**Step 3: Tighten assertions**

Make the tests assert absence, not just presence of new files. The purpose is to prevent ending the refactor with both structures coexisting.

**Step 4: Run test to verify it still fails for the intended reasons**

Run: `npm run test:unit -- tests/unit/repo/engineeringConvergenceStructure.test.ts`

Expected: FAIL on legacy files and bootstrap wiring gaps.

### Task 2: Replace The Renderer Root With An App Shell

**Files:**
- Create: `src/renderer/app-shell/AppShell.tsx`
- Create: `src/renderer/app-shell/appReducer.ts`
- Create: `src/renderer/app-shell/navigation.ts`
- Create: `src/renderer/app-shell/routeState.ts`
- Create: `src/renderer/features/import/ImportFeaturePage.tsx`
- Create: `src/renderer/features/people/PeopleFeaturePage.tsx`
- Create: `src/renderer/features/review/ReviewFeaturePage.tsx`
- Create: `src/renderer/features/workspace/WorkspaceFeaturePage.tsx`
- Create: `src/renderer/features/objective/ObjectiveFeaturePage.tsx`
- Create: `src/renderer/features/ops/OpsFeaturePage.tsx`
- Modify: `src/renderer/main.tsx`
- Delete: `src/renderer/App.tsx`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Create: `tests/unit/renderer/appShell.test.tsx`

**Step 1: Write the failing test**

Create app-shell tests that require:
- navigation is driven by a reducer or explicit route-state model
- page transitions are expressed as route intents rather than direct chains of `setState`
- the root renderer mounts `AppShell`

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/appShell.test.tsx`

Expected: FAIL because the shell does not exist yet.

**Step 3: Write minimal implementation**

- Create a typed route model for:
  - import
  - batches / batch detail
  - people / person
  - group portrait
  - memory workspace
  - review queue / review workbench
  - enrichment / preservation / objective
- Move navigation behavior out of the deleted `App.tsx` and into `AppShell`
- Convert feature entry pages into route-driven containers

**Step 4: Run focused renderer tests**

Run: `npm run test:unit -- tests/unit/renderer/appShell.test.tsx tests/unit/renderer/importPage.test.tsx tests/unit/renderer/peoplePage.test.tsx tests/unit/renderer/reviewQueuePage.test.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

Expected: PASS.

### Task 3: Split Shared Contracts And Schemas By Domain

**Files:**
- Create: `src/shared/contracts/import.ts`
- Create: `src/shared/contracts/people.ts`
- Create: `src/shared/contracts/review.ts`
- Create: `src/shared/contracts/workspace.ts`
- Create: `src/shared/contracts/objective.ts`
- Create: `src/shared/contracts/ops.ts`
- Create: `src/shared/schemas/import.ts`
- Create: `src/shared/schemas/people.ts`
- Create: `src/shared/schemas/review.ts`
- Create: `src/shared/schemas/workspace.ts`
- Create: `src/shared/schemas/objective.ts`
- Create: `src/shared/schemas/ops.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Delete: `src/shared/ipcSchemas.ts`
- Modify: `tests/unit/shared/objectiveRuntimeContracts.test.ts`
- Create: `tests/unit/shared/schemaModuleBoundaries.test.ts`

**Step 1: Write the failing test**

Add shared tests that require:
- each domain owns its own schemas
- no imports from `src/shared/ipcSchemas.ts`
- objective contracts and archive contracts no longer act as dumping grounds for unrelated IPC payloads

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/shared/schemaModuleBoundaries.test.ts tests/unit/shared/objectiveRuntimeContracts.test.ts`

Expected: FAIL because schemas remain centralized.

**Step 3: Write minimal implementation**

- Move import/review/workspace/objective schemas into domain files
- Re-export only intentional public types from `contracts/*`
- Update every import site to use the new domain contract or schema module directly

**Step 4: Run focused contract tests**

Run: `npm run test:unit -- tests/unit/shared/*.test.ts`

Expected: PASS.

### Task 4: Rebuild The Preload Bridge As Domain Modules

**Files:**
- Create: `src/preload/modules/import.ts`
- Create: `src/preload/modules/people.ts`
- Create: `src/preload/modules/review.ts`
- Create: `src/preload/modules/workspace.ts`
- Create: `src/preload/modules/objective.ts`
- Create: `src/preload/modules/ops.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/archiveApi.ts`
- Modify: `src/renderer/global.d.ts`
- Modify: `tests/unit/preload/index.test.ts`
- Modify: `tests/unit/renderer/archiveApi.test.ts`

**Step 1: Write the failing test**

Require:
- preload index composes feature bridges from `modules/*`
- renderer API reads grouped feature clients rather than a monolithic inline object
- the fallback test shape mirrors the new grouped API surface

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts`

Expected: FAIL because preload and renderer still assume one giant `ArchiveApi`.

**Step 3: Write minimal implementation**

- Replace the inline preload object with imported module builders
- Replace renderer API accessors with grouped clients:
  - `importClient`
  - `peopleClient`
  - `reviewClient`
  - `workspaceClient`
  - `objectiveClient`
  - `opsClient`
- Update renderer feature pages to depend only on their domain client

**Step 4: Run focused bridge tests**

Run: `npm run test:unit -- tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/testing-library.tsx`

Expected: PASS.

### Task 5: Introduce Main Bootstrap And Service Container

**Files:**
- Create: `src/main/bootstrap/serviceContainer.ts`
- Create: `src/main/bootstrap/registerIpc.ts`
- Modify: `src/main/index.ts`
- Create: `src/main/modules/objective/registerObjectiveIpc.ts`
- Create: `src/main/modules/review/registerReviewIpc.ts`
- Create: `src/main/modules/workspace/registerWorkspaceIpc.ts`
- Create: `src/main/modules/import/registerImportIpc.ts`
- Create: `src/main/modules/people/registerPeopleIpc.ts`
- Create: `src/main/modules/ops/registerOpsIpc.ts`
- Delete: `src/main/ipc/agentIpc.ts`
- Delete: `src/main/ipc/archiveIpc.ts`
- Delete: `src/main/ipc/contextPackIpc.ts`
- Delete: `src/main/ipc/enrichmentIpc.ts`
- Delete: `src/main/ipc/memoryWorkspaceIpc.ts`
- Delete: `src/main/ipc/peopleIpc.ts`
- Delete: `src/main/ipc/preservationIpc.ts`
- Delete: `src/main/ipc/reviewIpc.ts`
- Delete: `src/main/ipc/searchIpc.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Create: `tests/unit/main/bootstrap/registerIpc.test.ts`

**Step 1: Write the failing test**

Require:
- `src/main/index.ts` only creates the window, app paths, service container, and IPC bootstrap
- module registration functions are individually testable
- IPC handlers depend on injected services rather than opening databases inline

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/bootstrap/registerIpc.test.ts tests/unit/main/agentIpc.test.ts`

Expected: FAIL because main registration remains file-local and mixed with runtime construction.

**Step 3: Write minimal implementation**

- Create a service container that owns:
  - db factories
  - external web search service
  - external verification broker
  - role registries
  - objective runtime factory
- Make module registration receive container dependencies
- Keep Electron-specific concerns in bootstrap only

**Step 4: Run focused main tests**

Run: `npm run test:unit -- tests/unit/main/bootstrap/registerIpc.test.ts tests/unit/main/agentIpc.test.ts tests/unit/main/contextPackIpc.test.ts tests/unit/main/memoryWorkspaceIpc.test.ts`

Expected: PASS after the tests are migrated to the new module registration sites.

### Task 6: Recut Objective Runtime Behind A Module Boundary

**Files:**
- Create: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Create: `src/main/modules/objective/ipc/handlers.ts`
- Create: `src/main/modules/objective/services/`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeDeliberationService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalDecisionService.ts`
- Modify: `src/main/services/objectiveRuntimeProposalStateService.ts`
- Modify: `src/main/services/objectiveTriggerService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Modify: `tests/unit/main/facilitatorAgentService.test.ts`
- Modify: `tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`

**Step 1: Write the failing test**

Require:
- objective IPC reaches the runtime only through the objective module
- runtime construction is isolated in one factory
- objective tests no longer import legacy IPC files

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/facilitatorAgentService.test.ts`

Expected: FAIL until the runtime is module-scoped.

**Step 3: Write minimal implementation**

- Pull orchestration-only assembly into `createObjectiveModule`
- Leave domain services small and single-purpose
- Make the IPC handler layer a thin adapter from schema to use case

**Step 4: Run focused runtime tests**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/agentProposalGateService.test.ts`

Expected: PASS.

### Task 7: Recut Workspace And Review Into Feature Modules

**Files:**
- Create: `src/main/modules/workspace/`
- Create: `src/main/modules/review/`
- Modify: `src/main/services/memoryWorkspaceService.ts`
- Modify: `src/main/services/memoryWorkspaceSessionService.ts`
- Modify: `src/main/services/memoryWorkspaceCompareService.ts`
- Modify: `src/main/services/reviewQueueService.ts`
- Modify: `src/main/services/reviewWorkbenchReadService.ts`
- Modify: `src/renderer/components/MemoryWorkspaceView.tsx`
- Modify: `src/renderer/pages/MemoryWorkspacePage.tsx`
- Modify: `src/renderer/pages/ReviewWorkbenchPage.tsx`
- Modify: `tests/unit/main/memoryWorkspaceService.test.ts`
- Modify: `tests/unit/main/reviewQueueService.test.ts`
- Modify: `tests/unit/renderer/memoryWorkspacePage.test.tsx`
- Modify: `tests/unit/renderer/reviewWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

Require:
- workspace and review page containers import feature clients, not generic archive clients
- main-process workspace/review handlers live in module entry points
- module-level tests can instantiate workspace/review behavior without full app bootstrap

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx`

Expected: FAIL because the current layer boundaries are still shared and global.

**Step 3: Write minimal implementation**

- Move workspace/review entrypoints and adapters into `src/main/modules/*`
- Reduce renderer page responsibilities to feature composition and event wiring
- Keep domain services reusable, but stop treating them as global grab-bags

**Step 4: Run focused feature tests**

Run: `npm run test:unit -- tests/unit/main/memoryWorkspaceService.test.ts tests/unit/main/reviewQueueService.test.ts tests/unit/renderer/memoryWorkspacePage.test.tsx tests/unit/renderer/reviewWorkbenchPage.test.tsx tests/unit/renderer/reviewWorkbenchActions.test.tsx`

Expected: PASS.

### Task 8: Delete Legacy Structure And Run Full Verification

**Files:**
- Delete any remaining unused legacy files under:
  - `src/main/ipc/`
  - `src/renderer/pages/` that have been replaced by feature entry pages
  - `src/shared/ipcSchemas.ts`
  - any legacy route helper created only for migration
- Modify: `README.md` if architectural references need to be updated

**Step 1: Run legacy-file audit**

Run: `rg -n "from '../shared/ipcSchemas'|from '../../shared/ipcSchemas'|archiveApi\\.|registerAgentIpc|registerMemoryWorkspaceIpc|registerReviewIpc" src tests`

Expected: no matches for deleted legacy import paths or registration APIs.

**Step 2: Run focused regression suite**

Run:
- `npm run test:unit -- tests/unit/repo/engineeringConvergenceStructure.test.ts`
- `npm run test:unit -- tests/unit/renderer/appShell.test.tsx`
- `npm run test:unit -- tests/unit/main/bootstrap/registerIpc.test.ts`

Expected: PASS.

**Step 3: Run full verification**

Run:
- `npm run lint`
- `npm run test:typecheck`
- `npm run test:unit`
- `npm run build`
- `npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/review-workbench-single-item-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`

Expected: PASS.

**Step 4: Sanity-check cleanup**

Confirm:
- no feature imports generic cross-domain clients unless they are explicitly shared
- no module opens databases inline inside handler files
- no monolithic renderer shell has reappeared under a different filename
- no giant shared contract or schema file has re-formed

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8

## Exit Criteria

- The root renderer is `AppShell`, not a monolithic page switch component.
- Shared contracts and schemas are domain-owned.
- Preload is composed from domain modules.
- Main process registration is bootstrap-driven and dependency-injected.
- Objective, workspace, and review each have a clean module boundary.
- The old IPC and giant shared schema surfaces are deleted.
- Lint, typecheck, unit tests, build, and the targeted e2e suite all pass.

Plan complete and saved to `docs/plans/2026-04-02-engineering-convergence-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
