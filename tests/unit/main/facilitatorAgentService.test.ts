import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createFacilitatorAgentService } from '../../../src/main/services/agents/facilitatorAgentService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-facilitator-runtime-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('facilitator agent service', () => {
  it('creates an objective main thread and initial participant list for review deliberation', () => {
    const db = setupDatabase()
    const facilitator = createFacilitatorAgentService()

    const created = facilitator.acceptObjective({
      db,
      title: 'Review whether this candidate can be approved safely',
      objectiveKind: 'review_decision',
      prompt: 'Decide whether approval is safe and whether we need more evidence.',
      initiatedBy: 'operator'
    })

    expect(created.objective.status).toBe('in_progress')
    expect(created.mainThread.threadKind).toBe('main')
    expect(created.participants.map((participant) => participant.role)).toEqual([
      'review',
      'workspace',
      'governance'
    ])
    expect(created.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toEqual([
      'goal_accepted',
      'participants_invited'
    ])

    db.close()
  })

  it('includes ingestion alongside workspace, review, and governance for evidence investigations', () => {
    const db = setupDatabase()
    const facilitator = createFacilitatorAgentService()

    const created = facilitator.acceptObjective({
      db,
      title: 'Investigate local and external evidence together',
      objectiveKind: 'evidence_investigation',
      prompt: 'Review file-evidence-1 locally and verify the public claim.',
      initiatedBy: 'operator'
    })

    expect(created.participants.map((participant) => participant.role)).toEqual([
      'workspace',
      'review',
      'governance',
      'ingestion'
    ])

    db.close()
  })

  it('plans an awaiting-operator handoff when a proposal requires operator confirmation', () => {
    const facilitator = createFacilitatorAgentService() as any

    const result = facilitator.planNextStep({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [
          {
            status: 'awaiting_operator'
          }
        ],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      threadState: 'awaiting_operator',
      nextAction: 'pause_for_operator',
      nextObjectiveStatus: 'awaiting_operator',
      nextThreadStatus: 'waiting',
      requiresOperatorInput: true
    }))
  })

  it('plans a stalled checkpoint after two idle rounds without new artifacts', () => {
    const facilitator = createFacilitatorAgentService() as any

    const result = facilitator.planNextStep({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 2,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      threadState: 'stalled',
      nextAction: 'mark_stalled',
      nextObjectiveStatus: 'stalled',
      nextThreadStatus: 'waiting',
      requiresOperatorInput: false,
      checkpoint: expect.objectContaining({
        checkpointKind: 'stalled'
      })
    }))
  })

  it('plans convergence completion after a user-facing result exists', () => {
    const facilitator = createFacilitatorAgentService() as any

    const result = facilitator.planNextStep({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [
          {
            status: 'committed'
          }
        ],
        checkpoints: [
          {
            checkpointKind: 'user_facing_result_prepared'
          }
        ],
        messages: []
      },
      roundsWithoutProgress: 1,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      threadState: 'ready_to_converge',
      nextAction: 'compose_final_response',
      nextObjectiveStatus: 'completed',
      nextThreadStatus: 'completed',
      requiresOperatorInput: false
    }))
  })
})
