import type {
  AgentArtifactRef,
  AgentCheckpointRecord,
  AgentMessageRecordV2,
  AgentObjectiveStatus,
  AgentProposalRecord,
  AgentThreadStatus
} from '../../shared/archiveContracts'
import type {
  ObjectiveThreadState,
  ObjectiveThreadStateResult
} from './objectiveThreadStateService'
import { hasOperatorGatedProposal } from './objectiveAutonomySelectorsService'

export type FacilitatorPlannerAction =
  | 'continue_deliberation'
  | 'request_external_verification'
  | 'request_local_evidence_check'
  | 'spawn_specialist'
  | 'pause_for_operator'
  | 'compose_final_response'
  | 'mark_stalled'

export type FacilitatorPlanResult = {
  threadState: ObjectiveThreadState
  nextAction: FacilitatorPlannerAction
  nextObjectiveStatus: AgentObjectiveStatus
  nextThreadStatus: AgentThreadStatus
  requiresOperatorInput: boolean
  checkpoint?: {
    checkpointKind: AgentCheckpointRecord['checkpointKind']
    title: string
    summary: string
  }
}

type FacilitatorPlanningInput = {
  threadState: ObjectiveThreadStateResult
  thread: {
    proposals: Array<Pick<AgentProposalRecord, 'proposalKind' | 'status'>>
    checkpoints: Array<Pick<AgentCheckpointRecord, 'artifactRefs'>>
    messages: Array<Pick<AgentMessageRecordV2, 'refs'>>
  }
  roundsWithoutProgress: number
  hasNewArtifacts: boolean
}

function isActiveProposal(status: AgentProposalRecord['status']) {
  return [
    'open',
    'under_review',
    'challenged',
    'approved',
    'committable'
  ].includes(status)
}

function collectRecentArtifacts(input: FacilitatorPlanningInput['thread']): AgentArtifactRef[] {
  return [
    ...input.proposals.flatMap((proposal) => proposal.proposalKind === 'spawn_subagent' ? [] : []),
    ...input.checkpoints.flatMap((checkpoint) => checkpoint.artifactRefs ?? []),
    ...input.messages.flatMap((message) => message.refs ?? [])
  ]
}

function hasFileArtifact(artifacts: AgentArtifactRef[]) {
  return artifacts.some((artifact) => artifact.kind === 'file')
}

function hasActiveSpawnProposal(
  proposals: Array<Pick<AgentProposalRecord, 'proposalKind' | 'status'>>
) {
  return proposals.some((proposal) => (
    proposal.proposalKind === 'spawn_subagent'
    && isActiveProposal(proposal.status)
  ))
}

