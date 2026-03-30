import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  openDatabase,
  runMigrations,
  createAgentRuntime,
  createObjectiveRuntimeService,
  createIngestionAgentService,
  createReviewAgentService,
  createWorkspaceAgentService,
  createGovernanceAgentService,
  createFacilitatorAgentService,
  createExternalVerificationBrokerService,
  createExternalWebSearchService,
  createSubagentRegistryService
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  createAgentRuntime: vi.fn(),
  createObjectiveRuntimeService: vi.fn(),
  createIngestionAgentService: vi.fn(),
  createReviewAgentService: vi.fn(),
  createWorkspaceAgentService: vi.fn(),
  createGovernanceAgentService: vi.fn(),
  createFacilitatorAgentService: vi.fn(),
  createExternalVerificationBrokerService: vi.fn(),
  createExternalWebSearchService: vi.fn(),
  createSubagentRegistryService: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: vi.fn((channel: string) => {
      handlerMap.delete(channel)
    }),
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlerMap.set(channel, handler)
    })
  }
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/agentRuntimeService', () => ({
  createAgentRuntime
}))

vi.mock('../../../src/main/services/objectiveRuntimeService', () => ({
  createObjectiveRuntimeService
}))

vi.mock('../../../src/main/services/agents/ingestionAgentService', () => ({
  createIngestionAgentService
}))

vi.mock('../../../src/main/services/agents/reviewAgentService', () => ({
  createReviewAgentService
}))

vi.mock('../../../src/main/services/agents/workspaceAgentService', () => ({
  createWorkspaceAgentService
}))

vi.mock('../../../src/main/services/agents/governanceAgentService', () => ({
  createGovernanceAgentService
}))

vi.mock('../../../src/main/services/agents/facilitatorAgentService', () => ({
  createFacilitatorAgentService
}))

vi.mock('../../../src/main/services/externalVerificationBrokerService', () => ({
  createExternalVerificationBrokerService
}))

vi.mock('../../../src/main/services/externalWebSearchService', () => ({
  createExternalWebSearchService
}))

vi.mock('../../../src/main/services/subagentRegistryService', () => ({
  createSubagentRegistryService
}))

import { registerAgentIpc } from '../../../src/main/ipc/agentIpc'

function appPathsFixture(): AppPaths {
  return {
    root: '/tmp/forgetme',
    sqliteDir: '/tmp/forgetme/sqlite',
    vaultDir: '/tmp/forgetme/vault',
    vaultOriginalsDir: '/tmp/forgetme/vault/originals',
    importReportsDir: '/tmp/forgetme/reports',
    preservationReportsDir: '/tmp/forgetme/preservation-reports'
  }
}

