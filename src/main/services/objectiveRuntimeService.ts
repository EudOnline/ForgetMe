import { evaluateProposalGate } from './agentProposalGateService'
import { buildProposalCheckpoint } from './agentCheckpointService'
import { listAgentPolicyVersions } from './agentPersistenceService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { createObjectiveSubagentExecutionService } from './objectiveSubagentExecutionService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalStatus,
  AgentRole,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/archiveContracts'
import {
  appendAgentMessageV2,
  createCheckpoint,
  listObjectives,
  createProposal,
  getObjectiveDetail,
  getProposal,
  getThreadDetail,
  recordProposalVote,
  updateProposalStatus,
  type AgentObjectiveDetail,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'
import type { createFacilitatorAgentService } from './agents/facilitatorAgentService'
import type { createRoleAgentRegistryService } from './agents/roleAgentRegistryService'

type FacilitatorService = ReturnType<typeof createFacilitatorAgentService>
type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type RoleAgentRegistryService = ReturnType<typeof createRoleAgentRegistryService>
type RunMemoryWorkspaceCompareService = typeof runMemoryWorkspaceCompare
type AskMemoryWorkspacePersistedService = typeof askMemoryWorkspacePersisted
type ListAgentPolicyVersionsService = typeof listAgentPolicyVersions

export type ObjectiveRuntimeDependencies = {
  db: ArchiveDatabase
  facilitator: FacilitatorService
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
  roleAgentRegistry?: RoleAgentRegistryService | null
  runMemoryWorkspaceCompare?: RunMemoryWorkspaceCompareService
  askMemoryWorkspacePersisted?: AskMemoryWorkspacePersistedService
  listAgentPolicyVersions?: ListAgentPolicyVersionsService
}

export function createObjectiveRuntimeService(dependencies: ObjectiveRuntimeDependencies) {
  const { db } = dependencies

  function createProposalWithCheckpoint(input: CreateProposalInput) {
    const proposal = createProposal(db, input)
    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus: proposal.status,
      createdAt: proposal.createdAt
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })

    return proposal
  }

  function loadProposalRuntimeState(proposalId: string) {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const threadDetail = getThreadDetail(db, { threadId: proposal.threadId })
    if (!threadDetail) {
      throw new Error(`thread not found: ${proposal.threadId}`)
    }

    return {
      proposal,
      votes: threadDetail.votes.filter((vote) => vote.proposalId === proposalId),
      messages: threadDetail.messages
    }
  }

  function writeStatusCheckpoint(proposalId: string, nextStatus: ReturnType<typeof evaluateProposalGate>['status'], messageId?: string) {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus,
      messageId
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })
  }

  function updateProposalFromGate(input: {
    proposalId: string
    nextStatus: AgentProposalStatus
    messageId?: string
  }) {
    const updated = updateProposalStatus(db, {
      proposalId: input.proposalId,
      status: input.nextStatus
    })
    if (!updated) {
      throw new Error(`failed to update proposal: ${input.proposalId}`)
    }

    writeStatusCheckpoint(input.proposalId, input.nextStatus, input.messageId)

    return updated
  }

  function nextRound(threadId: string) {
    const detail = getThreadDetail(db, { threadId })
    const lastRound = detail?.messages.at(-1)?.round ?? 0
    return lastRound + 1
  }

  function appendRuntimeMessage(input: {
    objectiveId: string
    threadId: string
    fromParticipantId: string
    toParticipantId?: string | null
    kind: AgentMessageKind
    body: string
    refs?: AgentArtifactRef[]
    blocking?: boolean
    confidence?: number | null
  }) {
    return appendAgentMessageV2(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      kind: input.kind,
      body: input.body,
      refs: input.refs,
      round: nextRound(input.threadId),
      blocking: input.blocking,
      confidence: input.confidence
    })
  }

  function stableJson(value: unknown) {
    return JSON.stringify(value)
  }

  function objectiveRecordFromDetail(detail: AgentObjectiveDetail) {
    return {
      objectiveId: detail.objectiveId,
      title: detail.title,
      objectiveKind: detail.objectiveKind,
      status: detail.status,
      prompt: detail.prompt,
      initiatedBy: detail.initiatedBy,
      ownerRole: detail.ownerRole,
      mainThreadId: detail.mainThreadId,
      riskLevel: detail.riskLevel,
      budget: detail.budget,
      requiresOperatorInput: detail.requiresOperatorInput,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt
    }
  }

  function hasEquivalentMessage(input: {
    thread: AgentThreadDetail
    fromParticipantId: string
    kind: AgentThreadDetail['messages'][number]['kind']
    body: string
    toParticipantId?: string | null
    blocking?: boolean
  }) {
    return input.thread.messages.some((message) => (
      message.fromParticipantId === input.fromParticipantId
      && message.toParticipantId === (input.toParticipantId ?? null)
      && message.kind === input.kind
      && message.body === input.body
      && message.blocking === Boolean(input.blocking)
    ))
  }

  function hasEquivalentProposal(input: {
    thread: AgentThreadDetail
    proposedByParticipantId: string
    proposalKind: CreateProposalInput['proposalKind']
    ownerRole: AgentRole
    payload: Record<string, unknown>
  }) {
    const payloadJson = stableJson(input.payload)

    return input.thread.proposals.some((proposal) => (
      proposal.proposedByParticipantId === input.proposedByParticipantId
      && proposal.proposalKind === input.proposalKind
      && proposal.ownerRole === input.ownerRole
      && stableJson(proposal.payload) === payloadJson
      && proposal.status !== 'blocked'
      && proposal.status !== 'superseded'
    ))
  }

  async function deliberateThread(input: {
    threadId: string
  }) {
    if (!dependencies.roleAgentRegistry) {
      const thread = getThreadDetail(db, { threadId: input.threadId })
      if (!thread) {
        throw new Error(`thread not found: ${input.threadId}`)
      }

      const objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId })
      if (!objective) {
        throw new Error(`objective not found: ${thread.objectiveId}`)
      }

      return {
        objective,
        thread
      }
    }

    let thread = getThreadDetail(db, { threadId: input.threadId })
    if (!thread) {
      throw new Error(`thread not found: ${input.threadId}`)
    }

    let objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId })
    if (!objective) {
      throw new Error(`objective not found: ${thread.objectiveId}`)
    }

    for (const participant of thread.participants) {
      if (participant.participantKind !== 'role' || participant.leftAt !== null || !participant.role) {
        continue
      }

      const adapter = dependencies.roleAgentRegistry.get(participant.role)
      if (!adapter?.receive) {
        continue
      }

      const receiveResult = await adapter.receive({
        db,
        objective: objectiveRecordFromDetail(objective),
        thread,
        participantId: participant.participantId,
        messages: thread.messages,
        proposals: thread.proposals,
        round: nextRound(thread.threadId)
      })

      for (const messageDraft of receiveResult.messages) {
        if (hasEquivalentMessage({
          thread,
          fromParticipantId: participant.participantId,
          kind: messageDraft.kind,
          body: messageDraft.body,
          toParticipantId: messageDraft.toParticipantId,
          blocking: messageDraft.blocking
        })) {
          continue
        }

        appendRuntimeMessage({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          fromParticipantId: participant.participantId,
          toParticipantId: messageDraft.toParticipantId,
          kind: messageDraft.kind,
          body: messageDraft.body,
          refs: messageDraft.refs,
          blocking: messageDraft.blocking,
          confidence: messageDraft.confidence
        })
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective

      for (const proposalDraft of receiveResult.proposals ?? []) {
        if (hasEquivalentProposal({
          thread,
          proposedByParticipantId: participant.participantId,
          proposalKind: proposalDraft.proposalKind,
          ownerRole: proposalDraft.ownerRole,
          payload: proposalDraft.payload
        })) {
          continue
        }

        createProposalWithCheckpoint({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          proposedByParticipantId: participant.participantId,
          proposalKind: proposalDraft.proposalKind,
          payload: proposalDraft.payload,
          ownerRole: proposalDraft.ownerRole,
          requiredApprovals: proposalDraft.requiredApprovals,
          allowVetoBy: proposalDraft.allowVetoBy,
          requiresOperatorConfirmation: proposalDraft.requiresOperatorConfirmation,
          toolPolicyId: proposalDraft.toolPolicyId,
          budget: proposalDraft.budget,
          artifactRefs: proposalDraft.artifactRefs,
          status: 'under_review'
        })
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective

      for (const spawnRequest of receiveResult.spawnRequests ?? []) {
        const spawnSpec = dependencies.subagentRegistry.buildSpawnSubagentSpec({
          specialization: spawnRequest.specialization,
          payload: spawnRequest.payload
        })

        if (hasEquivalentProposal({
          thread,
          proposedByParticipantId: participant.participantId,
          proposalKind: 'spawn_subagent',
          ownerRole: spawnRequest.ownerRole,
          payload: spawnSpec.payload
        })) {
          continue
        }

        createProposalWithCheckpoint({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          proposedByParticipantId: participant.participantId,
          proposalKind: 'spawn_subagent',
          payload: spawnSpec.payload,
          ownerRole: spawnRequest.ownerRole,
          requiredApprovals: spawnRequest.requiredApprovals,
          allowVetoBy: spawnRequest.allowVetoBy,
          requiresOperatorConfirmation: spawnRequest.requiresOperatorConfirmation,
          toolPolicyId: spawnRequest.toolPolicyId ?? spawnSpec.toolPolicyId,
          budget: spawnRequest.budget ?? spawnSpec.budget,
          artifactRefs: spawnRequest.artifactRefs,
          status: 'under_review'
        })

        thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
        objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective
    }

    return {
      objective,
      thread
    }
  }

  const subagentExecutionService = createObjectiveSubagentExecutionService({
    db,
    externalVerificationBroker: dependencies.externalVerificationBroker,
    subagentRegistry: dependencies.subagentRegistry,
    runMemoryWorkspaceCompare: dependencies.runMemoryWorkspaceCompare,
    askMemoryWorkspacePersisted: dependencies.askMemoryWorkspacePersisted,
    listAgentPolicyVersions: dependencies.listAgentPolicyVersions,
    helpers: {
      appendRuntimeMessage,
      createProposalWithCheckpoint,
      loadProposalRuntimeState,
      updateProposalFromGate
    }
  })

  return {
    async startObjective(input: {
      title: string
      objectiveKind: Parameters<FacilitatorService['acceptObjective']>[0]['objectiveKind']
      prompt: string
      initiatedBy?: Parameters<FacilitatorService['acceptObjective']>[0]['initiatedBy']
    }) {
      const started = dependencies.facilitator.acceptObjective({
        db,
        title: input.title,
        objectiveKind: input.objectiveKind,
        prompt: input.prompt,
        initiatedBy: input.initiatedBy
      })

      await deliberateThread({
        threadId: started.mainThread.threadId
      })

      return started
    },

    createProposal(input: Omit<CreateProposalInput, 'status'> & {
      status?: CreateProposalInput['status']
    }) {
      return createProposalWithCheckpoint({
        ...input,
        requiredApprovals: input.requiredApprovals ?? [input.ownerRole],
        allowVetoBy: input.allowVetoBy ?? ['governance'],
        status: input.status ?? 'under_review'
      })
    },

    raiseBlockingChallenge(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      fromParticipantId: string
      body: string
    }) {
      const challengeMessage = appendAgentMessageV2(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        fromParticipantId: input.fromParticipantId,
        kind: 'challenge',
        body: input.body,
        round: 1,
        blocking: true
      })
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: [...runtimeState.messages, challengeMessage]
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status, challengeMessage.messageId)

      return updated
    },

    vetoProposal(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      rationale: string
    }) {
      recordProposalVote(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        voterRole: 'governance',
        vote: 'veto',
        comment: input.rationale
      })
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = runtimeState.proposal.allowVetoBy.includes('governance')
        ? 'vetoed'
        : gate.status
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: nextStatus
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, nextStatus)

      return updated
    },

    async requestExternalVerification(input: {
      objectiveId: string
      threadId: string
      proposedByParticipantId: string
      claim: string
      query: string
    }) {
      return subagentExecutionService.requestExternalVerification(input)
    },

    approveProposalAsOwner(input: {
      objectiveId: string
      threadId: string
      proposalId: string
    }) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        throw new Error(`proposal not found: ${input.proposalId}`)
      }

      recordProposalVote(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        voterRole: proposal.ownerRole,
        vote: 'approve',
        comment: 'Owner approved the proposal.'
      })

      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status)

      return updated
    },

    listObjectives(input?: ListAgentObjectivesInput) {
      return listObjectives(db, input)
    },

    getThreadDetail(input: {
      threadId: string
    }): AgentThreadDetail | null {
      return getThreadDetail(db, input)
    },

    deliberateThread,

    async respondToAgentProposal(input: RespondToAgentProposalInput) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        return null
      }

      if (input.response === 'challenge') {
        return this.raiseBlockingChallenge({
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          proposalId: proposal.proposalId,
          fromParticipantId: input.responderRole,
          body: input.comment ?? `${input.responderRole} raised a blocking challenge.`
        })
      }

      recordProposalVote(db, {
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        proposalId: proposal.proposalId,
        voterRole: input.responderRole,
        vote: input.response,
        comment: input.comment,
        artifactRefs: input.artifactRefs
      })

      const runtimeState = loadProposalRuntimeState(proposal.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = input.response === 'reject'
        ? 'blocked'
        : gate.status

      const updated = updateProposalFromGate({
        proposalId: proposal.proposalId,
        nextStatus
      })

      return subagentExecutionService.autoCommitEligibleSpawnSubagentProposal(updated)
    },

    async confirmAgentProposal(input: ConfirmAgentProposalInput) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        return null
      }

      const runtimeState = loadProposalRuntimeState(proposal.proposalId)
      const decisionMessage = input.operatorNote
        ? appendAgentMessageV2(db, {
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          fromParticipantId: 'operator',
          kind: 'decision',
          body: input.operatorNote,
          round: (runtimeState.messages.at(-1)?.round ?? 0) + 1,
          blocking: input.decision === 'block'
        })
        : null
      const nextStatus = input.decision === 'block'
        ? 'blocked'
        : evaluateProposalGate({
          proposal: runtimeState.proposal,
          votes: runtimeState.votes,
          messages: runtimeState.messages,
          operatorConfirmed: true
        }).status

      const updated = updateProposalFromGate({
        proposalId: proposal.proposalId,
        nextStatus,
        messageId: decisionMessage?.messageId
      })

      if (updated.status === 'committed') {
        await subagentExecutionService.executeCommittedSpawnSubagentProposal(updated)
      }

      return updated
    },

    getObjectiveDetail(input: {
      objectiveId: string
    }): AgentObjectiveDetail | null {
      return getObjectiveDetail(db, input)
    }
  }
}
