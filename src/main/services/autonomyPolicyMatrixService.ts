import type {
  AgentProposalAutonomyDecision,
  AgentProposalKind,
  AgentProposalRiskLevel
} from '../../shared/objectiveRuntimeContracts'

export type EvaluateAutonomyPolicyInput = {
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  boundaries?: {
    reversible?: boolean
    externalPublication?: boolean
    sensitiveExternalEgress?: boolean
  }
}

export type AutonomyPolicyEvaluation = {
  proposalRiskLevel: AgentProposalRiskLevel
  autonomyDecision: AgentProposalAutonomyDecision
  riskReasons: string[]
  confidenceScore: number | null
}

function resolveAutonomyDecision(proposalRiskLevel: AgentProposalRiskLevel): AgentProposalAutonomyDecision {
  switch (proposalRiskLevel) {
    case 'low':
      return 'auto_commit'
    case 'medium':
    case 'high':
      return 'auto_commit_with_audit'
    case 'critical':
    default:
      return 'await_operator'
  }
}

function isPublicDistributionBoundary(input: EvaluateAutonomyPolicyInput) {
  const destination = typeof input.payload.destination === 'string'
    ? input.payload.destination
    : null

  if (destination === 'public_share') {
    return true
  }

  return Boolean(input.boundaries?.externalPublication)
}

function isReversibleLocalStateChange(input: EvaluateAutonomyPolicyInput) {
  return [
    'approve_review_item',
    'reject_review_item',
    'approve_safe_group',
    'adopt_compare_recommendation',
    'rerun_enrichment',
    'respond_to_user',
    'create_policy_draft'
  ].includes(input.proposalKind)
}

function isExternalVerificationWorkflow(input: EvaluateAutonomyPolicyInput) {
  return [
    'search_web',
    'verify_external_claim'
  ].includes(input.proposalKind)
}

function isLocalReversibleWorkflow(input: EvaluateAutonomyPolicyInput) {
  if (input.proposalKind !== 'spawn_subagent') {
    return false
  }

  const specialization = typeof input.payload.specialization === 'string'
    ? input.payload.specialization
    : null

  return specialization !== null
}

export function evaluateAutonomyPolicy(input: EvaluateAutonomyPolicyInput): AutonomyPolicyEvaluation {
  if (
    input.proposalKind === 'publish_draft'
    || isPublicDistributionBoundary(input)
    || input.boundaries?.sensitiveExternalEgress
  ) {
    return {
      proposalRiskLevel: 'critical',
      autonomyDecision: resolveAutonomyDecision('critical'),
      riskReasons: [
        'policy_matrix_v1',
        'public_distribution_boundary',
        'critical_boundary',
        'critical_boundary_public_distribution'
      ],
      confidenceScore: 0.94
    }
  }

  if (isReversibleLocalStateChange(input)) {
    const proposalRiskLevel = input.proposalKind === 'approve_safe_group' ? 'high' : 'medium'

    return {
      proposalRiskLevel,
      autonomyDecision: resolveAutonomyDecision(proposalRiskLevel),
      riskReasons: ['policy_matrix_v1', 'reversible_local_state_change'],
      confidenceScore: 0.81
    }
  }

  if (isExternalVerificationWorkflow(input)) {
    return {
      proposalRiskLevel: 'high',
      autonomyDecision: resolveAutonomyDecision('high'),
      riskReasons: ['policy_matrix_v1', 'external_verification_boundary'],
      confidenceScore: 0.88
    }
  }

  if (isLocalReversibleWorkflow(input)) {
    return {
      proposalRiskLevel: 'low',
      autonomyDecision: resolveAutonomyDecision('low'),
      riskReasons: ['local_reversible_workflow'],
      confidenceScore: 0.9
    }
  }

  return {
    proposalRiskLevel: 'medium',
    autonomyDecision: resolveAutonomyDecision('medium'),
    riskReasons: ['policy_matrix_v1', 'default_runtime_assessment'],
    confidenceScore: null
  }
}
