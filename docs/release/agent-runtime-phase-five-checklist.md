# Agent Runtime Phase Five Checklist

## Settings Persistence

- [ ] Launch the app and open `Agent Console`.
- [ ] Confirm the autonomy control loads the persisted mode from SQLite on first render.
- [ ] Switch between `manual_only` and `suggest_safe_auto_run`, restart the app, and confirm the last selected mode remains visible.

## Manual-Only Mode

- [ ] Set autonomy mode to `manual_only`.
- [ ] Refresh suggestions and confirm suggested items appear without any new `auto_runner` history entry.
- [ ] Confirm destructive review suggestions still require a confirmation token before execution.

## Safe Auto-Run Mode

- [ ] Set autonomy mode to `suggest_safe_auto_run`.
- [ ] Seed at least one allowlisted low-risk suggestion with `autoRunnable = true`.
- [ ] Confirm the runner executes at most one eligible suggestion per cycle and records `Execution origin: auto_runner`.
- [ ] Confirm destructive or non-allowlisted suggestions never auto-run even when they are visible in the inbox.

## Follow-Up Suggestions

- [ ] Complete a `review.suggest_safe_group_action` run that identifies a safe group.
- [ ] Confirm a manual `review.apply_safe_group` follow-up suggestion is created with visible follow-up provenance.
- [ ] Complete a `governance.summarize_failures` run with unresolved failures and confirm a `governance.propose_policy_update` follow-up suggestion appears with rationale.
- [ ] Confirm follow-up suggestions dedupe against both their trigger family and parent suggestion lineage.

## Cooldown And Retry Behavior

- [ ] Seed a repeatedly failing `ingestion.rerun_enrichment` suggestion.
- [ ] Confirm repeated failed attempts increment the persisted attempt count.
- [ ] Confirm failed reruns receive a cooldown and do not immediately reappear as aggressively on refresh.
- [ ] Confirm repeated retry failures escalate to a governance-oriented follow-up rather than looping forever on the same rerun prompt.

## Audit Visibility

- [ ] Confirm suggestions show `Priority`, `Rationale`, `Auto-run eligible`, and `Follow-up of suggestion` metadata in `Agent Console`.
- [ ] Confirm run history and run detail surfaces show `Execution origin` for manual, suggestion-triggered, and auto-run executions.
- [ ] Confirm executed or dismissed suggestions remain queryable in SQLite audit records after leaving the suggested inbox.

## Regression Commands

- [ ] `npm run test:unit -- tests/unit/shared/agentRuntimeContracts.test.ts tests/unit/main/agentPersistenceService.test.ts tests/unit/main/reviewAgentService.test.ts tests/unit/main/governanceAgentService.test.ts tests/unit/main/agentProactiveTriggerService.test.ts tests/unit/main/agentSuggestionRankingService.test.ts tests/unit/main/agentSuggestionFollowupService.test.ts tests/unit/main/agentAutonomyPolicy.test.ts tests/unit/main/agentRuntimeService.test.ts tests/unit/main/agentProactiveRunnerService.test.ts tests/unit/main/agentIpc.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts tests/unit/renderer/agentConsolePage.test.tsx`
- [ ] `npm run test:e2e -- tests/e2e/agent-console-flow.spec.ts tests/e2e/agent-console-replay-and-review-item-flow.spec.ts tests/e2e/agent-console-ingestion-flow.spec.ts tests/e2e/agent-console-proactive-inbox-flow.spec.ts tests/e2e/agent-console-guided-autonomy-flow.spec.ts`
- [ ] `npm run build`
