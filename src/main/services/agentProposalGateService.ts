import type {
  AgentMessageRecordV2,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentVoteRecord
} from '../../shared/archiveContracts'

export type EvaluateProposalStatusInput = {
  proposal: AgentProposalRecord
  votes: AgentVoteRecord[]
  hasBlockingChallenge: boolean
  operatorConfirmed: boolean
}

export type EvaluateProposalStatusResult = {
  status: AgentProposalStatus
  ownerApproved: boolean
  hasGovernanceVeto: boolean
  hasBlockingChallenge: boolean
}

export type EvaluateProposalGateInput = {
  proposal: Pick<AgentProposalRecord, 'ownerRole' | 'requiresOperatorConfirmation'> & {
    allowVetoBy?: AgentProposalRecord['allowVetoBy']
  }
  votes?: Array<Pick<AgentVoteRecord, 'voterRole' | 'vote'>>
  messages?: Array<Pick<AgentMessageRecordV2, 'kind' | 'blocking'>>
  hasBlockingChallenge?: boolean
  operatorConfirmed?: boolean
}

export function evaluateProposalGate(input: EvaluateProposalGateInput): EvaluateProposalStatusResult {
  const votes = input.votes ?? []
  const messages = input.messages ?? []
  const allowVetoBy = input.proposal.allowVetoBy ?? ['governance']
  const ownerApproved = votes.some((vote) => (
    vote.voterRole === input.proposal.ownerRole && vote.vote === 'approve'
  ))
  const hasGovernanceVeto = votes.some((vote) => (
    vote.voterRole === 'governance'
      && vote.vote === 'veto'
      && allowVetoBy.includes('governance')
  ))
  const hasBlockingChallenge = input.hasBlockingChallenge
    ?? messages.some((message) => message.kind === 'challenge' && message.blocking)

  if (hasGovernanceVeto) {
    return {
      status: 'vetoed',
      ownerApproved,
      hasGovernanceVeto,
      hasBlockingChallenge
    }
  }

  if (hasBlockingChallenge) {
    return {
      status: 'challenged',
      ownerApproved,
      hasGovernanceVeto,
      hasBlockingChallenge
    }
  }

  if (input.proposal.requiresOperatorConfirmation && ownerApproved) {
    return {
      status: input.operatorConfirmed ? 'committed' : 'awaiting_operator',
      ownerApproved,
      hasGovernanceVeto,
      hasBlockingChallenge
    }
  }

  if (ownerApproved) {
    return {
      status: 'committable',
      ownerApproved,
      hasGovernanceVeto,
      hasBlockingChallenge
    }
  }

  return {
    status: 'under_review',
    ownerApproved,
    hasGovernanceVeto,
    hasBlockingChallenge
  }
}

export function evaluateProposalStatus(input: EvaluateProposalStatusInput): EvaluateProposalStatusResult {
  return evaluateProposalGate({
    proposal: input.proposal,
    votes: input.votes,
    hasBlockingChallenge: input.hasBlockingChallenge,
    operatorConfirmed: input.operatorConfirmed
  })
}
