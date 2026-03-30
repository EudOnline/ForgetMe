import type {
  AgentRole,
  AgentTaskKind,
  AgentTaskKindByRole,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import {
  getAgentRun,
  getAgentSuggestion,
  listAgentRuns,
  listAgentSuggestions
} from './agentPersistenceService'
import type { RankedAgentSuggestionSeed } from './agentSuggestionRankingService'
import { isSafeAutoRunnableTaskKind } from './agentSuggestionRankingService'
import type { ArchiveDatabase } from './db'

const SAFE_GROUP_FOLLOWUP_PATTERN = /Suggested follow-up:\s*Apply safe group\s+([A-Za-z0-9-]+)/i
const GOVERNANCE_POLICY_PROMPT_PATTERN = /Suggested follow-up:\s*(Propose policy update:\s*.+)$/i
const ENRICHMENT_JOB_PATTERN = /Rerun failed enrichment job\s+([A-Za-z0-9-]+)/i

function hasFollowupForParent(db: ArchiveDatabase, input: {
  parentSuggestionId: string | null
  dedupeKey: string
  taskKind: AgentTaskKind
}) {
  const suggestions = listAgentSuggestions(db)
  return suggestions.some((suggestion) => {
    if (suggestion.dedupeKey === input.dedupeKey) {
      return true
    }

    return input.parentSuggestionId !== null
      && suggestion.followUpOfSuggestionId === input.parentSuggestionId
      && suggestion.taskKind === input.taskKind
  })
}

function buildTaskInputForRole<Role extends AgentRole>(
  role: Role,
  taskKind: AgentTaskKindByRole[Role],
  prompt: string
): Extract<RunAgentTaskInput, { role: Role }> {
  return {
    role,
    taskKind,
    prompt
  } as Extract<RunAgentTaskInput, { role: Role }>
}

function buildFollowup(input: {
  triggerKind: RankedAgentSuggestionSeed['triggerKind']
  role: RankedAgentSuggestionSeed['role']
  taskKind: RankedAgentSuggestionSeed['taskKind']
  prompt: string
  dedupeKey: string
  sourceRunId: string | null
  priority: RankedAgentSuggestionSeed['priority']
  rationale: string
  autoRunnable: boolean
  followUpOfSuggestionId: string | null
}): RankedAgentSuggestionSeed {
  return {
    triggerKind: input.triggerKind,
    role: input.role,
    taskKind: input.taskKind,
    taskInput: buildTaskInputForRole(input.role, input.taskKind, input.prompt),
    dedupeKey: input.dedupeKey,
    sourceRunId: input.sourceRunId ?? null,
    priority: input.priority,
    rationale: input.rationale,
    autoRunnable: input.autoRunnable,
    followUpOfSuggestionId: input.followUpOfSuggestionId,
    cooldownUntil: null
  }
}

export function deriveAgentSuggestionFollowups(
  db: ArchiveDatabase,
  input: {
    runId: string
    parentSuggestionId?: string | null
  }
): RankedAgentSuggestionSeed[] {
  const run = getAgentRun(db, { runId: input.runId })
  if (!run || !run.taskKind) {
    return []
  }

  const parentSuggestionId = input.parentSuggestionId ?? null
  const latestAssistantResponse = run.latestAssistantResponse ?? ''

  switch (run.taskKind) {
    case 'review.suggest_safe_group_action': {
      if (run.status !== 'completed') {
        return []
      }

      const match = latestAssistantResponse.match(SAFE_GROUP_FOLLOWUP_PATTERN)
      const groupKey = match?.[1]
      if (!groupKey) {
        return []
      }

      const dedupeKey = `review.safe-group::${groupKey}::follow-up::${parentSuggestionId ?? run.runId}`
      if (hasFollowupForParent(db, {
        parentSuggestionId,
        dedupeKey,
        taskKind: 'review.apply_safe_group'
      })) {
        return []
      }

      return [
        buildFollowup({
          triggerKind: 'review.safe_group_available',
          role: 'review',
          taskKind: 'review.apply_safe_group',
          prompt: `Apply safe group ${groupKey}.`,
          dedupeKey,
          sourceRunId: run.runId,
          priority: 'high',
          rationale: 'The safe group recommendation is ready to apply manually.',
          autoRunnable: false,
          followUpOfSuggestionId: parentSuggestionId
        })
      ]
    }
    case 'governance.summarize_failures': {
      if (run.status !== 'completed') {
        return []
      }

      const failedRuns = listAgentRuns(db, { status: 'failed' }).filter((failedRun) => failedRun.runId !== run.runId)
      if (failedRuns.length === 0) {
        return []
      }

      const policyPrompt = latestAssistantResponse.match(GOVERNANCE_POLICY_PROMPT_PATTERN)?.[1]
        ?? 'Propose policy update: Review repeated runtime failures and tighten policy safeguards.'
      const dedupeKey = `governance.failed-runs::policy-follow-up::${parentSuggestionId ?? run.runId}`
      if (hasFollowupForParent(db, {
        parentSuggestionId,
        dedupeKey,
        taskKind: 'governance.propose_policy_update'
      })) {
        return []
      }

      return [
        buildFollowup({
          triggerKind: 'governance.failed_runs_detected',
          role: 'governance',
          taskKind: 'governance.propose_policy_update',
          prompt: policyPrompt,
          dedupeKey,
          sourceRunId: run.runId,
          priority: 'high',
          rationale: `${failedRuns.length} failed runs remain after the summary and may require a policy update.`,
          autoRunnable: false,
          followUpOfSuggestionId: parentSuggestionId
        })
      ]
    }
    case 'ingestion.rerun_enrichment': {
      if (run.status !== 'failed' || !parentSuggestionId) {
        return []
      }

      const parentSuggestion = getAgentSuggestion(db, { suggestionId: parentSuggestionId })
      if (!parentSuggestion || parentSuggestion.attemptCount < 2) {
        return []
      }

      const jobId = parentSuggestion.taskInput.prompt.match(ENRICHMENT_JOB_PATTERN)?.[1]
        ?? run.prompt.match(ENRICHMENT_JOB_PATTERN)?.[1]
        ?? 'unknown-job'
      const dedupeKey = `governance.failed-runs::retry-escalation::${jobId}`
      if (hasFollowupForParent(db, {
        parentSuggestionId,
        dedupeKey,
        taskKind: 'governance.summarize_failures'
      })) {
        return []
      }

      return [
        buildFollowup({
          triggerKind: 'governance.failed_runs_detected',
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          prompt: 'Summarize failed agent runs from the proactive monitor.',
          dedupeKey,
          sourceRunId: run.runId,
          priority: 'high',
          rationale: `Repeated retries for enrichment job ${jobId} are still failing and need governance review.`,
          autoRunnable: isSafeAutoRunnableTaskKind('governance.summarize_failures'),
          followUpOfSuggestionId: parentSuggestionId
        })
      ]
    }
    default:
      return []
  }
}
