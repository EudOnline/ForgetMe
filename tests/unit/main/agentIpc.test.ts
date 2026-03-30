import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  openDatabase,
  runMigrations,
  listAgentMemories,
  listAgentPolicyVersions,
  createObjectiveRuntimeService,
  createFacilitatorAgentService,
  createExternalVerificationBrokerService,
  createExternalWebSearchService,
  createSubagentRegistryService
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listAgentMemories: vi.fn(),
  listAgentPolicyVersions: vi.fn(),
  createObjectiveRuntimeService: vi.fn(),
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

vi.mock('../../../src/main/services/agentPersistenceService', () => ({
  listAgentMemories,
  listAgentPolicyVersions
}))

vi.mock('../../../src/main/services/objectiveRuntimeService', () => ({
  createObjectiveRuntimeService
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
    listAgentMemories.mockReset()
    listAgentPolicyVersions.mockReset()
    createObjectiveRuntimeService.mockReset()
    createFacilitatorAgentService.mockReset()
    createExternalVerificationBrokerService.mockReset()
    createExternalWebSearchService.mockReset()
    createSubagentRegistryService.mockReset()
  })

  it('registers objective runtime handlers and omits obsolete run-centric handlers', async () => {
    registerAgentIpc(appPathsFixture())

    expect(handlerMap.has('archive:createAgentObjective')).toBe(true)
    expect(handlerMap.has('archive:listAgentObjectives')).toBe(true)
    expect(handlerMap.has('archive:getAgentObjective')).toBe(true)
    expect(handlerMap.has('archive:getAgentThread')).toBe(true)
    expect(handlerMap.has('archive:respondToAgentProposal')).toBe(true)
    expect(handlerMap.has('archive:confirmAgentProposal')).toBe(true)
    expect(handlerMap.has('archive:listAgentMemories')).toBe(true)
    expect(handlerMap.has('archive:listAgentPolicyVersions')).toBe(true)
    expect(handlerMap.has('archive:previewAgentTask')).toBe(false)
    expect(handlerMap.has('archive:runAgentTask')).toBe(false)
    expect(handlerMap.has('archive:listAgentRuns')).toBe(false)
    expect(handlerMap.has('archive:getAgentRun')).toBe(false)
    expect(handlerMap.has('archive:listAgentSuggestions')).toBe(false)
    expect(handlerMap.has('archive:refreshAgentSuggestions')).toBe(false)
    expect(handlerMap.has('archive:dismissAgentSuggestion')).toBe(false)
    expect(handlerMap.has('archive:runAgentSuggestion')).toBe(false)
    expect(handlerMap.has('archive:getAgentRuntimeSettings')).toBe(false)
    expect(handlerMap.has('archive:updateAgentRuntimeSettings')).toBe(false)
    expect(createObjectiveRuntimeService).not.toHaveBeenCalled()
    expect(listAgentMemories).not.toHaveBeenCalled()
    expect(listAgentPolicyVersions).not.toHaveBeenCalled()
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

  it('returns persisted memory and policy reads through the persistence service', async () => {
    const close = vi.fn()
    const db = { close }
    const memoriesResult = [
      {
        memoryId: 'memory-1',
        role: 'governance',
        memoryKey: 'governance.feedback',
        memoryValue: 'Prefer queue summaries first.',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z'
      }
    ]
    const policyVersionsResult = [
      {
        policyVersionId: 'policy-1',
        role: 'governance',
        policyKey: 'governance.review.policy',
        policyBody: 'Always summarize recent failures before proposing a new policy.',
        createdAt: '2026-03-29T00:00:02.000Z'
      }
    ]

    openDatabase.mockReturnValue(db)
    listAgentMemories.mockReturnValue(memoriesResult)
    listAgentPolicyVersions.mockReturnValue(policyVersionsResult)

    registerAgentIpc(appPathsFixture())

    const memories = await handlerMap.get('archive:listAgentMemories')?.({}, { role: 'governance' })
    const policyVersions = await handlerMap.get('archive:listAgentPolicyVersions')?.({}, {
      role: 'governance',
      policyKey: 'governance.review.policy'
    })

    expect(listAgentMemories).toHaveBeenCalledWith(db, { role: 'governance' })
    expect(listAgentPolicyVersions).toHaveBeenCalledWith(db, {
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    expect(memories).toEqual(memoriesResult)
    expect(policyVersions).toEqual(policyVersionsResult)
    expect(createObjectiveRuntimeService).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(2)
  })
})
