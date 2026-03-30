import { describe, expect, it } from 'vitest'
import type { AgentSuggestionRecord } from '../../../src/shared/archiveContracts'
import { rankAgentSuggestions } from '../../../src/main/services/agentSuggestionRankingService'

function createExistingSuggestion(overrides: Partial<AgentSuggestionRecord> = {}): AgentSuggestionRecord {
  return {
    suggestionId: 'suggestion-existing',
    triggerKind: 'ingestion.failed_enrichment_job',
    status: 'suggested',
    role: 'ingestion',
    taskKind: 'ingestion.rerun_enrichment',
    taskInput: {
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      prompt: 'Rerun failed enrichment job job-1 for file blocked.pdf.'
    },
    dedupeKey: 'ingestion.failed-enrichment::job-1',
    sourceRunId: null,
    executedRunId: null,
    priority: 'high',
    rationale: 'A failed enrichment job is blocking downstream review.',
    autoRunnable: true,
    followUpOfSuggestionId: null,
    attemptCount: 0,
    cooldownUntil: null,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    lastObservedAt: '2026-03-30T00:00:00.000Z',
    ...overrides
  }
}

describe('agentSuggestionRankingService', () => {
  it('ranks blocking enrichment retries above governance summaries', () => {
    const ranked = rankAgentSuggestions([
      {
        triggerKind: 'governance.failed_runs_detected',
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        taskInput: {
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          prompt: 'Summarize failed agent runs from the proactive monitor.'
        },
        dedupeKey: 'governance.failed-runs::latest',
        sourceRunId: 'run-failed-1'
      },
      {
        triggerKind: 'ingestion.failed_enrichment_job',
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        taskInput: {
          role: 'ingestion',
          taskKind: 'ingestion.rerun_enrichment',
          prompt: 'Rerun failed enrichment job job-1 for file blocked.pdf.'
        },
        dedupeKey: 'ingestion.failed-enrichment::job-1',
        sourceRunId: null
      }
    ], {
      existingSuggestions: [],
      now: '2026-03-30T01:00:00.000Z'
    })

    expect(ranked.map((item) => item.taskKind)).toEqual([
      'ingestion.rerun_enrichment',
      'governance.summarize_failures'
    ])
    expect(ranked[0]).toMatchObject({
      priority: 'high',
      autoRunnable: true,
      rationale: 'A failed enrichment job is blocking downstream review.'
    })
    expect(ranked[1]).toMatchObject({
      priority: 'medium',
      autoRunnable: true
    })
  })

  it('applies cooldown and critical priority to repeated failed reruns', () => {
    const ranked = rankAgentSuggestions([
      {
        triggerKind: 'ingestion.failed_enrichment_job',
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        taskInput: {
          role: 'ingestion',
          taskKind: 'ingestion.rerun_enrichment',
          prompt: 'Rerun failed enrichment job job-1 for file blocked.pdf.'
        },
        dedupeKey: 'ingestion.failed-enrichment::job-1',
        sourceRunId: null
      }
    ], {
      existingSuggestions: [
        createExistingSuggestion({
          attemptCount: 2,
          updatedAt: '2026-03-30T00:50:00.000Z'
        })
      ],
      now: '2026-03-30T01:00:00.000Z'
    })

    expect(ranked).toContainEqual(expect.objectContaining({
      taskKind: 'ingestion.rerun_enrichment',
      priority: 'critical',
      cooldownUntil: '2026-03-30T01:30:00.000Z'
    }))
  })
})
