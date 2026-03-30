import type {
  AgentSuggestionPriority,
  AgentSuggestionRecord,
  AgentTaskKind
} from '../../shared/archiveContracts'
import type { AgentSuggestionSeed } from './agentProactiveTriggerService'

export type RankedAgentSuggestionSeed = AgentSuggestionSeed & {
  priority: AgentSuggestionPriority
  rationale: string
  autoRunnable: boolean
  followUpOfSuggestionId: string | null
  cooldownUntil: string | null
}

const SAFE_AUTO_RUN_TASK_KINDS: ReadonlySet<AgentTaskKind> = new Set([
  'governance.summarize_failures',
  'review.summarize_queue',
  'review.suggest_safe_group_action',
  'ingestion.rerun_enrichment'
])

const PRIORITY_ORDER: Record<AgentSuggestionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

function addMinutes(isoTimestamp: string, minutes: number) {
  return new Date(Date.parse(isoTimestamp) + (minutes * 60_000)).toISOString()
}

function basePriority(taskKind: AgentTaskKind): AgentSuggestionPriority {
  switch (taskKind) {
    case 'review.suggest_safe_group_action':
      return 'high'
    case 'governance.summarize_failures':
      return 'medium'
    case 'ingestion.rerun_enrichment':
      return 'high'
    default:
      return 'low'
  }
}

function rationaleFor(taskKind: AgentTaskKind, attemptCount: number) {
  switch (taskKind) {
    case 'review.suggest_safe_group_action':
      return 'A safe review group is ready for manual inspection.'
    case 'governance.summarize_failures':
      return 'Failed agent runs were detected and should be summarized.'
    case 'ingestion.rerun_enrichment':
      return attemptCount >= 1
        ? 'Repeated enrichment failures are blocking downstream review.'
        : 'A failed enrichment job is blocking downstream review.'
    default:
      return ''
  }
}

export function isSafeAutoRunnableTaskKind(taskKind: AgentTaskKind) {
  return SAFE_AUTO_RUN_TASK_KINDS.has(taskKind)
}

export function computeSuggestionCooldownUntil(input: {
  taskKind: AgentTaskKind
  attemptCount: number
  now: string
}) {
  if (input.attemptCount <= 0) {
    return null
  }

  if (input.taskKind === 'ingestion.rerun_enrichment') {
    return addMinutes(input.now, Math.min(60, input.attemptCount * 15))
  }

  return addMinutes(input.now, Math.min(15, input.attemptCount * 5))
}

export function rankAgentSuggestions(
  suggestions: AgentSuggestionSeed[],
  context: {
    existingSuggestions: AgentSuggestionRecord[]
    now: string
  }
): RankedAgentSuggestionSeed[] {
  const existingByDedupeKey = new Map(
    context.existingSuggestions.map((suggestion) => [suggestion.dedupeKey, suggestion])
  )

  return suggestions
    .map((suggestion) => {
      const existing = existingByDedupeKey.get(suggestion.dedupeKey)
      const attemptCount = existing?.attemptCount ?? 0
      const priority = suggestion.taskKind === 'ingestion.rerun_enrichment' && attemptCount >= 1
        ? 'critical'
        : basePriority(suggestion.taskKind)

      return {
        ...suggestion,
        priority,
        rationale: rationaleFor(suggestion.taskKind, attemptCount),
        autoRunnable: isSafeAutoRunnableTaskKind(suggestion.taskKind),
        followUpOfSuggestionId: null,
        cooldownUntil: existing?.cooldownUntil
          ?? computeSuggestionCooldownUntil({
            taskKind: suggestion.taskKind,
            attemptCount,
            now: context.now
          })
      }
    })
    .sort((left, right) => {
      const priorityDelta = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
      if (priorityDelta !== 0) {
        return priorityDelta
      }

      return left.dedupeKey.localeCompare(right.dedupeKey)
    })
}
