import type {
  AgentAutonomyMode,
  AgentSuggestionRecord
} from '../../shared/archiveContracts'
import { isSafeAutoRunnableTaskKind } from './agentSuggestionRankingService'
import type { ObjectiveSuggestionSeed } from './objectiveSuggestionBridgeService'

export function canAutoRunAgentSuggestion(input: {
  autonomyMode: AgentAutonomyMode
  suggestion: Pick<AgentSuggestionRecord, 'status' | 'autoRunnable' | 'taskKind'>
  requiresConfirmation?: boolean
}) {
  if (input.autonomyMode !== 'suggest_safe_auto_run') {
    return false
  }

  if (input.suggestion.status !== 'suggested') {
    return false
  }

  if (!input.suggestion.autoRunnable) {
    return false
  }

  if (input.requiresConfirmation) {
    return false
  }

  return isSafeAutoRunnableTaskKind(input.suggestion.taskKind)
}

export function evaluateObjectiveAutonomy(input: {
  autonomyMode: AgentAutonomyMode
  objectiveSeed: Pick<ObjectiveSuggestionSeed, 'autoStartSafe' | 'autoApproveSeededProposal' | 'seededProposal'>
}) {
  if (input.autonomyMode !== 'suggest_safe_auto_run') {
    return {
      canAutoStartObjective: false,
      canAutoApproveSeededProposal: false
    }
  }

  if (!input.objectiveSeed.autoStartSafe) {
    return {
      canAutoStartObjective: false,
      canAutoApproveSeededProposal: false
    }
  }

  const seededProposal = input.objectiveSeed.seededProposal
  const canAutoApproveSeededProposal = Boolean(
    input.objectiveSeed.autoApproveSeededProposal
    && seededProposal
    && seededProposal.proposalKind === 'spawn_subagent'
    && !seededProposal.requiresOperatorConfirmation
  )

  return {
    canAutoStartObjective: true,
    canAutoApproveSeededProposal
  }
}
