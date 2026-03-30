import type {
  AgentAutonomyMode,
  AgentSuggestionRecord
} from '../../shared/archiveContracts'
import { isSafeAutoRunnableTaskKind } from './agentSuggestionRankingService'

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
