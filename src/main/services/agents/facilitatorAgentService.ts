import type {
  AgentCheckpointRecord,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentRole,
  AgentThreadParticipantRecord,
  AgentThreadRecord
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
    }
  }
}
