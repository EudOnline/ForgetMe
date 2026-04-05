# Structured Runtime Failures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ad-hoc runtime failure propagation with a structured failure model for subagent and external verification execution.

**Architecture:** Introduce a shared runtime failure helper that can normalize unknown errors into structured failure objects and attach proposal context without relying on ad-hoc error mutation. Refactor recovery handling to prefer structured failure metadata while preserving current bounded-recovery behavior and telemetry semantics.

**Tech Stack:** TypeScript, Vitest, Electron main-process services

---

### Task 1: Define the structured failure model

**Files:**
- Create: `src/main/services/objectiveRuntimeFailureService.ts`
- Modify: `src/main/services/objectiveRuntimeRecoveryService.ts`
- Test: `tests/unit/main/objectiveRuntimeRecoveryService.test.ts`

**Step 1: Write the failing test**
- Add a recovery test that passes a structured runtime failure object and expects recovery to use its typed failure metadata instead of parsing the error message.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeRecoveryService.test.ts`

**Step 3: Write minimal implementation**
- Add runtime failure helpers for create/normalize/type-guard behavior.
- Update recovery classification to prefer structured failure metadata and fall back to message parsing only for legacy callers.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeRecoveryService.test.ts`

### Task 2: Refactor runtime execution paths to use structured failures

**Files:**
- Modify: `src/main/services/objectiveSubagentRoutingService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Test: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Write the failing test**
- Add a runtime service regression test that proves external verification failures still emit `tool_timeout` and `recovery_exhausted` when propagated as structured runtime failures.

**Step 2: Run test to verify it fails**
- Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts`

**Step 3: Write minimal implementation**
- Replace ad-hoc proposal attachment with structured failure creation in routing.
- Update runtime handling to extract proposal and failure metadata through the shared helper.

**Step 4: Run test to verify it passes**
- Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeService.test.ts`

### Task 3: Verify the refactor across runtime surfaces

**Files:**
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `src/main/services/objectiveRuntimeRecoveryService.ts`
- Test: `tests/unit/main/objectiveRuntimeAlertService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeOpsReadService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeTelemetryService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeRecoveryService.test.ts`
- Test: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Run focused regression suite**
- Run: `npm run test:unit -- tests/unit/main/objectiveRuntimeAlertService.test.ts tests/unit/main/objectiveRuntimeOpsReadService.test.ts tests/unit/main/objectiveRuntimeTelemetryService.test.ts tests/unit/main/objectiveRuntimeRecoveryService.test.ts tests/unit/main/objectiveRuntimeService.test.ts`

**Step 2: Run broader verification**
- Run: `npm run lint`
- Run: `npm run test:typecheck`
- Run: `npm run test:e2e:objective`

**Step 3: Summarize residual risks**
- Check whether any runtime path still depends on raw message parsing for classification and document follow-up work.
