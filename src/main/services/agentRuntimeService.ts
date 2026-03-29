import type {
  AgentRole,
  AgentRunDetail,
  AgentRunRecord,
  GetAgentRunInput,
  ListAgentMemoriesInput,
  ListAgentRunsInput,
  RunAgentTaskInput,
  RunAgentTaskResult
} from '../../shared/archiveContracts'
import {
  appendAgentMessage,
  createAgentRun,
  getAgentRun,
  listAgentMemories,
  listAgentRuns,
  updateAgentRunReplayMetadata,
  updateAgentRunStatus
} from './agentPersistenceService'
import { planAgentExecution, summarizeAgentExecution } from './agentOrchestratorService'
import type { AgentAdapter } from './agents/agentTypes'
import type { ArchiveDatabase } from './db'

export type AgentRuntimeRunResult = RunAgentTaskResult

export type AgentRuntime = {
  runTask(input: RunAgentTaskInput): Promise<AgentRuntimeRunResult>
  listRuns(input?: ListAgentRunsInput): AgentRunRecord[]
  getRun(input: GetAgentRunInput): AgentRunDetail | null
  listMemories(input?: ListAgentMemoriesInput): ReturnType<typeof listAgentMemories>
}

type CreateAgentRuntimeInput = {
  db: ArchiveDatabase
  adapters: AgentAdapter[]
}

function createRuntimeRun(db: ArchiveDatabase, input: RunAgentTaskInput) {
  try {
    return createAgentRun(db, {
      role: input.role,
      taskKind: input.taskKind ?? null,
      prompt: input.prompt,
      confirmationToken: input.confirmationToken ?? null,
      status: 'running'
    })
  } catch (error) {
    if (!(error instanceof Error) || !/task kind/i.test(error.message)) {
      throw error
    }

    return createAgentRun(db, {
      role: input.role,
      prompt: input.prompt,
      confirmationToken: input.confirmationToken ?? null,
      status: 'running'
    })
  }
}

function appendMessages(db: ArchiveDatabase, runId: string, messages: Array<{ sender: 'system' | 'user' | 'tool' | 'agent'; content: string }>) {
  for (const message of messages) {
    appendAgentMessage(db, {
      runId,
      sender: message.sender,
      content: message.content
    })
  }
}

export function createAgentRuntime(input: CreateAgentRuntimeInput): AgentRuntime {
  return {
    async runTask(taskInput) {
      const run = createRuntimeRun(input.db, taskInput)
      let assignedRoles: AgentRole[] = [taskInput.role]
      let targetRole: AgentRole | null = null
      let latestAssistantResponse: string | null = null

      appendMessages(input.db, run.runId, [
        {
          sender: 'user',
          content: taskInput.prompt
        }
      ])

      try {
        const plan = planAgentExecution(taskInput)
        assignedRoles = plan.assignedRoles
        targetRole = plan.targetRole

        updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse: null
        })

        appendMessages(input.db, run.runId, plan.messages)

        const adapter = input.adapters.find((item) => item.role === plan.targetRole && item.canHandle(plan.taskKind))
        if (!adapter) {
          throw new Error(`No agent adapter registered for task kind "${plan.taskKind}"`)
        }

        const result = await adapter.execute({
          db: input.db,
          run,
          input: taskInput,
          taskKind: plan.taskKind,
          assignedRoles
        })

        appendMessages(input.db, run.runId, result.messages ?? [])

        const latestAgentMessage = [...(result.messages ?? [])]
          .reverse()
          .find((message) => message.sender === 'agent')
        if (latestAgentMessage?.content) {
          latestAssistantResponse = latestAgentMessage.content
        } else {
          latestAssistantResponse = summarizeAgentExecution(plan, result)
          appendMessages(input.db, run.runId, [
            {
              sender: 'agent',
              content: latestAssistantResponse
            }
          ])
        }

        updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse
        })

        updateAgentRunStatus(input.db, {
          runId: run.runId,
          status: 'completed'
        })

        return {
          runId: run.runId,
          status: 'completed',
          targetRole,
          assignedRoles,
          latestAssistantResponse
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'agent runtime failed'

        appendMessages(input.db, run.runId, [
          {
            sender: 'system',
            content: `Run failed: ${errorMessage}`
          }
        ])

        updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse
        })

        updateAgentRunStatus(input.db, {
          runId: run.runId,
          status: 'failed',
          errorMessage
        })

        return {
          runId: run.runId,
          status: 'failed',
          targetRole,
          assignedRoles,
          latestAssistantResponse
        }
      }
    },
    listRuns(listInput = {}) {
      return listAgentRuns(input.db, listInput)
    },
    getRun(runInput) {
      return getAgentRun(input.db, runInput)
    },
    listMemories(memoryInput = {}) {
      return listAgentMemories(input.db, memoryInput)
    }
  }
}
