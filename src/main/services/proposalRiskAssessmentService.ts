import type { AgentArtifactRef, AgentProposalKind } from '../../shared/objectiveRuntimeContracts'
import {
  evaluateAutonomyPolicy,
  type AutonomyPolicyEvaluation
} from './autonomyPolicyMatrixService'

export type AssessProposalRiskInput = {
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  toolPolicyId?: string | null
  artifactRefs?: AgentArtifactRef[]
}

export type ProposalRiskAssessment = AutonomyPolicyEvaluation

export function assessProposalRisk(input: AssessProposalRiskInput): ProposalRiskAssessment {
  return evaluateAutonomyPolicy({
    proposalKind: input.proposalKind,
    payload: input.payload
  })
}
