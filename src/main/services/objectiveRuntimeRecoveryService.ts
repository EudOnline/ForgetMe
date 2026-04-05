import { createObjectiveRuntimeConfigService } from './objectiveRuntimeConfigService'
import {
  classifyObjectiveRuntimeFailureType,
  objectiveRuntimeFailureEventTypeFor,
  type ObjectiveRuntimeFailureType
} from './objectiveRuntimeFailureService'
import type {
  AgentProposalRecord,
  ObjectiveRuntimeEventType
} from '../../shared/objectiveRuntimeContracts'

export type ObjectiveRuntimeRecoveryDecision =
  | 'retry_now'
  | 'cooldown_then_retry'
  | 'surface_to_operator'

export type ObjectiveRuntimeRecoveryFailureType = ObjectiveRuntimeFailureType

export type ObjectiveRuntimeRecoveryResult = {
  failureType: ObjectiveRuntimeRecoveryFailureType
  failureEventType: Extract<ObjectiveRuntimeEventType, 'tool_timeout' | 'subagent_budget_exhausted'> | null
  decision: ObjectiveRuntimeRecoveryDecision
  shouldRetry: boolean
  reason: string
}

function classifyFailure(error: unknown): ObjectiveRuntimeRecoveryResult['failureType'] {
  return classifyObjectiveRuntimeFailureType(error)
}

function failureEventTypeFor(
  failureType: ObjectiveRuntimeRecoveryFailureType
): ObjectiveRuntimeRecoveryResult['failureEventType'] {
  return objectiveRuntimeFailureEventTypeFor(failureType)
}

export function createObjectiveRuntimeRecoveryService(dependencies?: {
  runtimeConfig?: ReturnType<typeof createObjectiveRuntimeConfigService>
}) {
  const runtimeConfig = dependencies?.runtimeConfig ?? createObjectiveRuntimeConfigService({
    env: {}
  })

  function decideRecovery(input: {
    proposal: Pick<AgentProposalRecord,
      | 'proposalKind'
      | 'payload'
      | 'proposalRiskLevel'
      | 'status'
    >
    failure: unknown
    priorAttemptCount: number
  }): ObjectiveRuntimeRecoveryResult {
    const failureType = classifyFailure(input.failure)
    const failureEventType = failureEventTypeFor(failureType)

    if (runtimeConfig.isBoundedRecoveryDisabled()) {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'runtime_bounded_recovery_disabled'
      }
    }

    if (input.proposal.proposalRiskLevel === 'critical') {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'critical_proposal_boundary'
      }
    }

    if (['blocked', 'vetoed', 'awaiting_operator'].includes(input.proposal.status)) {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'proposal_state_requires_operator'
      }
    }

    if (!runtimeConfig.canUseBoundedRecovery({
      proposalKind: input.proposal.proposalKind,
      payload: input.proposal.payload,
      proposalRiskLevel: input.proposal.proposalRiskLevel
    })) {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'external_or_public_boundary'
      }
    }

    if (input.priorAttemptCount >= 1) {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'bounded_recovery_limit_reached'
      }
    }

    if (failureType === 'subagent_budget_exhausted') {
      return {
        failureType,
        failureEventType,
        decision: 'surface_to_operator',
        shouldRetry: false,
        reason: 'budget_policy_exhausted'
      }
    }

    if (failureType === 'tool_timeout') {
      return {
        failureType,
        failureEventType,
        decision: 'cooldown_then_retry',
        shouldRetry: true,
        reason: 'transient_tool_timeout'
      }
    }

    if (failureType === 'transient_local_failure') {
      return {
        failureType,
        failureEventType,
        decision: 'retry_now',
        shouldRetry: true,
        reason: 'transient_local_failure'
      }
    }

    return {
      failureType,
      failureEventType,
      decision: 'surface_to_operator',
      shouldRetry: false,
      reason: 'failure_not_recoverable'
    }
  }

  return {
    decideRecovery
  }
}
