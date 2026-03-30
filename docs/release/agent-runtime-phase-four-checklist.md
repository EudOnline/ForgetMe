# Agent Runtime Phase Four Checklist

## Proactive Refresh

- [ ] Launch the app and open `Agent Console`.
- [ ] Confirm the proactive inbox loads existing suggested items.
- [ ] Click `Refresh suggestions` and confirm new suggestions appear without executing anything automatically.

## Governance Suggestion

- [ ] Seed at least one failed agent run.
- [ ] Refresh suggestions and confirm a `Governance follow-up` suggestion appears.
- [ ] Run the suggestion and confirm run history records the resulting governance summary.

## Review Suggestion

- [ ] Seed a safe review group with `pendingCount >= 2` and no conflict.
- [ ] Refresh suggestions and confirm a `Review safe group` suggestion appears.
- [ ] Confirm confirmation-gated review actions still require a confirmation token before execution.

## Enrichment Suggestion

- [ ] Seed a failed enrichment job.
- [ ] Confirm an `Enrichment retry` suggestion appears with the rerun prompt.
- [ ] Dismiss the suggestion and confirm it disappears from the suggested inbox.

## Auditability

- [ ] After running a suggestion, confirm the corresponding run appears in `Run History`.
- [ ] Confirm executed suggestions are removed from the suggested inbox but remain queryable in SQLite audit records.
- [ ] Confirm dismissed suggestions remain queryable in SQLite audit records.

## Regression Commands

- [ ] `npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx`
- [ ] `npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts`
- [ ] `npm run build`
