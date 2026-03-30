import type {
  AgentRole,
  AgentTaskKind,
  AgentTriggerKind,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import { listAgentRuns } from './agentPersistenceService'
import type { ArchiveDatabase } from './db'
import { listEnrichmentJobs } from './enrichmentReadService'
import { listReviewConflictGroups } from './reviewWorkbenchReadService'

type AgentProactiveSuggestionSeed = {
  triggerKind: AgentTriggerKind
  role: AgentRole
  taskKind: AgentTaskKind
  taskInput: RunAgentTaskInput
  dedupeKey: string
  sourceRunId?: string | null
}

const GOVERNANCE_FAILURE_SUMMARY_PROMPT = 'Summarize failed agent runs from the proactive monitor.'
const REVIEW_SAFE_GROUP_PROMPT = 'Check for a safe review group that is ready for approval.'

export function evaluateAgentProactiveSuggestions(db: ArchiveDatabase): AgentProactiveSuggestionSeed[] {
  const suggestions: AgentProactiveSuggestionSeed[] = []

  const failedRuns = listAgentRuns(db, { status: 'failed' })
  if (failedRuns.length > 0) {
    const latestFailedRun = failedRuns[0]
    suggestions.push({
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: GOVERNANCE_FAILURE_SUMMARY_PROMPT
      },
      dedupeKey: 'governance.failed-runs::latest',
      sourceRunId: latestFailedRun?.runId ?? null
    })
  }

  const safeGroup = listReviewConflictGroups(db).find((group) => !group.hasConflict && group.pendingCount >= 2)
  if (safeGroup) {
    suggestions.push({
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: REVIEW_SAFE_GROUP_PROMPT
      },
      dedupeKey: `review.safe-group::${safeGroup.groupKey}`,
      sourceRunId: null
    })
  }

  const failedEnrichmentJobs = listEnrichmentJobs(db, { status: 'failed' })
  for (const job of failedEnrichmentJobs) {
    suggestions.push({
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: `Rerun failed enrichment job ${job.id} for file ${job.fileName}.`
      },
      dedupeKey: `ingestion.failed-enrichment::${job.id}`,
      sourceRunId: null
    })
  }

  return suggestions
}
