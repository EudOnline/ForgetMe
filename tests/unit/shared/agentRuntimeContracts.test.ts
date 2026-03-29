import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AgentMemoryRecord,
  AgentRunDetail,
  AgentRunRecord,
  ArchiveApi,
  GetAgentRunInput,
  ListAgentMemoriesInput,
  ListAgentRunsInput,
  RunAgentTaskInput,
  RunAgentTaskResult
} from '../../../src/shared/archiveContracts'
import {
  getAgentRunInputSchema,
  listAgentMemoriesInputSchema,
  listAgentRunsInputSchema,
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
  })

  it('constrains task kinds by role in TypeScript contracts', () => {
    type OrchestratorTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'orchestrator' }>['taskKind'], undefined>
    type IngestionTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'ingestion' }>['taskKind'], undefined>
    type ReviewTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'review' }>['taskKind'], undefined>
    type WorkspaceTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'workspace' }>['taskKind'], undefined>
    type GovernanceTaskKind = Exclude<Extract<RunAgentTaskInput, { role: 'governance' }>['taskKind'], undefined>

    expectTypeOf<OrchestratorTaskKind>().toEqualTypeOf<'orchestrator.plan_next_action'>()
    expectTypeOf<IngestionTaskKind>().toEqualTypeOf<'ingestion.import_batch'>()
    expectTypeOf<ReviewTaskKind>().toEqualTypeOf<'review.apply_safe_group' | 'review.apply_item_decision'>()
    expectTypeOf<WorkspaceTaskKind>().toEqualTypeOf<'workspace.ask_memory'>()
    expectTypeOf<GovernanceTaskKind>().toEqualTypeOf<'governance.propose_policy_update'>()
  })
})
