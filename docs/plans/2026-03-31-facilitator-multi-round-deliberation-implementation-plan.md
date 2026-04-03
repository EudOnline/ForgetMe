# Facilitator Multi-Round Deliberation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the objective runtime from a single-pass participant sweep into a real facilitator-led deliberation loop that can continue across rounds, persist objective state transitions, and stop cleanly on convergence, stall, or operator handoff.

**Architecture:** Keep the existing `objective / thread / message / proposal / subagent / tool execution` runtime model, but add a facilitator cycle on top of it. The facilitator should run repeated thread deliberation passes, measure whether each pass produced new artifacts, persist objective-level state updates, and classify the stop reason as `in_progress`, `awaiting_operator`, `stalled`, or `completed` without reintroducing the old run-centric execution stack.

**Tech Stack:** Electron, TypeScript, SQLite (`node:sqlite`), Vitest.

---

## Task 1: Freeze Multi-Round Facilitator Behavior with Failing Tests

**Files:**
- Modify: `tests/unit/main/facilitatorAgentService.test.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Add a failing facilitator status test**

Extend `tests/unit/main/facilitatorAgentService.test.ts` with expectations that the facilitator can classify:

- `awaiting_operator` when the thread contains an `awaiting_operator` proposal
- `stalled` after two idle rounds with no new artifacts
- `completed` after convergence with no active proposals and at least one user-facing result

**Step 2: Add a failing multi-round runtime test**

Extend `tests/unit/main/objectiveRuntimeService.test.ts` with a scenario where:

- `workspace` emits a proposal in round 1
- `review` emits a blocking challenge in round 1
- `workspace` reacts to that challenge only in round 2

Assert that the second-round workspace message or proposal exists after `startObjective(...)`.

**Step 3: Add a failing stall-state runtime test**

Add a test that starts an objective with silent participants and asserts:

- `objective.status === 'stalled'`
- `mainThread.status === 'waiting'`
- a facilitator checkpoint records the stall

**Step 4: Run the targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: FAIL because the runtime still performs only a single deliberation pass and does not persist facilitator stop-state updates.

**Step 5: Commit**

```bash
git add tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "test: lock facilitator multi-round deliberation behavior"
```

## Task 2: Add Objective-Level State Mutation and Facilitator Stop Classification

**Files:**
- Modify: `src/main/services/objectivePersistenceMutationService.ts`
- Modify: `src/main/services/objectivePersistenceService.ts`
- Modify: `src/main/services/agents/facilitatorAgentService.ts`

**Step 1: Add failing persistence coverage if needed**

If the new tests reveal missing write support, add or extend the smallest relevant unit assertion in `tests/unit/main/facilitatorAgentService.test.ts`.

**Step 2: Add objective status mutation**

Add a persistence mutation that can update:

- `objective.status`
- `objective.requiresOperatorInput`
- `objective.updatedAt`

Expose it from `objectivePersistenceService.ts`.

Use a shape like:

```ts
export type UpdateObjectiveStatusInput = {
  objectiveId: string
  status: AgentObjectiveStatus
  requiresOperatorInput?: boolean
  updatedAt?: string
}
```

**Step 3: Turn facilitator classification into a real helper**

Extend `createFacilitatorAgentService()` with a helper that accepts current thread/objective state and returns a stop summary such as:

- `reason: 'progress' | 'awaiting_operator' | 'stalled' | 'completed'`
- `nextObjectiveStatus`
- `nextThreadStatus`
- `requiresOperatorInput`
- optional checkpoint metadata for facilitator-generated stall/completion summaries

Keep `detectStall(...)` as the primitive used inside this helper.

**Step 4: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/objectivePersistenceMutationService.ts src/main/services/objectivePersistenceService.ts src/main/services/agents/facilitatorAgentService.ts tests/unit/main/facilitatorAgentService.test.ts
git commit -m "feat: add facilitator state classification and objective status updates"
```

## Task 3: Replace Single-Pass Deliberation with a Facilitator Round Loop

**Files:**
- Modify: `src/main/services/objectiveRuntimeDeliberationService.ts`
- Modify: `src/main/services/objectiveRuntimeService.ts`
- Modify: `tests/unit/main/objectiveRuntimeService.test.ts`

**Step 1: Keep the current single-pass behavior behind a helper**

Refactor the current participant sweep into a private helper that returns:

- `newMessageCount`
- `newProposalCount`
- `newSpawnCount`
- refreshed `objective`
- refreshed `thread`

This lets the facilitator reason about whether a round made progress.

**Step 2: Add a deliberation loop**

Add a new helper such as:

```ts
async function deliberateThreadUntilSettled(input: { threadId: string }) { ... }
```

Behavior:

- repeatedly run one deliberation pass
- increment `roundsWithoutProgress` when a pass creates no new artifacts
- stop when facilitator classifies `awaiting_operator`, `stalled`, or `completed`
- otherwise continue until a bounded max facilitator round count

Use minimal YAGNI bounds, for example a default facilitator cap of `6` rounds.

**Step 3: Persist facilitator-generated state**

When the facilitator stops with:

- `awaiting_operator`: update objective + thread to waiting state
- `stalled`: update objective to `stalled`, thread to `waiting`, and create a checkpoint summary
- `completed`: update objective to `completed`, thread to `completed`, and create a checkpoint summary

Avoid duplicating proposal-gate checkpoints such as `awaiting_operator_confirmation`.

**Step 4: Use the loop from the public runtime surface**

Update `createObjectiveRuntimeService(...)` so:

- `startObjective(...)` runs the facilitator loop, not just one pass
- any public entry point that materially changes proposal state and should resume orchestration can reuse the same loop when appropriate

Start minimal: `startObjective(...)` is required. Resume-after-response can be added only if the tests require it.

**Step 5: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/objectiveRuntimeDeliberationService.ts src/main/services/objectiveRuntimeService.ts src/main/services/agents/facilitatorAgentService.ts src/main/services/objectivePersistenceMutationService.ts src/main/services/objectivePersistenceService.ts tests/unit/main/facilitatorAgentService.test.ts tests/unit/main/objectiveRuntimeService.test.ts
git commit -m "feat: add facilitator-led multi-round deliberation"
```
