import crypto from 'node:crypto'
import type {
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentProposalRecord,
  AgentProposalStatus
} from '../../shared/archiveContracts'

export type ProposalCheckpointTransition =
  | 'raised'
  | 'challenged'
  | 'approved'
  | 'vetoed'
  | 'awaiting_operator'
  | 'committed'
  | 'blocked'

type LegacyBuildProposalCheckpointInput = {
  objectiveId: string
  threadId: string
  proposalId: string
  ownerRole: AgentProposalRecord['ownerRole']
  transition: ProposalCheckpointTransition
  createdAt?: string
}

type ProposalStatusBuildCheckpointInput = {
  proposal: Pick<
    AgentProposalRecord,
    'proposalId' | 'objectiveId' | 'threadId' | 'ownerRole' | 'proposalKind'
  >
  nextStatus: AgentProposalStatus
  messageId?: string
  createdAt?: string
}

export type BuildProposalCheckpointInput =
  | LegacyBuildProposalCheckpointInput
  | ProposalStatusBuildCheckpointInput

const CHECKPOINT_KIND_BY_TRANSITION: Record<ProposalCheckpointTransition, AgentCheckpointKind> = {
  raised: 'proposal_raised',
  challenged: 'challenge_raised',
  approved: 'consensus_reached',
  vetoed: 'veto_issued',
  awaiting_operator: 'awaiting_operator_confirmation',
  committed: 'committed',
  blocked: 'blocked'
}

const CHECKPOINT_TITLE_BY_TRANSITION: Record<ProposalCheckpointTransition, string> = {
  raised: 'Proposal raised',
  challenged: 'Challenge raised',
  approved: 'Consensus reached',
  vetoed: 'Veto issued',
  awaiting_operator: 'Awaiting operator confirmation',
  committed: 'Proposal committed',
  blocked: 'Proposal blocked'
}

function transitionFromStatus(status: AgentProposalStatus): ProposalCheckpointTransition {
  switch (status) {
    case 'under_review':
    case 'open':
      return 'raised'
    case 'challenged':
      return 'challenged'
    case 'approved':
    case 'committable':
      return 'approved'
    case 'vetoed':
      return 'vetoed'
    case 'awaiting_operator':
      return 'awaiting_operator'
    case 'committed':
      return 'committed'
    case 'blocked':
      return 'blocked'
    default:
      return 'raised'
  }
}

function normalizeInput(input: BuildProposalCheckpointInput) {
  if ('proposal' in input) {
    return {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      proposalId: input.proposal.proposalId,
      ownerRole: input.proposal.ownerRole,
      proposalKind: input.proposal.proposalKind,
      messageId: input.messageId ?? null,
      transition: transitionFromStatus(input.nextStatus),
      createdAt: input.createdAt ?? new Date().toISOString()
    }
  }

  return {
    objectiveId: input.objectiveId,
    threadId: input.threadId,
    proposalId: input.proposalId,
    ownerRole: input.ownerRole,
    proposalKind: 'respond_to_user' as const,
    messageId: null,
    transition: input.transition,
    createdAt: input.createdAt ?? new Date().toISOString()
  }
}

export function buildProposalCheckpoint(input: BuildProposalCheckpointInput): AgentCheckpointRecord {
  const normalized = normalizeInput(input)

  return {
    checkpointId: crypto.randomUUID(),
    objectiveId: normalized.objectiveId,
    threadId: normalized.threadId,
    checkpointKind: CHECKPOINT_KIND_BY_TRANSITION[normalized.transition],
    title: CHECKPOINT_TITLE_BY_TRANSITION[normalized.transition],
    summary: `${normalized.ownerRole} proposal ${normalized.proposalKind} is ${normalized.transition.replaceAll('_', ' ')}.`,
    relatedMessageId: normalized.messageId,
    relatedProposalId: normalized.proposalId,
    artifactRefs: [],
    createdAt: normalized.createdAt
  }
}

export function createProposalCheckpoint(input: BuildProposalCheckpointInput) {
  return buildProposalCheckpoint(input)
}
