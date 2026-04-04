import type {
  AgentObjectiveRecord,
  AgentProposalRecord
} from '../../shared/objectiveRuntimeContracts'

type ProposalOperatorSignal = Partial<Pick<AgentProposalRecord, 'autonomyDecision' | 'proposalRiskLevel' | 'requiresOperatorConfirmation'>>
type ProposalStatusSignal = Pick<AgentProposalRecord, 'status'>
type ObjectiveOperatorSignal = Pick<AgentObjectiveRecord, 'status' | 'requiresOperatorInput'>

function hasStructuredProposalOperatorSignals(
  proposal: Partial<ProposalOperatorSignal>
): proposal is Pick<AgentProposalRecord, 'autonomyDecision' | 'proposalRiskLevel'> & Partial<Pick<AgentProposalRecord, 'requiresOperatorConfirmation'>> {
  return typeof proposal.autonomyDecision === 'string'
    && typeof proposal.proposalRiskLevel === 'string'
}

export function proposalHasCriticalBoundary(proposal: Pick<AgentProposalRecord, 'proposalRiskLevel'>) {
  return proposal.proposalRiskLevel === 'critical'
}

export function proposalNeedsOperator(proposal: ProposalOperatorSignal) {
  if (hasStructuredProposalOperatorSignals(proposal)) {
    return proposalHasCriticalBoundary(proposal)
      || proposal.autonomyDecision === 'await_operator'
  }

  return Boolean(proposal.requiresOperatorConfirmation)
}

export function proposalIsAutoCommittable(
  proposal: Pick<AgentProposalRecord, 'status'> & ProposalOperatorSignal
) {
  return proposal.status === 'committable' && !proposalNeedsOperator(proposal)
}

export function hasOperatorGatedProposal(
  proposals: Array<ProposalStatusSignal & Partial<ProposalOperatorSignal>>
) {
  return proposals.some((proposal) => (
    proposal.status === 'awaiting_operator'
    || proposalNeedsOperator(proposal)
  ))
}

export function objectiveNeedsOperator(
  objective: ObjectiveOperatorSignal,
  proposals: Array<ProposalStatusSignal & Partial<ProposalOperatorSignal>> = []
) {
  return objective.requiresOperatorInput
    || objective.status === 'awaiting_operator'
    || hasOperatorGatedProposal(proposals)
}
