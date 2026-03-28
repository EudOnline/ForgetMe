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
})
