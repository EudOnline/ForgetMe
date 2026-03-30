import type {
  AgentExecutionPreview,
  AgentSuggestionRecord,
  AgentRole,
  AgentPolicyVersionRecord,
  AgentRunDetail,
  AgentRunRecord,
  DismissAgentSuggestionInput,
  GetAgentRunInput,
  ListAgentMemoriesInput,
  ListAgentSuggestionsInput,
  ListAgentPolicyVersionsInput,
  ListAgentRunsInput,
  RunAgentSuggestionInput,
  RunAgentTaskInput,
  RunAgentTaskResult
} from '../../shared/archiveContracts'
import {
  appendAgentMessage,
  createAgentRun,
  dismissAgentSuggestion,
  getAgentRun,
  getAgentSuggestion,
  listAgentMemories,
  listAgentSuggestions,
  listAgentPolicyVersions,
  listAgentRuns,
  upsertAgentSuggestion,
  markAgentSuggestionExecuted,
  updateAgentRunReplayMetadata,
  updateAgentRunStatus
} from './agentPersistenceService'
import { evaluateAgentProactiveSuggestions } from './agentProactiveTriggerService'
import {
  inferAgentReplayMetadata,
  planAgentExecution,
  previewAgentExecution,
  summarizeAgentExecution
} from './agentOrchestratorService'
import type { AgentAdapter } from './agents/agentTypes'
import type { ArchiveDatabase } from './db'

export type AgentRuntimeRunResult = RunAgentTaskResult

export type AgentRuntime = {
  previewTask(input: RunAgentTaskInput): AgentExecutionPreview
  runTask(input: RunAgentTaskInput): Promise<AgentRuntimeRunResult>
  listRuns(input?: ListAgentRunsInput): AgentRunRecord[]
  getRun(input: GetAgentRunInput): AgentRunDetail | null
  listMemories(input?: ListAgentMemoriesInput): ReturnType<typeof listAgentMemories>
  listPolicyVersions(input?: ListAgentPolicyVersionsInput): AgentPolicyVersionRecord[]
  listSuggestions(input?: ListAgentSuggestionsInput): AgentSuggestionRecord[]
  refreshSuggestions(): AgentSuggestionRecord[]
  dismissSuggestion(input: DismissAgentSuggestionInput): AgentSuggestionRecord | null
  runSuggestion(input: RunAgentSuggestionInput): Promise<AgentRuntimeRunResult | null>
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
    previewTask(taskInput) {
      return previewAgentExecution(taskInput)
    },
    async runTask(taskInput) {
      let run = createRuntimeRun(input.db, taskInput)
      let assignedRoles: AgentRole[] = [taskInput.role]
      let targetRole: AgentRole | null = null
      let latestAssistantResponse: string | null = null

      try {
        const replayMetadata = inferAgentReplayMetadata(taskInput)
        assignedRoles = replayMetadata.assignedRoles
        targetRole = replayMetadata.targetRole
      } catch {
        // Keep defaults for invalid inputs where delegation cannot be inferred.
      }

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

        const replayRun = updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse: null
        })
        if (replayRun) {
          run = replayRun
        }

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

        const finalizedRun = updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse
        })
        if (finalizedRun) {
          run = finalizedRun
        }

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

        const replayRun = updateAgentRunReplayMetadata(input.db, {
          runId: run.runId,
          targetRole,
          assignedRoles,
          latestAssistantResponse
        })
        if (replayRun) {
          run = replayRun
        }

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
    },
    listPolicyVersions(policyInput = {}) {
      return listAgentPolicyVersions(input.db, policyInput)
    },
    listSuggestions(suggestionsInput = {}) {
      return listAgentSuggestions(input.db, suggestionsInput)
    },
    refreshSuggestions() {
      return evaluateAgentProactiveSuggestions(input.db).map((suggestion) => upsertAgentSuggestion(input.db, {
        triggerKind: suggestion.triggerKind,
        role: suggestion.role,
        taskKind: suggestion.taskKind,
        taskInput: suggestion.taskInput,
        dedupeKey: suggestion.dedupeKey,
        sourceRunId: suggestion.sourceRunId ?? null
      }))
    },
    dismissSuggestion(dismissInput) {
      return dismissAgentSuggestion(input.db, dismissInput)
    },
    async runSuggestion(runSuggestionInput) {
      const suggestion = getAgentSuggestion(input.db, { suggestionId: runSuggestionInput.suggestionId })
      if (!suggestion) {
        return null
      }

      const taskInput = runSuggestionInput.confirmationToken
        ? { ...suggestion.taskInput, confirmationToken: runSuggestionInput.confirmationToken }
        : suggestion.taskInput
      const result = await this.runTask(taskInput)

      if (result.status === 'completed') {
        markAgentSuggestionExecuted(input.db, {
          suggestionId: suggestion.suggestionId,
          runId: result.runId
        })
      }

      return result
    }
  }
}
