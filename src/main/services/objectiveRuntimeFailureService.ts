import type {
  AgentProposalRecord,
  ObjectiveRuntimeEventType
} from '../../shared/objectiveRuntimeContracts'

export type ObjectiveRuntimeFailureType =
  | 'tool_timeout'
  | 'subagent_budget_exhausted'
  | 'transient_local_failure'
  | 'unknown'

export type ObjectiveRuntimeFailureEventType =
  Extract<ObjectiveRuntimeEventType, 'tool_timeout' | 'subagent_budget_exhausted'> | null

export type ObjectiveRuntimeFailure = Error & {
  kind: 'objective_runtime_failure'
  proposal: AgentProposalRecord
  objectiveId: string
  threadId: string
  proposalId: string
  failureType: ObjectiveRuntimeFailureType
  failureEventType: ObjectiveRuntimeFailureEventType
}

export function asObjectiveRuntimeFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

export function classifyObjectiveRuntimeFailureType(error: unknown): ObjectiveRuntimeFailureType {
  if (isObjectiveRuntimeFailure(error)) {
    return error.failureType
  }

  const message = asObjectiveRuntimeFailureMessage(error).toLowerCase()
  const timeoutHints = [
    'timeout budget',
    'timed out',
    'deadline exceeded',
    'request timeout'
  ]

  if (timeoutHints.some((hint) => message.includes(hint))) {
    return 'tool_timeout'
  }

  if (message.includes('remaining budget is exhausted')) {
    return 'subagent_budget_exhausted'
  }

  if (
    message.includes('temporarily unavailable')
    || message.includes('try again')
    || message.includes('retry')
  ) {
    return 'transient_local_failure'
  }

  return 'unknown'
}

export function objectiveRuntimeFailureEventTypeFor(
  failureType: ObjectiveRuntimeFailureType
): ObjectiveRuntimeFailureEventType {
  switch (failureType) {
    case 'tool_timeout':
      return 'tool_timeout'
    case 'subagent_budget_exhausted':
      return 'subagent_budget_exhausted'
    default:
      return null
  }
}

export function isObjectiveRuntimeFailure(error: unknown): error is ObjectiveRuntimeFailure {
  return Boolean(
    error
      && typeof error === 'object'
      && 'kind' in error
      && (error as { kind?: unknown }).kind === 'objective_runtime_failure'
      && 'proposal' in error
      && 'failureType' in error
  )
}

export function createObjectiveRuntimeFailure(input: {
  proposal: AgentProposalRecord
  error: unknown
  failureType?: ObjectiveRuntimeFailureType
}) {
  if (isObjectiveRuntimeFailure(input.error)) {
    return input.error
  }

  const failureType = input.failureType ?? classifyObjectiveRuntimeFailureType(input.error)
  const runtimeError = new Error(asObjectiveRuntimeFailureMessage(input.error)) as ObjectiveRuntimeFailure
  runtimeError.name = 'ObjectiveRuntimeFailure'
  runtimeError.kind = 'objective_runtime_failure'
  runtimeError.proposal = input.proposal
  runtimeError.objectiveId = input.proposal.objectiveId
  runtimeError.threadId = input.proposal.threadId
  runtimeError.proposalId = input.proposal.proposalId
  runtimeError.failureType = failureType
  runtimeError.failureEventType = objectiveRuntimeFailureEventTypeFor(failureType)

  return runtimeError
}

export function normalizeObjectiveRuntimeFailure(error: unknown, proposal: AgentProposalRecord) {
  return createObjectiveRuntimeFailure({
    proposal,
    error
  })
}
