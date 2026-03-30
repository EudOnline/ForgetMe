import { describe, expect, it } from 'vitest'
import type { AgentSuggestionRecord } from '../../../src/shared/archiveContracts'
import { canAutoRunAgentSuggestion } from '../../../src/main/services/agentAutonomyPolicy'

function createSuggestion(overrides: Partial<AgentSuggestionRecord> = {}): AgentSuggestionRecord {
  return {
    suggestionId: 'suggestion-1',
    triggerKind: 'governance.failed_runs_detected',
    status: 'suggested',
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    taskInput: {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize failed agent runs from the proactive monitor.'
    },
    dedupeKey: 'governance.failed-runs::latest',
    sourceRunId: null,
    executedRunId: null,
    priority: 'medium',
    rationale: 'Failed agent runs were detected and should be summarized.',
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

describe('agentAutonomyPolicy', () => {
  it('allows only allowlisted auto-runnable suggestions in safe auto-run mode', () => {
    expect(canAutoRunAgentSuggestion({
      autonomyMode: 'suggest_safe_auto_run',
      suggestion: createSuggestion()
    })).toBe(true)

    expect(canAutoRunAgentSuggestion({
      autonomyMode: 'manual_only',
      suggestion: createSuggestion()
    })).toBe(false)

    expect(canAutoRunAgentSuggestion({
      autonomyMode: 'suggest_safe_auto_run',
      suggestion: createSuggestion({
        autoRunnable: false
      })
    })).toBe(false)
  })

  it('rejects confirmation-gated or non-allowlisted suggestions even if marked auto-runnable', () => {
    expect(canAutoRunAgentSuggestion({
      autonomyMode: 'suggest_safe_auto_run',
      suggestion: createSuggestion({
        triggerKind: 'review.safe_group_available',
        role: 'review',
        taskKind: 'review.apply_safe_group',
        taskInput: {
          role: 'review',
          taskKind: 'review.apply_safe_group',
          prompt: 'Apply safe group group-safe-1.'
        }
      }),
      requiresConfirmation: true
    })).toBe(false)

    expect(canAutoRunAgentSuggestion({
      autonomyMode: 'suggest_safe_auto_run',
      suggestion: createSuggestion({
        role: 'workspace',
        taskKind: 'workspace.publish_draft',
        taskInput: {
          role: 'workspace',
          taskKind: 'workspace.publish_draft',
          prompt: 'Publish the latest approved draft.'
        }
      })
    })).toBe(false)
  })
})
