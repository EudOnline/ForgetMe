import crypto from 'node:crypto'
import type {
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentRole
} from '../../shared/archiveContracts'

export type ProposalCheckpointTransition =
  | 'raised'
  | 'challenged'
  | 'approved'
  | 'vetoed'
  | 'committed'

export type BuildProposalCheckpointInput = {
  objectiveId: string
  threadId: string
  proposalId: string
  ownerRole: AgentRole
  transition: ProposalCheckpointTransition
  createdAt?: string
}

const CHECKPOINT_KIND_BY_TRANSITION: Record<ProposalCheckpointTransition, AgentCheckpointKind> = {
  raised: 'proposal_raised',
  challenged: 'challenge_raised',
  approved: 'consensus_reached',
  vetoed: 'veto_issued',
  committed: 'committed'
}

const CHECKPOINT_TITLE_BY_TRANSITION: Record<ProposalCheckpointTransition, string> = {
  raised: 'Proposal raised',
  challenged: 'Challenge raised',
  approved: 'Consensus reached',
  vetoed: 'Veto issued',
  committed: 'Proposal committed'
}

export function buildProposalCheckpoint(input: BuildProposalCheckpointInput): AgentCheckpointRecord {
  return {
    checkpointId: crypto.randomUUID(),
    objectiveId: input.objectiveId,
    threadId: input.threadId,
    checkpointKind: CHECKPOINT_KIND_BY_TRANSITION[input.transition],
    title: CHECKPOINT_TITLE_BY_TRANSITION[input.transition],
    summary: `${input.ownerRole} proposal ${input.transition}.`,
    relatedMessageId: null,
    relatedProposalId: input.proposalId,
    artifactRefs: [],
    createdAt: input.createdAt ?? new Date().toISOString()
  }
}

export function createProposalCheckpoint(input: BuildProposalCheckpointInput) {
  return buildProposalCheckpoint(input)
}
