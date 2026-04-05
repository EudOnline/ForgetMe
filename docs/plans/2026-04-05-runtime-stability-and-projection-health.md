# Runtime Stability And Projection Health Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize the remaining flaky runtime-service paths and add first-class projection health observability so runtime autonomy can scale without hidden latency drift or silent projection skew.

**Architecture:** Keep the current incremental alert, audit, scorecard, and snapshot design, but close the remaining operational gaps in two layers. First, make bounded recovery and nested delegation depth enforcement deterministic so tests and production behavior are driven by explicit runtime rules rather than timing luck. Second, expose projection health from the main process as a read model derived from existing projection-state tables plus lightweight consistency checks, then surface it through the runtime snapshot/workbench path so operators can see lag, drift, and rebuild risk before autonomy confidence erodes.

**Tech Stack:** Electron, TypeScript, SQLite, Vitest, React

---

### Task 1: Lock in the two unstable runtime regressions with deterministic red tests

**Files:**
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Create: `tests/unit/main/objectiveSubagentExecutionService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeService.test.ts`
- Test: `tests/unit/main/objectiveSubagentExecutionService.test.ts`

**Step 1: Write the failing test**

Add focused tests that prove:
- bounded recovery retries exactly once for a deterministic timeout/failure signal, without depending on wall-clock slowness
- the retry path records one `recovery_attempted`, one `objective_recovered` on success, and one `recovery_exhausted` when the second failure persists
- delegation depth enforcement is evaluated from the thread hierarchy itself and rejects third-level nested delegation deterministically
- the depth calculation can be unit-tested without having to run the whole objective runtime orchestration

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "records one bounded recovery and retries a local compare-analyst timeout once" tests/unit/main/objectiveSubagentExecutionService.test.ts`

Expected: FAIL because the current runtime test still depends on timing-sensitive timeout behavior and there is no focused depth-calculation coverage yet.

**Step 3: Write minimal implementation**

Introduce only the smallest production seams needed for deterministic tests:
- explicit failure injection or timeout classification hooks for the compare-analyst retry path
- an exported/internal helper around delegation-depth calculation that can be exercised in isolation

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "records one bounded recovery and retries a local compare-analyst timeout once" tests/unit/main/objectiveSubagentExecutionService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/objectiveSubagentExecutionService.test.ts src/main/services/objectiveRuntimeService.ts src/main/services/objectiveSubagentExecutionService.ts
git commit -m "test: lock runtime recovery and delegation depth regressions"
```

### Task 2: Make bounded recovery deterministic and remove wall-clock retry races

**Files:**
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeRecoveryService.ts`
- Modify: `src/main/services/objectiveRuntimeFailureService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Write the failing test**

Extend the red tests so they assert:
- a first failure classified as `tool_timeout` or `transient_local_failure` triggers exactly one bounded retry
- the retry cooldown itself is injected or stubbed instead of using a hardcoded `sleep(25)`
- the runtime never records duplicate recovery checkpoints/events for the same attempt

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "records one bounded recovery"`

Expected: FAIL because the runtime still couples retry behavior to inline `sleep(25)` timing and broad error normalization.

**Step 3: Write minimal implementation**

Implement:
- a small injectable cooldown/wait dependency in `createObjectiveRuntimeService`
- deterministic failure classification for local compare timeout scenarios in `objectiveRuntimeFailureService`
- a single recovery-attempt path that records telemetry/checkpoints once, then reuses the same decision state for the retry

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "records one bounded recovery"`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveRuntimeService.ts src/main/services/objectiveRuntimeRecoveryService.ts src/main/services/objectiveRuntimeFailureService.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "fix: stabilize bounded runtime recovery"
```

### Task 3: Make nested delegation depth enforcement explicit, isolated, and stable

**Files:**
- Modify: `src/main/services/objectiveSubagentExecutionService.ts`
- Modify: `src/main/services/subagentRegistryService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`
- Create: `tests/unit/main/objectiveSubagentExecutionService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeService.test.ts`
- Test: `tests/unit/main/objectiveSubagentExecutionService.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- root-thread execution depth, first nested depth, and blocked third-level depth are all computed from a known parent-thread chain
- profiles with `maxDelegationDepth: 1` reject nested subthreads beyond the allowed depth without relying on downstream runner behavior
- profiles with `maxDelegationDepth: 2` still allow one nested follow-up

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveSubagentExecutionService.test.ts tests/unit/main/objectiveRuntimeService.test.ts -t "delegation depth"`

Expected: FAIL because the current depth logic only lives inside the larger execution service path and lacks isolated regression coverage.

**Step 3: Write minimal implementation**

Implement:
- a small depth-policy helper inside `objectiveSubagentExecutionService.ts`
- explicit naming for “execution depth” vs “allowed nested depth” so the third-layer boundary is unambiguous
- any profile comment or normalization needed in `subagentRegistryService.ts` so per-specialization limits remain readable and intentional

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveSubagentExecutionService.test.ts tests/unit/main/objectiveRuntimeService.test.ts -t "delegation depth"`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveSubagentExecutionService.ts src/main/services/subagentRegistryService.ts tests/unit/main/objectiveSubagentExecutionService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "fix: harden nested delegation depth enforcement"
```

### Task 4: Add projection health read models for alert, audit, and scorecard projections

**Files:**
- Create: `src/main/services/objectiveRuntimeProjectionHealthService.ts`
- Modify: `src/main/services/objectiveRuntimeAlertService.ts`
- Modify: `src/main/services/objectiveRuntimeAuditService.ts`
- Modify: `src/main/services/objectiveRuntimeTelemetryService.ts`
- Modify: `src/main/services/objectiveRuntimeOpsReadService.ts`
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/shared/contracts/objective.ts`
- Modify: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Modify: `src/main/modules/objective/ipc/handlers.ts`
- Modify: `src/preload/modules/objective.ts`
- Modify: `src/renderer/clients/objectiveClient.ts`
- Modify: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Modify: `tests/unit/main/agentIpc.test.ts`
- Test: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Test: `tests/unit/main/agentIpc.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- runtime ops can return projection health for `runtime_alerts`, `runtime_audit`, and `runtime_scorecard`
- each projection reports at least `lastProjectedEventRowId`, `currentEventRowId`, `lagEvents`, `isCurrent`, and `updatedAt`
- health reads stay on the steady-state fast path and do not open write transactions when projections are already current

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/agentIpc.test.ts`

