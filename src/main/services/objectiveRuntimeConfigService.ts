import type {
  AgentProposalAutonomyDecision,
  AgentProposalKind,
  AgentProposalRiskLevel,
} from '../../shared/objectiveRuntimeContracts'

export type ObjectiveRuntimeConfig = {
  disableAutoCommit: boolean
  forceOperatorForExternalActions: boolean
  disableNestedDelegation: boolean
}

export type ObjectiveRuntimeProposalPolicyInput = {
  proposalKind: AgentProposalKind
  proposalRiskLevel: AgentProposalRiskLevel
  autonomyDecision: AgentProposalAutonomyDecision
  riskReasons: string[]
  requiresOperatorConfirmation: boolean
}

export const DEFAULT_RUNTIME_CONFIG: ObjectiveRuntimeConfig = {
  disableAutoCommit: false,
  forceOperatorForExternalActions: false,
  disableNestedDelegation: false
}

function parseBooleanFlag(value: string | undefined) {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function uniqueReasons(reasons: string[]) {
  return [...new Set(reasons)]
}

export function isExternalActionProposalKind(proposalKind: AgentProposalKind) {
  return [
    'search_web',
    'verify_external_claim',
    'publish_draft',
    'respond_to_user'
  ].includes(proposalKind)
}

function isExternallySensitiveSpawnSubagent(payload: Record<string, unknown>) {
  return payload.specialization === 'web-verifier'
}

export function isExternallySensitiveProposal(input: {
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
}) {
  if (isExternalActionProposalKind(input.proposalKind)) {
    return true
  }

  return input.proposalKind === 'spawn_subagent'
    && isExternallySensitiveSpawnSubagent(input.payload)
}

export function createObjectiveRuntimeConfigService(input?: {
  env?: NodeJS.ProcessEnv
  persistedSettings?: Partial<ObjectiveRuntimeConfig>
  overrides?: Partial<ObjectiveRuntimeConfig>
}) {
  const env = input?.env ?? process.env
  const config: ObjectiveRuntimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    disableAutoCommit: parseBooleanFlag(env.FORGETME_AGENT_DISABLE_AUTO_COMMIT),
    forceOperatorForExternalActions: parseBooleanFlag(env.FORGETME_AGENT_FORCE_OPERATOR_FOR_EXTERNAL_ACTIONS),
    disableNestedDelegation: parseBooleanFlag(env.FORGETME_AGENT_DISABLE_NESTED_DELEGATION),
    ...(input?.persistedSettings ?? {}),
    ...(input?.overrides ?? {})
  }

  function getConfig() {
    return { ...config }
  }

  function isBoundedRecoveryDisabled() {
    return parseBooleanFlag(env.FORGETME_AGENT_DISABLE_BOUNDED_RECOVERY)
  }

  function shouldRequireOperatorForProposal(input: Pick<ObjectiveRuntimeProposalPolicyInput, 'proposalKind'>) {
    if (config.disableAutoCommit) {
      return true
    }

    return config.forceOperatorForExternalActions
      && isExternalActionProposalKind(input.proposalKind)
  }

  function applyProposalPolicy(input: ObjectiveRuntimeProposalPolicyInput) {
    const runtimeReasons = [...input.riskReasons]
    let autonomyDecision = input.autonomyDecision
    let requiresOperatorConfirmation = input.requiresOperatorConfirmation

    if (config.disableAutoCommit) {
      autonomyDecision = 'await_operator'
      requiresOperatorConfirmation = true
      runtimeReasons.push('runtime_auto_commit_disabled')
    }

    if (
      config.forceOperatorForExternalActions
      && isExternalActionProposalKind(input.proposalKind)
    ) {
      autonomyDecision = 'await_operator'
      requiresOperatorConfirmation = true
      runtimeReasons.push('runtime_force_operator_for_external_action')
    }

    return {
      proposalRiskLevel: input.proposalRiskLevel,
      autonomyDecision,
      requiresOperatorConfirmation,
      riskReasons: uniqueReasons(runtimeReasons)
    }
  }

  function canUseBoundedRecovery(input: {
    proposalKind: AgentProposalKind
    payload: Record<string, unknown>
    proposalRiskLevel: AgentProposalRiskLevel
  }) {
    if (isBoundedRecoveryDisabled()) {
      return false
    }

    if (input.proposalRiskLevel === 'critical') {
      return false
    }

    return !isExternallySensitiveProposal({
      proposalKind: input.proposalKind,
      payload: input.payload
    })
  }

  return {
    getConfig,
    isBoundedRecoveryDisabled,
    canUseBoundedRecovery,
    shouldRequireOperatorForProposal,
    applyProposalPolicy
  }
}