export function createObjectiveFacilitatorPlanningService() {
  return {
    planNextStep(input: FacilitatorPlanningInput): FacilitatorPlanResult {
      const artifacts = collectRecentArtifacts(input.thread)
      const activeSpawnProposal = hasActiveSpawnProposal(input.thread.proposals)
      const hasStaleOperatorGate = hasOperatorGatedProposal(input.thread.proposals)

      if (hasStaleOperatorGate) {
        return {
          threadState: 'awaiting_operator',
          nextAction: 'pause_for_operator',
          nextObjectiveStatus: 'awaiting_operator',
          nextThreadStatus: 'waiting',
          requiresOperatorInput: true
        }
      }

      switch (input.threadState.state) {
        case 'awaiting_operator':
          return {
            threadState: input.threadState.state,
            nextAction: 'pause_for_operator',
            nextObjectiveStatus: 'awaiting_operator',
            nextThreadStatus: 'waiting',
            requiresOperatorInput: true
          }
        case 'completed':
          return {
            threadState: input.threadState.state,
            nextAction: 'compose_final_response',
            nextObjectiveStatus: 'completed',
            nextThreadStatus: 'completed',
            requiresOperatorInput: false
          }
        case 'ready_to_converge':
          return {
            threadState: input.threadState.state,
            nextAction: 'compose_final_response',
            nextObjectiveStatus: 'completed',
            nextThreadStatus: 'completed',
            requiresOperatorInput: false,
            checkpoint: {
              checkpointKind: 'user_facing_result_prepared',
              title: 'Objective completed',
              summary: 'Facilitator marked the objective complete after convergence on a user-facing result.'
            }
          }
        case 'stalled':
          return {
            threadState: input.threadState.state,
            nextAction: 'mark_stalled',
            nextObjectiveStatus: 'stalled',
            nextThreadStatus: 'waiting',
            requiresOperatorInput: false,
            checkpoint: {
              checkpointKind: 'stalled',
              title: 'Objective stalled',
              summary: 'Facilitator paused deliberation after repeated idle rounds without new artifacts.'
            }
          }
        case 'conflict_unresolved':
          if (hasFileArtifact(artifacts)) {
            return {
              threadState: input.threadState.state,
              nextAction: 'request_local_evidence_check',
              nextObjectiveStatus: 'in_progress',
              nextThreadStatus: 'waiting',
              requiresOperatorInput: false,
              checkpoint: {
                checkpointKind: 'evidence_gap_detected',
                title: 'Local evidence review requested',
                summary: 'Conflicting evidence remains unresolved, so facilitator requested a local evidence review.'
              }
            }
          }

          return {
            threadState: input.threadState.state,
            nextAction: 'request_external_verification',
            nextObjectiveStatus: 'in_progress',
            nextThreadStatus: 'waiting',
            requiresOperatorInput: false,
            checkpoint: {
              checkpointKind: 'evidence_gap_detected',
              title: 'External verification requested',
              summary: 'Conflicting evidence remains unresolved, so facilitator requested stronger external verification.'
            }
          }
        case 'waiting_for_external_evidence':
          if (activeSpawnProposal) {
            return {
              threadState: input.threadState.state,
              nextAction: 'spawn_specialist',
              nextObjectiveStatus: 'in_progress',
              nextThreadStatus: 'waiting',
              requiresOperatorInput: false,
              checkpoint: {
                checkpointKind: 'evidence_gap_detected',
                title: 'Specialist follow-up pending',
                summary: 'Facilitator is waiting on a specialist follow-up before converging the thread.'
              }
            }
          }

          if (hasFileArtifact(artifacts)) {
            return {
              threadState: input.threadState.state,
              nextAction: 'request_local_evidence_check',
              nextObjectiveStatus: 'in_progress',
              nextThreadStatus: 'waiting',
              requiresOperatorInput: false,
              checkpoint: {
                checkpointKind: 'evidence_gap_detected',
                title: 'Local evidence review requested',
                summary: 'Facilitator requested local evidence review before relying on the external claim.'
              }
            }
          }

          return {
            threadState: input.threadState.state,
            nextAction: 'request_external_verification',
            nextObjectiveStatus: 'in_progress',
            nextThreadStatus: 'waiting',
            requiresOperatorInput: false,
            checkpoint: {
              checkpointKind: 'evidence_gap_detected',
              title: 'External verification requested',
              summary: 'Facilitator is waiting on external verification before converging the thread.'
            }
          }
        case 'awaiting_governance':
          return {
            threadState: input.threadState.state,
            nextAction: 'continue_deliberation',
            nextObjectiveStatus: 'in_progress',
            nextThreadStatus: 'open',
            requiresOperatorInput: false
          }
        case 'exploring':
        default:
          if (input.roundsWithoutProgress >= 2 && !input.hasNewArtifacts) {
            return {
              threadState: 'stalled',
              nextAction: 'mark_stalled',
              nextObjectiveStatus: 'stalled',
              nextThreadStatus: 'waiting',
              requiresOperatorInput: false,
              checkpoint: {
                checkpointKind: 'stalled',
                title: 'Objective stalled',
                summary: 'Facilitator paused deliberation after repeated idle rounds without new artifacts.'
              }
            }
          }

          return {
            threadState: input.threadState.state,
            nextAction: 'continue_deliberation',
            nextObjectiveStatus: 'in_progress',
            nextThreadStatus: 'open',
            requiresOperatorInput: false
          }
      }
    }
  }
}