describe('registerAgentIpc', () => {
  beforeEach(() => {
    handlerMap.clear()
    openDatabase.mockReset()
    runMigrations.mockReset()
    createAgentRuntime.mockReset()
    createObjectiveRuntimeService.mockReset()
    createIngestionAgentService.mockReset()
    createReviewAgentService.mockReset()
    createWorkspaceAgentService.mockReset()
    createGovernanceAgentService.mockReset()
    createFacilitatorAgentService.mockReset()
    createExternalVerificationBrokerService.mockReset()
    createExternalWebSearchService.mockReset()
    createSubagentRegistryService.mockReset()
  })

  it('registers agent runtime handlers and wires runAgentTask through the runtime', async () => {
    const close = vi.fn()
    const db = { close }
    const ingestionAdapter = { role: 'ingestion' }
    const reviewAdapter = { role: 'review' }
    const workspaceAdapter = { role: 'workspace' }
    const governanceAdapter = { role: 'governance' }
    const runtime = {
      previewTask: vi.fn().mockReturnValue({
        taskKind: 'review.apply_item_decision',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        requiresConfirmation: true
      }),
      runTask: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'completed',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      }),
      listRuns: vi.fn(),
      getRun: vi.fn(),
      listMemories: vi.fn(),
      listPolicyVersions: vi.fn(),
      listSuggestions: vi.fn(),
      refreshSuggestions: vi.fn(),
      dismissSuggestion: vi.fn(),
      runSuggestion: vi.fn(),
      getRuntimeSettings: vi.fn(),
      updateRuntimeSettings: vi.fn(),
      runNextAutoRunnableSuggestion: vi.fn()
    }

    openDatabase.mockReturnValue(db)
    createIngestionAgentService.mockReturnValue(ingestionAdapter)
    createReviewAgentService.mockReturnValue(reviewAdapter)
    createWorkspaceAgentService.mockReturnValue(workspaceAdapter)
    createGovernanceAgentService.mockReturnValue(governanceAdapter)
    createAgentRuntime.mockReturnValue(runtime)

    registerAgentIpc(appPathsFixture())

    expect(handlerMap.has('archive:runAgentTask')).toBe(true)
    expect(handlerMap.has('archive:previewAgentTask')).toBe(true)
    expect(handlerMap.has('archive:listAgentRuns')).toBe(true)
    expect(handlerMap.has('archive:getAgentRun')).toBe(true)
    expect(handlerMap.has('archive:listAgentMemories')).toBe(true)
    expect(handlerMap.has('archive:listAgentPolicyVersions')).toBe(true)
    expect(handlerMap.has('archive:listAgentSuggestions')).toBe(true)
    expect(handlerMap.has('archive:refreshAgentSuggestions')).toBe(true)
    expect(handlerMap.has('archive:dismissAgentSuggestion')).toBe(true)
    expect(handlerMap.has('archive:runAgentSuggestion')).toBe(true)
    expect(handlerMap.has('archive:getAgentRuntimeSettings')).toBe(true)
    expect(handlerMap.has('archive:updateAgentRuntimeSettings')).toBe(true)

    const result = await handlerMap.get('archive:runAgentTask')?.({}, {
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalledWith(db)
    expect(createIngestionAgentService).toHaveBeenCalledTimes(1)
    expect(createReviewAgentService).toHaveBeenCalledTimes(1)
    expect(createWorkspaceAgentService).toHaveBeenCalledTimes(1)
    expect(createGovernanceAgentService).toHaveBeenCalledTimes(1)
    expect(createAgentRuntime).toHaveBeenCalledWith({
      db,
      adapters: [ingestionAdapter, reviewAdapter, workspaceAdapter, governanceAdapter]
    })
    expect(runtime.runTask).toHaveBeenCalledWith({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    expect(result).toEqual({
      runId: 'run-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })
    expect(close).toHaveBeenCalled()
  })

  it('registers objective runtime handlers and exposes proposal response flows', async () => {
    const close = vi.fn()
    const db = { close }
    const facilitator = { role: 'facilitator' }
    const externalVerificationBroker = { role: 'external-verification-broker' }
    const externalWebSearch = {
      searchWeb: vi.fn(),
      openSourcePage: vi.fn()
    }
    const subagentRegistry = { role: 'subagent-registry' }
    const objectiveDetail = {
      objectiveId: 'objective-1',
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      status: 'in_progress',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      mainThreadId: 'thread-main-1',
      riskLevel: 'medium',
      budget: null,
      requiresOperatorInput: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      threads: [
        {
          threadId: 'thread-main-1',
          objectiveId: 'objective-1',
          parentThreadId: null,
          threadKind: 'main',
          ownerRole: 'workspace',
          title: 'Verify an external claim before responding · Main Thread',
          status: 'open',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          closedAt: null
        }
      ],
      participants: [
        {
          threadParticipantId: 'participant-workspace',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          participantKind: 'role',
          participantId: 'workspace',
          role: 'workspace',
          displayLabel: 'workspace',
          invitedByParticipantId: null,
          joinedAt: '2026-03-30T00:00:00.000Z',
          leftAt: null
        }
      ],
      proposals: [
        {
          proposalId: 'proposal-1',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          proposedByParticipantId: 'workspace',
          proposalKind: 'verify_external_claim',
          payload: {
            claim: 'The external source confirms the announcement date.'
          },
          ownerRole: 'workspace',
          status: 'awaiting_operator',
          requiredApprovals: ['workspace'],
          allowVetoBy: ['governance'],
          requiresOperatorConfirmation: true,
          toolPolicyId: 'tool-policy-web-1',
          budget: {
            maxRounds: 2,
            maxToolCalls: 3,
            timeoutMs: 30_000
          },
          derivedFromMessageIds: [],
          artifactRefs: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          committedAt: null
        }
      ],
      checkpoints: [
        {
          checkpointId: 'checkpoint-1',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          checkpointKind: 'goal_accepted',
          title: 'Goal accepted',
          summary: 'Facilitator accepted objective.',
          relatedMessageId: null,
          relatedProposalId: null,
          artifactRefs: [],
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ],
      subagents: []
    }
    const threadDetail = {
      ...objectiveDetail.threads[0],
      participants: objectiveDetail.participants,
      messages: [
        {
          messageId: 'message-1',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          fromParticipantId: 'workspace',
          toParticipantId: null,
          kind: 'goal',
          body: 'Check the source before we answer the user.',
          refs: [],
          replyToMessageId: null,
          round: 1,
          confidence: null,
          blocking: false,
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ],
      proposals: objectiveDetail.proposals,
      votes: [],
      checkpoints: objectiveDetail.checkpoints,
      subagents: []
    }
    const objectiveRuntime = {
      startObjective: vi.fn().mockReturnValue({
        objective: {
          objectiveId: 'objective-1'
        }
      }),
      listObjectives: vi.fn().mockReturnValue([
        {
          objectiveId: 'objective-1',
          title: 'Verify an external claim before responding',
          objectiveKind: 'evidence_investigation',
          status: 'in_progress',
          prompt: 'Check the source before we answer the user.',
          initiatedBy: 'operator',
          ownerRole: 'workspace',
          mainThreadId: 'thread-main-1',
          riskLevel: 'medium',
          budget: null,
          requiresOperatorInput: false,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z'
        }
      ]),
      getObjectiveDetail: vi.fn().mockReturnValue(objectiveDetail),
      getThreadDetail: vi.fn().mockReturnValue(threadDetail),
      respondToAgentProposal: vi.fn().mockReturnValue({
        ...objectiveDetail.proposals[0],
        status: 'challenged',
        updatedAt: '2026-03-30T00:01:00.000Z'
      }),
      confirmAgentProposal: vi.fn().mockReturnValue({
        ...objectiveDetail.proposals[0],
        status: 'committed',
        committedAt: '2026-03-30T00:02:00.000Z',
        updatedAt: '2026-03-30T00:02:00.000Z'
      })
    }

    openDatabase.mockReturnValue(db)
    createFacilitatorAgentService.mockReturnValue(facilitator)
    createExternalWebSearchService.mockReturnValue(externalWebSearch)
    createExternalVerificationBrokerService.mockReturnValue(externalVerificationBroker)
    createSubagentRegistryService.mockReturnValue(subagentRegistry)
    createObjectiveRuntimeService.mockReturnValue(objectiveRuntime)

    registerAgentIpc(appPathsFixture())

    expect(handlerMap.has('archive:createAgentObjective')).toBe(true)
    expect(handlerMap.has('archive:listAgentObjectives')).toBe(true)
    expect(handlerMap.has('archive:getAgentObjective')).toBe(true)
    expect(handlerMap.has('archive:getAgentThread')).toBe(true)
    expect(handlerMap.has('archive:respondToAgentProposal')).toBe(true)
    expect(handlerMap.has('archive:confirmAgentProposal')).toBe(true)

    const created = await handlerMap.get('archive:createAgentObjective')?.({}, {
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })
    const objectives = await handlerMap.get('archive:listAgentObjectives')?.({}, {
      ownerRole: 'workspace',
      limit: 10
    })
    const detail = await handlerMap.get('archive:getAgentObjective')?.({}, {
      objectiveId: 'objective-1'
    })
    const thread = await handlerMap.get('archive:getAgentThread')?.({}, {
      threadId: 'thread-main-1'
    })
    const challenged = await handlerMap.get('archive:respondToAgentProposal')?.({}, {
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })
    const confirmed = await handlerMap.get('archive:confirmAgentProposal')?.({}, {
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })

    expect(createFacilitatorAgentService).toHaveBeenCalledTimes(6)
    expect(createExternalWebSearchService).toHaveBeenCalledTimes(6)
    expect(createExternalVerificationBrokerService).toHaveBeenCalledTimes(6)
    expect(createExternalVerificationBrokerService).toHaveBeenCalledWith({
      searchWeb: externalWebSearch.searchWeb,
      openSourcePage: externalWebSearch.openSourcePage
    })
    expect(createSubagentRegistryService).toHaveBeenCalledTimes(6)
    expect(createObjectiveRuntimeService).toHaveBeenCalledWith({
      db,
      facilitator,
      externalVerificationBroker,
      subagentRegistry
    })
    expect(objectiveRuntime.startObjective).toHaveBeenCalledWith({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })
    expect(objectiveRuntime.listObjectives).toHaveBeenCalledWith({
      ownerRole: 'workspace',
      limit: 10
    })
    expect(objectiveRuntime.getObjectiveDetail).toHaveBeenCalledWith({
      objectiveId: 'objective-1'
    })
    expect(objectiveRuntime.getThreadDetail).toHaveBeenCalledWith({
      threadId: 'thread-main-1'
    })
    expect(objectiveRuntime.respondToAgentProposal).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })
    expect(objectiveRuntime.confirmAgentProposal).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })
    expect(created).toEqual(objectiveDetail)
    expect(objectives).toEqual([
      expect.objectContaining({
        objectiveId: 'objective-1',
        ownerRole: 'workspace'
      })
    ])
    expect(detail).toEqual(objectiveDetail)
    expect(thread).toEqual(threadDetail)
    expect(challenged).toEqual(expect.objectContaining({
      proposalId: 'proposal-1',
      status: 'challenged'
    }))
    expect(confirmed).toEqual(expect.objectContaining({
      proposalId: 'proposal-1',
      status: 'committed'
    }))
    expect(close).toHaveBeenCalledTimes(6)
  })

  it('returns persisted run and memory reads through the runtime', async () => {
    const close = vi.fn()
    const db = { close }
    const runtime = {
      runTask: vi.fn(),
      previewTask: vi.fn().mockReturnValue({
        taskKind: 'review.apply_item_decision',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        requiresConfirmation: true
      }),
      listRuns: vi.fn().mockReturnValue([
        {
          runId: 'run-1',
          role: 'review',
          taskKind: 'review.summarize_queue',
          targetRole: 'review',
          assignedRoles: ['orchestrator', 'review'],
          latestAssistantResponse: '1 pending items across 1 conflict groups.',
          status: 'completed',
          prompt: 'Summarize queue',
          confirmationToken: null,
          policyVersion: null,
          errorMessage: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ]),
      getRun: vi.fn().mockReturnValue({
        runId: 'run-1',
        role: 'review',
        taskKind: 'review.summarize_queue',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.',
        status: 'completed',
        prompt: 'Summarize queue',
        confirmationToken: null,
        policyVersion: null,
        errorMessage: null,
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
        messages: []
      }),
      listMemories: vi.fn().mockReturnValue([
        {
          memoryId: 'memory-1',
          role: 'governance',
          memoryKey: 'governance.feedback',
          memoryValue: 'Prefer queue summaries first.',
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ]),
      listPolicyVersions: vi.fn().mockReturnValue([
        {
          policyVersionId: 'policy-1',
          role: 'governance',
          policyKey: 'governance.review.policy',
          policyBody: 'Always summarize recent failures before proposing a new policy.',
          createdAt: '2026-03-29T00:00:02.000Z'
        }
      ]),
      listSuggestions: vi.fn().mockReturnValue([
        {
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
          dedupeKey: 'governance.failed-runs::latest',
          sourceRunId: null,
          executedRunId: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          lastObservedAt: '2026-03-30T00:00:00.000Z'
        }
      ]),
      refreshSuggestions: vi.fn().mockReturnValue([
        {
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
          dedupeKey: 'governance.failed-runs::latest',
          sourceRunId: null,
          executedRunId: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          lastObservedAt: '2026-03-30T00:00:00.000Z'
        }
      ]),
      dismissSuggestion: vi.fn().mockReturnValue({
        suggestionId: 'suggestion-1',
        triggerKind: 'governance.failed_runs_detected',
        status: 'dismissed',
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        taskInput: {
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          prompt: 'Summarize failed agent runs from the proactive monitor.'
        },
        dedupeKey: 'governance.failed-runs::latest',
        sourceRunId: null,
        executedRunId: null,
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:05.000Z',
        lastObservedAt: '2026-03-30T00:00:00.000Z'
      }),
      runSuggestion: vi.fn().mockResolvedValue({
        runId: 'run-from-suggestion-1',
        status: 'completed',
        targetRole: 'governance',
        assignedRoles: ['governance'],
        latestAssistantResponse: 'Failures summarized.'
      }),
      getRuntimeSettings: vi.fn().mockReturnValue({
        settingsId: 'default',
        autonomyMode: 'manual_only',
        updatedAt: '2026-03-30T00:00:00.000Z'
      }),
      updateRuntimeSettings: vi.fn().mockReturnValue({
        settingsId: 'default',
        autonomyMode: 'suggest_safe_auto_run',
        updatedAt: '2026-03-30T00:05:00.000Z'
      }),
      runNextAutoRunnableSuggestion: vi.fn()
    }

    openDatabase.mockReturnValue(db)
    createIngestionAgentService.mockReturnValue({ role: 'ingestion' })
    createReviewAgentService.mockReturnValue({ role: 'review' })
    createWorkspaceAgentService.mockReturnValue({ role: 'workspace' })
    createGovernanceAgentService.mockReturnValue({ role: 'governance' })
    createAgentRuntime.mockReturnValue(runtime)

    registerAgentIpc(appPathsFixture())

    const preview = await handlerMap.get('archive:previewAgentTask')?.({}, {
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    const runs = await handlerMap.get('archive:listAgentRuns')?.({}, { role: 'review', limit: 5 })
    const detail = await handlerMap.get('archive:getAgentRun')?.({}, { runId: 'run-1' })
    const memories = await handlerMap.get('archive:listAgentMemories')?.({}, { role: 'governance' })
    const policyVersions = await handlerMap.get('archive:listAgentPolicyVersions')?.({}, {
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    const suggestions = await handlerMap.get('archive:listAgentSuggestions')?.({}, {
      role: 'governance',
      status: 'suggested',
      limit: 10
    })
    const refreshedSuggestions = await handlerMap.get('archive:refreshAgentSuggestions')?.({}, undefined)
    const dismissed = await handlerMap.get('archive:dismissAgentSuggestion')?.({}, {
      suggestionId: 'suggestion-1'
    })
    const runSuggestionResult = await handlerMap.get('archive:runAgentSuggestion')?.({}, {
      suggestionId: 'suggestion-1',
      confirmationToken: 'confirm-1'
    })
    const runtimeSettings = await handlerMap.get('archive:getAgentRuntimeSettings')?.({}, undefined)
    const updatedRuntimeSettings = await handlerMap.get('archive:updateAgentRuntimeSettings')?.({}, {
      autonomyMode: 'suggest_safe_auto_run'
    })

    expect(runtime.previewTask).toHaveBeenCalledWith({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    expect(runtime.listRuns).toHaveBeenCalledWith({ role: 'review', limit: 5 })
    expect(runtime.getRun).toHaveBeenCalledWith({ runId: 'run-1' })
    expect(runtime.listMemories).toHaveBeenCalledWith({ role: 'governance' })
    expect(runtime.listPolicyVersions).toHaveBeenCalledWith({
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    expect(runtime.listSuggestions).toHaveBeenCalledWith({
      role: 'governance',
      status: 'suggested',
      limit: 10
    })
    expect(runtime.refreshSuggestions).toHaveBeenCalledWith()
    expect(runtime.dismissSuggestion).toHaveBeenCalledWith({
      suggestionId: 'suggestion-1'
    })
    expect(runtime.runSuggestion).toHaveBeenCalledWith({
      suggestionId: 'suggestion-1',
      confirmationToken: 'confirm-1'
    })
    expect(runtime.getRuntimeSettings).toHaveBeenCalledWith()
    expect(runtime.updateRuntimeSettings).toHaveBeenCalledWith({
      autonomyMode: 'suggest_safe_auto_run'
    })
    expect(runs).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        role: 'review',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      })
    ])
    expect(detail).toEqual(expect.objectContaining({
      runId: 'run-1',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.',
      messages: []
    }))
    expect(memories).toEqual([
      expect.objectContaining({
        memoryId: 'memory-1',
        role: 'governance'
      })
    ])
    expect(policyVersions).toEqual([
      expect.objectContaining({
        policyVersionId: 'policy-1',
        role: 'governance',
        policyKey: 'governance.review.policy'
      })
    ])
    expect(suggestions).toEqual([
      expect.objectContaining({
        suggestionId: 'suggestion-1',
        status: 'suggested',
        role: 'governance'
      })
    ])
    expect(refreshedSuggestions).toEqual([
      expect.objectContaining({
        suggestionId: 'suggestion-1',
        status: 'suggested',
        role: 'governance'
      })
    ])
    expect(dismissed).toEqual(expect.objectContaining({
      suggestionId: 'suggestion-1',
      status: 'dismissed'
    }))
    expect(runSuggestionResult).toEqual({
      runId: 'run-from-suggestion-1',
      status: 'completed',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: 'Failures summarized.'
    })
    expect(runtimeSettings).toEqual({
      settingsId: 'default',
      autonomyMode: 'manual_only',
      updatedAt: '2026-03-30T00:00:00.000Z'
    })
    expect(updatedRuntimeSettings).toEqual({
      settingsId: 'default',
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:05:00.000Z'
    })
    expect(close).toHaveBeenCalledTimes(11)
  })
})