Expected: FAIL because no projection health model or IPC surface exists yet.

**Step 3: Write minimal implementation**

Implement:
- a dedicated health service that reads existing projection-state tables instead of replaying history
- small read helpers in alert/audit/telemetry services for current rowid/state metadata
- a runtime ops method and IPC contract for projection health, either standalone or embedded into the snapshot payload

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/agentIpc.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectiveRuntimeProjectionHealthService.ts src/main/services/objectiveRuntimeAlertService.ts src/main/services/objectiveRuntimeAuditService.ts src/main/services/objectiveRuntimeTelemetryService.ts src/main/services/objectiveRuntimeOpsReadService.ts src/shared/objectiveRuntimeContracts.ts src/shared/archiveContracts.ts src/shared/contracts/objective.ts src/main/modules/objective/runtime/createObjectiveModule.ts src/main/modules/objective/ipc/handlers.ts src/preload/modules/objective.ts src/renderer/clients/objectiveClient.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/agentIpc.test.ts
git commit -m "feat: expose runtime projection health"
```

### Task 5: Add projection consistency, drift, and snapshot-refresh verification

**Files:**
- Modify: `tests/unit/main/objectiveRuntimeAlertService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Modify: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`
- Modify: `src/renderer/i18n.tsx`
- Test: `tests/unit/main/objectiveRuntimeAlertService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Test: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:
- projection health turns unhealthy when projection state lags behind current runtime events
- snapshot refresh still performs only one alert sync and one audit sync per refresh
- renderer workbench can display projection health and degraded status without falling back to extra per-panel reads
- alert/audit/scorecard projections remain internally consistent after new events are appended incrementally

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

Expected: FAIL because projection health is not yet rendered and consistency/degraded-state coverage is incomplete.

**Step 3: Write minimal implementation**

Implement:
- renderer health panel updates inside the existing runtime workbench snapshot flow
- i18n labels for healthy/lagging projection states
- targeted consistency assertions/helpers in the main-process test suites so future projection regressions fail close to the source

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/pages/ObjectiveWorkbenchPage.tsx src/renderer/i18n.tsx tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx
git commit -m "test: verify projection consistency and snapshot health"
```

### Task 6: Full verification and merge readiness

**Files:**
- Verify current branch changes only; no new feature files expected beyond prior tasks

**Step 1: Run focused runtime stability suites**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts tests/unit/main/objectiveSubagentExecutionService.test.ts tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

Expected: PASS

**Step 2: Run static verification**

Run: `npm run lint`

Expected: PASS

Run: `npm run test:typecheck`

Expected: PASS

**Step 3: Run runtime regression coverage**

Run: `npm run test:e2e:objective`

Expected: PASS

**Step 4: Sanity-check historical flakes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "records one bounded recovery and retries a local compare-analyst timeout once" --runInBand`

Expected: PASS

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts -t "blocks third-level nested subagent execution once delegation depth is exhausted" --runInBand`

Expected: PASS

**Step 5: Final commit**

```bash
git status --short
git add src/main/services src/main/modules/objective src/preload/modules/objective.ts src/renderer src/shared tests/unit docs/plans/2026-04-05-runtime-stability-and-projection-health.md
git commit -m "feat: stabilize runtime execution and add projection health"
```

### Execution Notes

- Use `@test-driven-development` for every task that changes runtime behavior.
- Use `@verification-before-completion` before claiming the flaky regressions are fixed.
- Use `@requesting-code-review` before merge, with emphasis on latency, transaction scope, and projection drift.
