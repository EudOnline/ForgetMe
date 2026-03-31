import { buildProposalCheckpoint } from './agentCheckpointService'
import { evaluateProposalGate } from './agentProposalGateService'
import {
  createCheckpoint,
  createProposal,
  getProposal,
  getThreadDetail,
  updateProposalStatus,
  type CreateProposalInput
} from './objectivePersistenceService'
import type {
  AgentMessageKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

export type ObjectiveProposalRuntimeState = {
  proposal: AgentProposalRecord
  votes: AgentThreadDetail['votes']
  messages: AgentThreadDetail['messages']
}

export function createObjectiveRuntimeProposalStateService(dependencies: {
  db: ArchiveDatabase
}) {
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

  function loadProposalRuntimeState(proposalId: string): ObjectiveProposalRuntimeState {
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

  return {
    createProposalWithCheckpoint,
    loadProposalRuntimeState,
    updateProposalFromGate
  }
}
