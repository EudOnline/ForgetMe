import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAgentRun, upsertAgentSuggestion } from '../../../src/main/services/agentPersistenceService'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { deriveAgentSuggestionFollowups } from '../../../src/main/services/agentSuggestionFollowupService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-followup-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('agentSuggestionFollowupService', () => {
  it('derives a manual safe-group application follow-up from a completed recommendation run', () => {
    const db = setupDatabase()
    const parentSuggestion = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Suggest a safe group action.'
      },
      dedupeKey: 'review.safe-group::group-safe-42',
      sourceRunId: null,
      priority: 'high',
      rationale: 'A safe group is ready for manual review.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:00:00.000Z'
    })
    const run = createAgentRun(db, {
      runId: 'run-safe-group-followup',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      prompt: 'Suggest a safe group action.',
      latestAssistantResponse: 'Safe review group ready for approval: group-safe-42 (4 items). Suggested follow-up: Apply safe group group-safe-42.',
      status: 'completed'
    })

    const followups = deriveAgentSuggestionFollowups(db, {
      runId: run.runId,
      parentSuggestionId: parentSuggestion.suggestionId
    })

    expect(followups).toContainEqual(expect.objectContaining({
      triggerKind: 'review.safe_group_available',
      taskKind: 'review.apply_safe_group',
      autoRunnable: false,
      followUpOfSuggestionId: parentSuggestion.suggestionId,
      priority: 'high'
    }))

    db.close()
  })

  it('derives and deduplicates governance policy-update follow-ups against trigger family and parent suggestion', () => {
    const db = setupDatabase()
    const parentSuggestion = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::latest',
      sourceRunId: 'run-failed-2',
      priority: 'medium',
      rationale: 'Failed agent runs were detected and should be summarized.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:10:00.000Z'
    })
    createAgentRun(db, {
      runId: 'run-failed-2',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      prompt: 'Apply safe group group-safe-42.',
      status: 'failed',
      errorMessage: 'confirmation token required'
    })
    const summaryRun = createAgentRun(db, {
      runId: 'run-governance-followup',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize failed agent runs from the proactive monitor.',
      latestAssistantResponse: '1 failed runs need review. Suggested follow-up: Propose policy update: Review repeated runtime failures and tighten policy safeguards.',
      status: 'completed'
    })

    const firstPass = deriveAgentSuggestionFollowups(db, {
      runId: summaryRun.runId,
      parentSuggestionId: parentSuggestion.suggestionId
    })

    expect(firstPass).toContainEqual(expect.objectContaining({
      triggerKind: 'governance.failed_runs_detected',
      taskKind: 'governance.propose_policy_update',
      autoRunnable: false,
      followUpOfSuggestionId: parentSuggestion.suggestionId,
      priority: 'high',
      rationale: '1 failed runs remain after the summary and may require a policy update.'
    }))

    upsertAgentSuggestion(db, firstPass[0]!)

    const secondPass = deriveAgentSuggestionFollowups(db, {
      runId: summaryRun.runId,
      parentSuggestionId: parentSuggestion.suggestionId
    })

    expect(secondPass).toEqual([])

    db.close()
  })
})
