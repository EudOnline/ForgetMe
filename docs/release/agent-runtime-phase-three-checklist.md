# Agent Runtime Phase Three Checklist

## Import Execution

- [ ] Open `Agent Console`.
- [ ] Select `ingestion` and confirm `Execution preview` shows `ingestion.import_batch`.
- [ ] Run an import from the console and verify the UI shows preflight counts plus the created batch message.
- [ ] Confirm the imported batch is visible in the existing archive surfaces.

## Review Safety

- [ ] Open `Agent Console` with `review` selected.
- [ ] Enter a destructive prompt such as `Approve review item <queue-item-id>`.
- [ ] Confirm `Execution preview` flags the action as confirmation-gated before submission.
- [ ] Verify the confirmation token affordance still blocks execution until a token is provided.

## Workspace Links

- [ ] Run a workspace-oriented prompt from `Agent Console`.
- [ ] Confirm the preview resolves to `workspace.ask_memory`.
- [ ] Verify `Open Memory Workspace` still navigates into the existing workspace surface after execution.

## Governance Observability

- [ ] Select a run or role with known agent memory and policy records.
- [ ] Confirm `Operational memory` renders the expected memory key/value pairs inline.
- [ ] Confirm `Policy history` renders newest-first policy versions inline.
- [ ] Verify these reads remain side-effect-free while switching runs or roles.

## Replay Durability

- [ ] Run a review task and confirm replay metadata is shown in `Run History` and `Run Detail`.
- [ ] Relaunch the app with the same data directory.
- [ ] Confirm the latest assistant response, target role, and assigned roles still appear after relaunch.

## Regression Commands

```bash
npm run test:unit -- tests/unit/main/agentOrchestratorService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/ingestionAgentService.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx
npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts
```
