import type {
  AgentCheckpointRecord,
  AgentMessageRecordV2,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentRole,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentVoteRecord
} from '../../../shared/archiveContracts'
import {
  addThreadParticipants,
  createCheckpoint,
  createMainThread,
  createObjective
} from '../objectivePersistenceService'
import type { ArchiveDatabase } from '../db'
import { createObjectiveFacilitatorPlanningService } from '../objectiveFacilitatorPlanningService'
import { createObjectiveThreadStateService } from '../objectiveThreadStateService'

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

export function createFacilitatorAgentService() {
  const threadStateService = createObjectiveThreadStateService()
  const planningService = createObjectiveFacilitatorPlanningService()

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
    planNextStep(input: {
      objective: Pick<AgentObjectiveRecord, 'status' | 'requiresOperatorInput'>
      thread: Pick<AgentThreadRecord, 'status'> & {
        proposals: Array<Pick<AgentProposalRecord, 'proposalKind' | 'status'>>
        votes: Array<Pick<AgentVoteRecord, 'voterRole' | 'vote'>>
        checkpoints: Array<Pick<AgentCheckpointRecord, 'checkpointKind' | 'summary' | 'artifactRefs'>>
        messages: Array<Pick<AgentMessageRecordV2, 'kind' | 'fromParticipantId' | 'blocking' | 'refs'>>
      }
      roundsWithoutProgress: number
      hasNewArtifacts: boolean
    }) {
      const threadState = threadStateService.classifyThreadState(input)
      const plan = planningService.planNextStep({
        threadState,
        thread: input.thread,
        roundsWithoutProgress: input.roundsWithoutProgress,
        hasNewArtifacts: input.hasNewArtifacts
      })

      return plan
    }
  }
}
