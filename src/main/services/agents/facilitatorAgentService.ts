import type {
  AgentCheckpointRecord,
  AgentCheckpointKind,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentObjectiveStatus,
  AgentProposalStatus,
  AgentRole,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentThreadStatus
} from '../../../shared/archiveContracts'
import {
  addThreadParticipants,
  createCheckpoint,
  createMainThread,
  createObjective
} from '../objectivePersistenceService'
import type { ArchiveDatabase } from '../db'

export type AcceptObjectiveInput = {
  db: ArchiveDatabase
  title: string
  objectiveKind: AgentObjectiveKind
  prompt: string
  initiatedBy?: AgentObjectiveInitiator
}

export type FacilitatedObjective = {
  objective: AgentObjectiveRecord
  mainThread: AgentThreadRecord
  participants: AgentThreadParticipantRecord[]
  checkpoints: AgentCheckpointRecord[]
}

type FacilitatorStopReason =
  | 'progress'
  | 'awaiting_operator'
  | 'stalled'
  | 'completed'

export type FacilitatorStopState = {
  reason: FacilitatorStopReason
  nextObjectiveStatus: AgentObjectiveStatus
  nextThreadStatus: AgentThreadStatus
  requiresOperatorInput: boolean
  checkpoint?: {
    checkpointKind: AgentCheckpointKind
    title: string
    summary: string
  }
}

function inferOwnerRole(objectiveKind: AgentObjectiveKind): AgentRole {
  switch (objectiveKind) {
    case 'review_decision':
      return 'review'
    case 'policy_change':
      return 'governance'
    case 'user_response':
    case 'publication':
    case 'evidence_investigation':
    default:
      return 'workspace'
  }
}

function inferInitialParticipants(objectiveKind: AgentObjectiveKind): AgentRole[] {
  switch (objectiveKind) {
    case 'review_decision':
      return ['review', 'workspace', 'governance']
    case 'policy_change':
      return ['governance', 'review']
    case 'publication':
      return ['workspace', 'governance']
    case 'user_response':
      return ['workspace', 'governance']
    case 'evidence_investigation':
    default:
      return ['workspace', 'review', 'governance', 'ingestion']
  }
}

function hasActiveProposal(status: AgentProposalStatus) {
  return [
    'open',
    'under_review',
    'challenged',
    'approved',
    'committable'
  ].includes(status)
}

export function createFacilitatorAgentService() {
  return {
    acceptObjective(input: AcceptObjectiveInput): FacilitatedObjective {
      const ownerRole = inferOwnerRole(input.objectiveKind)
      const participantRoles = inferInitialParticipants(input.objectiveKind)
      const objective = createObjective(input.db, {
        title: input.title,
        objectiveKind: input.objectiveKind,
        prompt: input.prompt,
        initiatedBy: input.initiatedBy ?? 'operator',
        ownerRole,
        status: 'in_progress'
      })
      const mainThread = createMainThread(input.db, {
        objectiveId: objective.objectiveId,
        ownerRole,
        title: `${input.title} · Main Thread`
      })
      const participants = addThreadParticipants(input.db, {
        objectiveId: objective.objectiveId,
        threadId: mainThread.threadId,
        participants: participantRoles.map((role) => ({
          participantKind: 'role',
          participantId: role,
          role,
          displayLabel: role
        }))
      })
      const goalAccepted = createCheckpoint(input.db, {
        objectiveId: objective.objectiveId,
        threadId: mainThread.threadId,
        checkpointKind: 'goal_accepted',
        title: 'Goal accepted',
        summary: `Facilitator accepted objective "${input.title}".`
      })
      const participantsInvited = createCheckpoint(input.db, {
        objectiveId: objective.objectiveId,
        threadId: mainThread.threadId,
        checkpointKind: 'participants_invited',
        title: 'Participants invited',
        summary: `Initial participants: ${participantRoles.join(', ')}.`
      })

      return {
        objective,
        mainThread,
        participants,
        checkpoints: [goalAccepted, participantsInvited]
      }
    },
    detectStall(input: {
      roundsWithoutProgress: number
      hasNewArtifacts: boolean
    }) {
      return input.roundsWithoutProgress >= 2 && !input.hasNewArtifacts
    },
    classifyStopState(input: {
      objective: Pick<AgentObjectiveRecord, 'status' | 'requiresOperatorInput'>
      thread: Pick<AgentThreadRecord, 'status'> & {
        proposals: Array<Pick<{ status: AgentProposalStatus }, 'status'>>
        checkpoints: Array<Pick<AgentCheckpointRecord, 'checkpointKind'>>
        messages: Array<Pick<{ kind: string }, 'kind'>>
      }
      roundsWithoutProgress: number
      hasNewArtifacts: boolean
    }): FacilitatorStopState {
      const hasAwaitingOperatorProposal = input.thread.proposals.some((proposal) => (
        proposal.status === 'awaiting_operator'
      ))
      if (hasAwaitingOperatorProposal) {
        return {
          reason: 'awaiting_operator',
          nextObjectiveStatus: 'awaiting_operator',
          nextThreadStatus: 'waiting',
          requiresOperatorInput: true
        }
      }

      const hasUserFacingResult = input.thread.checkpoints.some((checkpoint) => (
        checkpoint.checkpointKind === 'user_facing_result_prepared'
      )) || input.thread.messages.some((message) => message.kind === 'final_response')
      const hasActiveProposals = input.thread.proposals.some((proposal) => hasActiveProposal(proposal.status))

      if (!input.hasNewArtifacts && !hasActiveProposals && hasUserFacingResult) {
        return {
          reason: 'completed',
          nextObjectiveStatus: 'completed',
          nextThreadStatus: 'completed',
          requiresOperatorInput: false,
          checkpoint: {
            checkpointKind: 'user_facing_result_prepared',
            title: 'Objective completed',
            summary: 'Facilitator marked the objective complete after convergence on a user-facing result.'
          }
        }
      }

      if (this.detectStall({
        roundsWithoutProgress: input.roundsWithoutProgress,
        hasNewArtifacts: input.hasNewArtifacts
      })) {
        return {
          reason: 'stalled',
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
        reason: 'progress',
        nextObjectiveStatus: 'in_progress',
        nextThreadStatus: 'open',
        requiresOperatorInput: false
      }
    }
  }
}
