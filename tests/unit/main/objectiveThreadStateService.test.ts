import { describe, expect, it } from 'vitest'
import { createObjectiveThreadStateService } from '../../../src/main/services/objectiveThreadStateService'

describe('objective thread state service', () => {
  it('prefers structured verification metadata over checkpoint summary prose', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [],
        votes: [],
        checkpoints: [
          {
            checkpointKind: 'external_verification_completed',
            summary: 'Verification verdict: supported.',
            metadata: {
              verificationVerdict: 'mixed'
            }
          }
        ],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result.verificationVerdict).toBe('mixed')
    expect(result.state).toBe('conflict_unresolved')
  })

  it('classifies conflicting strong verification outcomes as conflict_unresolved', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [],
        votes: [],
        checkpoints: [
          {
            checkpointKind: 'external_verification_completed',
            summary: 'Verification verdict: mixed.'
          }
        ],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result.state).toBe('conflict_unresolved')
    expect(result.verificationVerdict).toBe('mixed')
  })

  it('classifies active verification work as waiting_for_external_evidence', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [
          {
            proposalKind: 'verify_external_claim',
            status: 'under_review'
          }
        ],
        votes: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: true
    })

    expect(result.state).toBe('waiting_for_external_evidence')
  })

  it('classifies operator-gated threads as awaiting_operator', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [
          {
            proposalKind: 'respond_to_user',
            status: 'awaiting_operator'
          }
        ],
        votes: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 0,
      hasNewArtifacts: false
    })

    expect(result.state).toBe('awaiting_operator')
  })

  it('classifies converged result threads as ready_to_converge before completion is written', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [],
        votes: [],
        checkpoints: [
          {
            checkpointKind: 'user_facing_result_prepared',
            summary: 'Draft response is ready.'
          }
        ],
        messages: []
      },
      roundsWithoutProgress: 1,
      hasNewArtifacts: false
    })

    expect(result.state).toBe('ready_to_converge')
    expect(result.hasUserFacingResult).toBe(true)
  })

  it('classifies silent idle threads as stalled after repeated empty rounds', () => {
    const service = createObjectiveThreadStateService()

    const result = service.classifyThreadState({
      objective: {
        status: 'in_progress',
        requiresOperatorInput: false
      },
      thread: {
        status: 'open',
        proposals: [],
        votes: [],
        checkpoints: [],
        messages: []
      },
      roundsWithoutProgress: 2,
      hasNewArtifacts: false
    })

    expect(result.state).toBe('stalled')
  })
})
