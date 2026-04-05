# Runtime Ops Snapshot And Audit Projection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate repeated runtime alert sync and global audit rescans during workbench refreshes by introducing an incremental runtime audit projection and a single runtime ops snapshot read path.

**Architecture:** Persist a runtime audit projection keyed by runtime event `rowid`, similar to the existing alert projection, so proposal-kind, specialization, and recovery-reason audit buckets are updated only from new events. Refactor runtime ops reads so alert synchronization happens once per snapshot, then serve scorecard, alerts, events, and settings from that synchronized state through one IPC call used by the workbench.

**Tech Stack:** Electron, TypeScript, SQLite, Vitest, React

---

### Task 1: Lock in failing audit projection tests

**Files:**
- Modify: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`

**Step 1: Write the failing test**

Add tests that prove:
- runtime audit buckets continue to work after incremental updates
- deleting only the audit projection state does not double count historical events
- scorecard reads do not require runtime telemetry global scans when audit data is already projected

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
Expected: FAIL because runtime audit is still recomputed from full event scans.

**Step 3: Write minimal implementation**

Implement only enough audit projection plumbing for the new tests to pass.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
Expected: PASS

### Task 2: Lock in failing runtime snapshot tests

**Files:**
- Modify: `tests/unit/main/agentIpc.test.ts`
- Modify: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
- Test: `tests/unit/main/agentIpc.test.ts`
- Test: `tests/unit/renderer/objectiveWorkbenchPage.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:
- objective IPC exposes a runtime ops snapshot payload
- the renderer page loads runtime scorecard, events, alerts, and settings through the single snapshot method

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
Expected: FAIL because no snapshot IPC path exists yet.

**Step 3: Write minimal implementation**

Add the new contract, handler, client method, module method, and page usage.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
Expected: PASS

### Task 3: Implement runtime audit projection persistence

**Files:**
- Create: `src/main/services/migrations/033_agent_runtime_audit_projection.sql`
- Create: `src/main/services/objectiveRuntimeAuditService.ts`
- Modify: `src/main/services/objectiveRuntimeOpsReadService.ts`

**Step 1: Write the failing test**

Use Task 1 tests as the red phase.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Add:
- audit projection state table
- audit bucket count table
- projection service that processes only new runtime events
- read method that returns top buckets from persisted counts

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
Expected: PASS

### Task 4: Refactor runtime alert reads to support one synchronized snapshot

**Files:**
- Modify: `src/main/services/objectiveRuntimeAlertService.ts`
- Modify: `src/main/services/objectiveRuntimeOpsReadService.ts`

**Step 1: Write the failing test**

Use Task 2 tests plus targeted ops-read assertions as the red phase.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

Separate alert sync from alert-count reads, then build a snapshot path that syncs alerts once and reuses that state for scorecard and alert listing.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
Expected: PASS

### Task 5: Full verification

**Files:**
- Modify: `src/shared/objectiveRuntimeContracts.ts`
- Modify: `src/shared/archiveContracts.ts`
- Modify: `src/main/modules/objective/runtime/createObjectiveModule.ts`
- Modify: `src/main/modules/objective/ipc/handlers.ts`
- Modify: `src/renderer/clients/objectiveClient.ts`
- Modify: `src/renderer/pages/ObjectiveWorkbenchPage.tsx`

**Step 1: Run focused unit suites**

Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/renderer/objectiveWorkbenchPage.test.tsx`
Expected: PASS

**Step 2: Run static verification**

Run: `npm run lint`
Expected: PASS

Run: `npm run test:typecheck`
Expected: PASS

**Step 3: Run runtime regression coverage**

Run: `npm run test:e2e:objective`
Expected: PASS
