import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AgentSuggestionRecord,
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentRunDetail,
  AgentRunRecord,
  AgentSuggestionStatus,
  ArchiveApi,
  DismissAgentSuggestionInput,
  GetAgentRunInput,
  ListAgentMemoriesInput,
  ListAgentSuggestionsInput,
  ListAgentPolicyVersionsInput,
  ListAgentRunsInput,
  RunAgentSuggestionInput,
  RunAgentTaskInput,
  RunAgentTaskResult
} from '../../../src/shared/archiveContracts'
import {
  dismissAgentSuggestionInputSchema,
  getAgentRunInputSchema,
  listAgentMemoriesInputSchema,
  listAgentSuggestionsInputSchema,
  listAgentPolicyVersionsInputSchema,
  listAgentRunsInputSchema,
  runAgentSuggestionInputSchema,
  runAgentTaskInputSchema
} from '../../../src/shared/ipcSchemas'

describe('agent runtime shared contracts', () => {
  it('validates run-agent input and confirmation gating', () => {
    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'Import the latest chat export',
      role: 'orchestrator'
    }).success).toBe(true)

    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'Import the latest chat export',
      role: 'unknown'
    }).success).toBe(false)

    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'Approve this high-risk candidate',
      role: 'review',
      taskKind: 'review.apply_item_decision'
    }).success).toBe(false)

    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'Approve this safe batch',
      role: 'review',
      taskKind: 'review.apply_safe_group'
    }).success).toBe(false)

    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'Approve this safe batch',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      confirmationToken: 'confirm-1'
    }).success).toBe(true)

    expect(runAgentTaskInputSchema.safeParse({
      prompt: 'x',
      role: 'orchestrator',
      taskKind: 'workspace.ask_memory'
    }).success).toBe(false)
  })

  it('parses list/get agent run inputs', () => {
    expect(listAgentRunsInputSchema.safeParse({
      role: 'review'
    }).success).toBe(true)

    expect(getAgentRunInputSchema.safeParse({
      runId: 'run-1'
    }).success).toBe(true)

    expect(listAgentMemoriesInputSchema.safeParse({
      role: 'workspace'
    }).success).toBe(true)

    expect(listAgentPolicyVersionsInputSchema.safeParse({
      role: 'governance',
      policyKey: 'governance.review.policy'
    }).success).toBe(true)

    expect(listAgentSuggestionsInputSchema.safeParse({
      role: 'governance',
      status: 'suggested',
      limit: 20
    }).success).toBe(true)

    expect(dismissAgentSuggestionInputSchema.safeParse({
      suggestionId: 'suggestion-1'
    }).success).toBe(true)

    expect(runAgentSuggestionInputSchema.safeParse({
      suggestionId: 'suggestion-1',
      confirmationToken: 'confirm-1'
    }).success).toBe(true)
  })

  it('extends ArchiveApi with agent-runtime methods', () => {
    expectTypeOf<ArchiveApi['runAgentTask']>().toEqualTypeOf<
      (input: RunAgentTaskInput) => Promise<RunAgentTaskResult>
    >()
    expectTypeOf<ArchiveApi['listAgentRuns']>().toEqualTypeOf<
      (input?: ListAgentRunsInput) => Promise<AgentRunRecord[]>
    >()
    expectTypeOf<ArchiveApi['getAgentRun']>().toEqualTypeOf<
      (input: GetAgentRunInput) => Promise<AgentRunDetail | null>
    >()
    expectTypeOf<ArchiveApi['listAgentMemories']>().toEqualTypeOf<
      (input?: ListAgentMemoriesInput) => Promise<AgentMemoryRecord[]>
    >()
    expectTypeOf<ArchiveApi['listAgentPolicyVersions']>().toEqualTypeOf<
      (input?: ListAgentPolicyVersionsInput) => Promise<AgentPolicyVersionRecord[]>
    >()
    expectTypeOf<ArchiveApi['listAgentSuggestions']>().toEqualTypeOf<
      (input?: ListAgentSuggestionsInput) => Promise<AgentSuggestionRecord[]>
    >()
    expectTypeOf<ArchiveApi['dismissAgentSuggestion']>().toEqualTypeOf<
      (input: DismissAgentSuggestionInput) => Promise<AgentSuggestionRecord | null>
    >()
    expectTypeOf<ArchiveApi['runAgentSuggestion']>().toEqualTypeOf<
      (input: RunAgentSuggestionInput) => Promise<RunAgentTaskResult | null>
    >()
  })

  it('constrains task kinds by role in TypeScript contracts', () => {
    type OrchestratorTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'orchestrator' }>['taskKind'], undefined>
    type IngestionTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'ingestion' }>['taskKind'], undefined>
    type ReviewTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'review' }>['taskKind'], undefined>
    type WorkspaceTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'workspace' }>['taskKind'], undefined>
    type GovernanceTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'governance' }>['taskKind'], undefined>

    expectTypeOf<OrchestratorTaskKind>().toEqualTypeOf<'orchestrator.plan_next_action'>()
    expectTypeOf<IngestionTaskKind>().toEqualTypeOf<
      'ingestion.import_batch' | 'ingestion.rerun_enrichment' | 'ingestion.summarize_document_evidence'
    >()
    expectTypeOf<ReviewTaskKind>().toEqualTypeOf<
      'review.summarize_queue'
      | 'review.suggest_safe_group_action'
      | 'review.apply_safe_group'
      | 'review.apply_item_decision'
    >()
    expectTypeOf<WorkspaceTaskKind>().toEqualTypeOf<
      'workspace.ask_memory' | 'workspace.compare' | 'workspace.publish_draft'
    >()
    expectTypeOf<GovernanceTaskKind>().toEqualTypeOf<
      'governance.record_feedback' | 'governance.summarize_failures' | 'governance.propose_policy_update'
    >()
  })

  it('models a persisted suggestion with executable task input payload', () => {
    const suggestion: AgentSuggestionRecord = {
      suggestionId: 'suggestion-1',
      triggerKind: 'governance.failed_runs_detected',
      status: 'suggested',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed_runs_detected::2026-03-30',
      sourceRunId: null,
      executedRunId: null,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      lastObservedAt: '2026-03-30T00:00:00.000Z'
    }

    const expectedStatus: AgentSuggestionStatus = 'suggested'

    expect(suggestion.status).toBe(expectedStatus)
    expect(suggestion).toMatchObject({
      triggerKind: 'governance.failed_runs_detected',
      status: 'suggested',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      }
    })
  })
})
