import type {
  AgentExecutionPreview,
  AgentRuntimeSettingsRecord,
  AgentSuggestionRecord,
  AgentRole,
  AgentPolicyVersionRecord,
  AgentRunDetail,
  AgentRunRecord,
  DismissAgentSuggestionInput,
  UpdateAgentRuntimeSettingsInput,
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
  getAgentRuntimeSettings,
  getAgentRun,
  incrementAgentSuggestionAttempt,
  getAgentSuggestion,
  listAgentMemories,
  listRunnableAgentSuggestions,
  listAgentSuggestions,
  listAgentPolicyVersions,
  listAgentRuns,
  upsertAgentRuntimeSettings,
  upsertAgentSuggestion,
  markAgentSuggestionExecuted,
  updateAgentRunReplayMetadata,
  updateAgentRunStatus
} from './agentPersistenceService'
import { canAutoRunAgentSuggestion } from './agentAutonomyPolicy'
import { evaluateAgentProactiveSuggestions } from './agentProactiveTriggerService'
import { deriveAgentSuggestionFollowups } from './agentSuggestionFollowupService'
import {
  computeSuggestionCooldownUntil,
  rankAgentSuggestions
} from './agentSuggestionRankingService'
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
  getRuntimeSettings(): AgentRuntimeSettingsRecord
  updateRuntimeSettings(input: UpdateAgentRuntimeSettingsInput): AgentRuntimeSettingsRecord
  refreshSuggestions(): AgentSuggestionRecord[]
  dismissSuggestion(input: DismissAgentSuggestionInput): AgentSuggestionRecord | null
  runSuggestion(input: RunAgentSuggestionInput): Promise<AgentRuntimeRunResult | null>
  runNextAutoRunnableSuggestion(): Promise<AgentRuntimeRunResult | null>
}

type CreateAgentRuntimeInput = {
  db: ArchiveDatabase
  adapters: AgentAdapter[]
}

function createRuntimeRun(
  db: ArchiveDatabase,
  input: RunAgentTaskInput,
  executionOrigin: 'operator_manual' | 'operator_suggestion' | 'auto_runner'
) {
  try {
    return createAgentRun(db, {
      role: input.role,
      taskKind: input.taskKind ?? null,
      prompt: input.prompt,
      confirmationToken: input.confirmationToken ?? null,
      executionOrigin,
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
      executionOrigin,
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

function persistFollowupSuggestions(db: ArchiveDatabase, input: {
  runId: string
  parentSuggestionId: string
}) {
  const followupSuggestions = deriveAgentSuggestionFollowups(db, {
    runId: input.runId,
    parentSuggestionId: input.parentSuggestionId
  })
  for (const followupSuggestion of followupSuggestions) {
    upsertAgentSuggestion(db, {
      triggerKind: followupSuggestion.triggerKind,
      role: followupSuggestion.role,
      taskKind: followupSuggestion.taskKind,
      taskInput: followupSuggestion.taskInput,
      dedupeKey: followupSuggestion.dedupeKey,
      sourceRunId: followupSuggestion.sourceRunId ?? null,
      priority: followupSuggestion.priority,
      rationale: followupSuggestion.rationale,
      autoRunnable: followupSuggestion.autoRunnable,
      followUpOfSuggestionId: followupSuggestion.followUpOfSuggestionId,
      cooldownUntil: followupSuggestion.cooldownUntil
    })
  }
}

export function createAgentRuntime(input: CreateAgentRuntimeInput): AgentRuntime {
  const executeTask = async (
    taskInput: RunAgentTaskInput,
    executionOrigin: 'operator_manual' | 'operator_suggestion' | 'auto_runner'
  ) => {
    let run = createRuntimeRun(input.db, taskInput, executionOrigin)
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
        status: 'completed' as const,
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
        status: 'failed' as const,
        targetRole,
        assignedRoles,
        latestAssistantResponse
      }
    }
  }

  const runPersistedSuggestion = async (inputSuggestion: AgentSuggestionRecord, runSuggestionInput: {
    confirmationToken?: string
    executionOrigin: 'operator_suggestion' | 'auto_runner'
  }) => {
    const taskInput = runSuggestionInput.confirmationToken
      ? { ...inputSuggestion.taskInput, confirmationToken: runSuggestionInput.confirmationToken }
      : inputSuggestion.taskInput
    const result = await executeTask(taskInput, runSuggestionInput.executionOrigin)

    if (result.status === 'completed') {
      markAgentSuggestionExecuted(input.db, {
        suggestionId: inputSuggestion.suggestionId,
        runId: result.runId
      })
    } else {
      incrementAgentSuggestionAttempt(input.db, {
        suggestionId: inputSuggestion.suggestionId,
        cooldownUntil: computeSuggestionCooldownUntil({
          taskKind: inputSuggestion.taskKind,
          attemptCount: inputSuggestion.attemptCount + 1,
          now: new Date().toISOString()
        })
      })
    }

    persistFollowupSuggestions(input.db, {
      runId: result.runId,
      parentSuggestionId: inputSuggestion.suggestionId
    })

    return result
  }

  return {
    previewTask(taskInput) {
      return previewAgentExecution(taskInput)
    },
    async runTask(taskInput) {
      return executeTask(taskInput, 'operator_manual')
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
    getRuntimeSettings() {
      return getAgentRuntimeSettings(input.db)
    },
    updateRuntimeSettings(runtimeSettingsInput) {
      return upsertAgentRuntimeSettings(input.db, runtimeSettingsInput)
    },
    refreshSuggestions() {
      const rankedSuggestions = rankAgentSuggestions(
        evaluateAgentProactiveSuggestions(input.db),
        {
          existingSuggestions: listAgentSuggestions(input.db),
          now: new Date().toISOString()
        }
      )

      return rankedSuggestions.map((suggestion) => upsertAgentSuggestion(input.db, {
        triggerKind: suggestion.triggerKind,
        role: suggestion.role,
        taskKind: suggestion.taskKind,
        taskInput: suggestion.taskInput,
        dedupeKey: suggestion.dedupeKey,
        sourceRunId: suggestion.sourceRunId ?? null,
        priority: suggestion.priority,
        rationale: suggestion.rationale,
        autoRunnable: suggestion.autoRunnable,
        followUpOfSuggestionId: suggestion.followUpOfSuggestionId,
        cooldownUntil: suggestion.cooldownUntil
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

      return runPersistedSuggestion(suggestion, {
        confirmationToken: runSuggestionInput.confirmationToken,
        executionOrigin: 'operator_suggestion'
      })
    },
    async runNextAutoRunnableSuggestion() {
      const settings = getAgentRuntimeSettings(input.db)
      const runnableSuggestions = listRunnableAgentSuggestions(input.db, {
        limit: 20
      })

      for (const suggestion of runnableSuggestions) {
        const preview = previewAgentExecution(suggestion.taskInput)
        if (!canAutoRunAgentSuggestion({
          autonomyMode: settings.autonomyMode,
          suggestion,
          requiresConfirmation: preview.requiresConfirmation
        })) {
          continue
        }

        return runPersistedSuggestion(suggestion, {
          executionOrigin: 'auto_runner'
        })
      }

      return null
    }
  }
}
