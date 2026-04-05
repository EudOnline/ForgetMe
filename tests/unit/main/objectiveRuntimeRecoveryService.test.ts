import { describe, expect, it } from 'vitest'
import { createObjectiveRuntimeConfigService } from '../../../src/main/services/objectiveRuntimeConfigService'
import { createObjectiveRuntimeRecoveryService } from '../../../src/main/services/objectiveRuntimeRecoveryService'

function buildProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: 'proposal-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposedByParticipantId: 'workspace',
    proposalKind: 'spawn_subagent',
    payload: {
      specialization: 'compare-analyst',
      question: 'Compare grounded answer candidates for this request.'
    },
    ownerRole: 'workspace',
    status: 'committed',
    requiredApprovals: ['workspace'],
    allowVetoBy: ['governance'],
    proposalRiskLevel: 'low',
    autonomyDecision: 'auto_commit',
    riskReasons: ['local_reversible_workflow'],
    confidenceScore: 0.9,
    requiresOperatorConfirmation: false,
    toolPolicyId: 'compare-analyst-policy',
    budget: {
      maxRounds: 2,
      maxToolCalls: 2,
      timeoutMs: 5
    },
    derivedFromMessageIds: [],
    artifactRefs: [],
    createdAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
    committedAt: '2026-04-04T00:00:00.000Z',
    ...overrides
  } as any
}

describe('objective runtime recovery service', () => {
  it('cools down and retries a first local timeout for low-risk subagent work', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal(),
      failure: new Error('Tool run_compare exceeded timeout budget.'),
      priorAttemptCount: 0
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'tool_timeout',
      decision: 'cooldown_then_retry',
      shouldRetry: true,
      reason: 'transient_tool_timeout'
    }))
  })

  it('classifies local timed-out compare failures as tool timeouts for bounded retry', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal(),
      failure: new Error('Local compare runner timed out after waiting for run_compare.'),
      priorAttemptCount: 0
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'tool_timeout',
      decision: 'cooldown_then_retry',
      shouldRetry: true,
      reason: 'transient_tool_timeout'
    }))
  })

  it('retries immediately for a transient local failure that is not externally sensitive', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal(),
      failure: new Error('Compare session temporarily unavailable, please retry.'),
      priorAttemptCount: 0
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'transient_local_failure',
      decision: 'retry_now',
      shouldRetry: true,
      reason: 'transient_local_failure'
    }))
  })

  it('prefers structured runtime failure metadata over raw message parsing', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal(),
      failure: {
        kind: 'objective_runtime_failure',
        name: 'ObjectiveRuntimeFailure',
        message: 'opaque downstream failure',
        proposal: buildProposal(),
        objectiveId: 'objective-1',
        threadId: 'thread-1',
        proposalId: 'proposal-1',
        failureType: 'tool_timeout',
        failureEventType: 'tool_timeout'
      },
      priorAttemptCount: 0
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'tool_timeout',
      decision: 'cooldown_then_retry',
      shouldRetry: true,
      reason: 'transient_tool_timeout'
    }))
  })

  it('surfaces externally sensitive web-verifier failures to the operator', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal({
        payload: {
          specialization: 'web-verifier',
          claim: 'The source confirms the announcement date.',
          query: 'official announcement date'
        }
      }),
      failure: new Error('Tool search_web exceeded timeout budget.'),
      priorAttemptCount: 0
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'tool_timeout',
      decision: 'surface_to_operator',
      shouldRetry: false,
      reason: 'external_or_public_boundary'
    }))
  })

  it('surfaces failures after one bounded recovery attempt has already been used', () => {
    const service = createObjectiveRuntimeRecoveryService({
      runtimeConfig: createObjectiveRuntimeConfigService()
    })

    const decision = service.decideRecovery({
      proposal: buildProposal(),
      failure: new Error('Tool run_compare exceeded timeout budget.'),
      priorAttemptCount: 1
    })

    expect(decision).toEqual(expect.objectContaining({
      failureType: 'tool_timeout',
      decision: 'surface_to_operator',
      shouldRetry: false,
      reason: 'bounded_recovery_limit_reached'
    }))
  })
})
