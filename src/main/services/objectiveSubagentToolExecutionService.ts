import { authorizeToolRequest, resolveToolPolicy } from './toolBrokerService'
import {
  createToolExecution,
  updateToolExecution
} from './objectivePersistenceService'
import type {
  AgentArtifactRef,
  AgentRole,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type RemainingExecutionBudget = {
  maxRounds: number
  maxToolCalls: number
  timeoutMs: number
}

export function createObjectiveSubagentToolExecutionService(dependencies: {
  db: ArchiveDatabase
}) {
  const { db } = dependencies

  function asErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }

  function consumeExecutionRound(remainingBudget: RemainingExecutionBudget) {
    if (remainingBudget.maxRounds <= 0) {
      throw new Error('Remaining budget is exhausted.')
    }

    remainingBudget.maxRounds = Math.max(0, remainingBudget.maxRounds - 1)
  }

  async function runWithinBudgetTimeout<T>(timeoutMs: number, toolName: string, run: () => Promise<T>) {
    if (timeoutMs <= 0) {
      throw new Error('Remaining budget is exhausted.')
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      return await Promise.race([
        run(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Tool ${toolName} exceeded timeout budget.`))
          }, timeoutMs)
        })
      ])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  async function runAuthorizedTool<T>(input: {
    objectiveId: string
    threadId: string
    proposalId: string
    requestedByParticipantId: string
    role: AgentRole
    toolName: string
    toolPolicyId: string
    skillPackIds: readonly AgentSkillPackId[]
    remainingBudget: RemainingExecutionBudget
    inputPayload: Record<string, unknown>
    run: () => Promise<{
      result: T
      outputPayload: Record<string, unknown>
      artifactRefs?: AgentArtifactRef[]
    }>
  }) {
    const toolPolicy = resolveToolPolicy(input.toolPolicyId) ?? undefined
    const authorization = authorizeToolRequest({
      role: input.role,
      toolName: input.toolName,
      skillPackIds: [...input.skillPackIds],
      toolPolicy,
      remainingBudget: input.remainingBudget
    })

    if (authorization.status === 'blocked') {
      createToolExecution(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        requestedByParticipantId: input.requestedByParticipantId,
        toolName: input.toolName,
        toolPolicyId: input.toolPolicyId,
        status: 'blocked',
        inputPayload: input.inputPayload,
        outputPayload: {
          reason: authorization.reason
        },
        completedAt: new Date().toISOString()
      })
      throw new Error(authorization.reason)
    }

    const execution = createToolExecution(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: input.proposalId,
      requestedByParticipantId: input.requestedByParticipantId,
      toolName: input.toolName,
      toolPolicyId: input.toolPolicyId,
      status: 'authorized',
      inputPayload: input.inputPayload
    })

    try {
      const startedAt = Date.now()
      const outcome = await runWithinBudgetTimeout(
        input.remainingBudget.timeoutMs,
        input.toolName,
        input.run
      )
      const updated = updateToolExecution(db, {
        toolExecutionId: execution.toolExecutionId,
        status: 'completed',
        outputPayload: outcome.outputPayload,
        artifactRefs: outcome.artifactRefs ?? []
      })
      if (!updated) {
        throw new Error(`failed to complete tool execution: ${execution.toolExecutionId}`)
      }

      const elapsedMs = Date.now() - startedAt
      input.remainingBudget.timeoutMs = Math.max(0, input.remainingBudget.timeoutMs - elapsedMs)
      input.remainingBudget.maxToolCalls = Math.max(0, input.remainingBudget.maxToolCalls - 1)
      return outcome.result
    } catch (error) {
      updateToolExecution(db, {
        toolExecutionId: execution.toolExecutionId,
        status: 'failed',
        outputPayload: {
          message: asErrorMessage(error)
        }
      })
      throw error
    }
  }

  return {
    consumeExecutionRound,
    runAuthorizedTool
  }
}
