import { describe, expect, it } from 'vitest'
import { createObjectiveFacilitatorPlanningService } from '../../../src/main/services/objectiveFacilitatorPlanningService'

describe('objective facilitator planning service', () => {
  it('requests external verification when the thread is waiting on public evidence', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'waiting_for_external_evidence',
        verificationVerdict: 'insufficient',
        hasUserFacingResult: false
      },
      thread: {
        proposals: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 1,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      nextAction: 'request_external_verification',
      nextObjectiveStatus: 'in_progress',
      nextThreadStatus: 'waiting'
    }))
    expect(result.checkpoint).toEqual(expect.objectContaining({
      checkpointKind: 'evidence_gap_detected'
    }))
  })

  it('requests local evidence review when conflict has a nearby file artifact', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'conflict_unresolved',
        verificationVerdict: 'mixed',
        hasUserFacingResult: false
      },
      thread: {
        proposals: [],
        checkpoints: [
          {
            artifactRefs: [
              {
                kind: 'file',
                id: 'file-1',
                label: 'evidence.pdf'
              }
            ]
          }
        ],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result.nextAction).toBe('request_local_evidence_check')
    expect(result.checkpoint?.summary).toMatch(/local evidence/i)
  })

  it('routes to specialist follow-up when a spawn proposal is already present', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'waiting_for_external_evidence',
        verificationVerdict: null,
        hasUserFacingResult: false
      },
      thread: {
        proposals: [
          {
            proposalKind: 'spawn_subagent',
            status: 'under_review'
          }
        ],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: true
    })

    expect(result.nextAction).toBe('spawn_specialist')
  })

  it('pauses for operator confirmation when the thread is operator-gated', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'awaiting_operator',
        verificationVerdict: null,
        hasUserFacingResult: false
      },
      thread: {
        proposals: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      nextAction: 'pause_for_operator',
      nextObjectiveStatus: 'awaiting_operator',
      nextThreadStatus: 'waiting',
      requiresOperatorInput: true
    }))
  })

  it('completes converged threads once a user-facing result exists', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'ready_to_converge',
        verificationVerdict: null,
        hasUserFacingResult: true
      },
      thread: {
        proposals: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 1,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      nextAction: 'compose_final_response',
      nextObjectiveStatus: 'completed',
      nextThreadStatus: 'completed'
    }))
    expect(result.checkpoint).toEqual(expect.objectContaining({
      checkpointKind: 'user_facing_result_prepared'
    }))
  })

  it('marks empty idle threads as stalled', () => {
    const service = createObjectiveFacilitatorPlanningService()

    const result = service.planNextStep({
      threadState: {
        state: 'stalled',
        verificationVerdict: null,
        hasUserFacingResult: false
      },
      thread: {
        proposals: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 2,
      hasNewArtifacts: false
    })

    expect(result).toEqual(expect.objectContaining({
      nextAction: 'mark_stalled',
      nextObjectiveStatus: 'stalled',
      nextThreadStatus: 'waiting'
    }))
  })
})
