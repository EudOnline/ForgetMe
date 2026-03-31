import { evaluateProposalGate } from './agentProposalGateService'
import { listAgentPolicyVersions } from './agentPersistenceService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { createObjectiveRuntimeDeliberationService } from './objectiveRuntimeDeliberationService'
import { createObjectiveRuntimeProposalStateService } from './objectiveRuntimeProposalStateService'
import { createObjectiveSubagentExecutionService } from './objectiveSubagentExecutionService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentObjectiveDetail,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/archiveContracts'
import {
  appendAgentMessageV2,
  listObjectives,
  getObjectiveDetail,
  getProposal,
  getThreadDetail,
  recordProposalVote,
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

  const proposalStateService = createObjectiveRuntimeProposalStateService({
    db
  })

  const deliberationService = createObjectiveRuntimeDeliberationService({
    db,
    roleAgentRegistry: dependencies.roleAgentRegistry,
    subagentRegistry: dependencies.subagentRegistry,
    nextRound,
    appendRuntimeMessage,
    createProposalWithCheckpoint: proposalStateService.createProposalWithCheckpoint
  })

  const subagentExecutionService = createObjectiveSubagentExecutionService({
    db,
    externalVerificationBroker: dependencies.externalVerificationBroker,
    subagentRegistry: dependencies.subagentRegistry,
    runMemoryWorkspaceCompare: dependencies.runMemoryWorkspaceCompare,
    askMemoryWorkspacePersisted: dependencies.askMemoryWorkspacePersisted,
    listAgentPolicyVersions: dependencies.listAgentPolicyVersions,
    helpers: {
      appendRuntimeMessage,
      createProposalWithCheckpoint: proposalStateService.createProposalWithCheckpoint,
      loadProposalRuntimeState: proposalStateService.loadProposalRuntimeState,
      updateProposalFromGate: proposalStateService.updateProposalFromGate
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

      await deliberationService.deliberateThread({
        threadId: started.mainThread.threadId
      })

      return started
    },

    createProposal(input: Omit<CreateProposalInput, 'status'> & {
      status?: CreateProposalInput['status']
    }) {
      return proposalStateService.createProposalWithCheckpoint({
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
      const runtimeState = proposalStateService.loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: [...runtimeState.messages, challengeMessage]
      })
      return proposalStateService.updateProposalFromGate({
        proposalId: input.proposalId,
        nextStatus: gate.status,
        messageId: challengeMessage.messageId
      })
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
      const runtimeState = proposalStateService.loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = runtimeState.proposal.allowVetoBy.includes('governance')
        ? 'vetoed'
        : gate.status

      return proposalStateService.updateProposalFromGate({
        proposalId: input.proposalId,
        nextStatus
      })
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

      const runtimeState = proposalStateService.loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      return proposalStateService.updateProposalFromGate({
        proposalId: input.proposalId,
        nextStatus: gate.status
      })
    },

    listObjectives(input?: ListAgentObjectivesInput) {
      return listObjectives(db, input)
    },

    getThreadDetail(input: {
      threadId: string
    }): AgentThreadDetail | null {
      return getThreadDetail(db, input)
    },

    deliberateThread: deliberationService.deliberateThread,

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

      const runtimeState = proposalStateService.loadProposalRuntimeState(proposal.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = input.response === 'reject'
        ? 'blocked'
        : gate.status

      const updated = proposalStateService.updateProposalFromGate({
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

      const runtimeState = proposalStateService.loadProposalRuntimeState(proposal.proposalId)
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

      const updated = proposalStateService.updateProposalFromGate({
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
