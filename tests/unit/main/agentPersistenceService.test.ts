import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendAgentMessage,
  createAgentPolicyVersion,
  createAgentRun,
  dismissAgentSuggestion,
  getAgentRun,
  getAgentRuntimeSettings,
  getAgentSuggestion,
  incrementAgentSuggestionAttempt,
  listAgentSuggestions,
  listAgentRuns,
  listAgentMemories,
  listAgentPolicyVersions,
  listRunnableAgentSuggestions,
  markAgentSuggestionExecuted,
  updateAgentRunReplayMetadata,
  upsertAgentRuntimeSettings,
  upsertAgentSuggestion,
  upsertAgentMemory
} from '../../../src/main/services/agentPersistenceService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-runtime-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('agent persistence service', () => {
  it('creates a run, appends ordered messages, and fetches the detail view', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'ingestion',
      taskKind: 'ingestion.import_batch',
      prompt: 'Import the latest chat export'
    })

    appendAgentMessage(db, {
      runId: run.runId,
      sender: 'user',
      content: 'Start the import'
    })
    appendAgentMessage(db, {
      runId: run.runId,
      sender: 'agent',
      content: 'Import queued'
    })

    const detail = getAgentRun(db, { runId: run.runId })

    expect(run.runId).toBeTruthy()
    expect(detail?.messages.map((item) => item.ordinal)).toEqual([1, 2])
    expect(detail?.prompt).toBe('Import the latest chat export')

    db.close()
  })

  it('upserts memory by role and memory key', () => {
    const db = setupDatabase()

    upsertAgentMemory(db, {
      role: 'review',
      memoryKey: 'review.safe_batch.rules',
      memoryValue: 'initial rules'
    })
    upsertAgentMemory(db, {
      role: 'review',
      memoryKey: 'review.safe_batch.rules',
      memoryValue: 'updated rules'
    })

    const memories = listAgentMemories(db, {
      role: 'review'
    })

    expect(memories).toHaveLength(1)
    expect(memories[0]?.memoryKey).toBe('review.safe_batch.rules')
    expect(memories[0]?.memoryValue).toBe('updated rules')

    db.close()
  })

  it('lists and fetches persisted run replay metadata', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'orchestrator',
      taskKind: 'orchestrator.plan_next_action',
      prompt: 'Summarize review queue pressure'
    })

    updateAgentRunReplayMetadata(db, {
      runId: run.runId,
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })

    const listedRuns = listAgentRuns(db)
    const detail = getAgentRun(db, { runId: run.runId })

    expect(listedRuns[0]?.targetRole).toBe('review')
    expect(listedRuns[0]?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(listedRuns[0]?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.targetRole).toBe('review')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(detail?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')

    db.close()
  })

  it('preserves latest assistant response when replay metadata update omits it', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'orchestrator',
      taskKind: 'orchestrator.plan_next_action',
      targetRole: 'workspace',
      assignedRoles: ['orchestrator', 'workspace'],
      latestAssistantResponse: 'Initial workspace answer',
      prompt: 'Answer with workspace context'
    })

    const updated = updateAgentRunReplayMetadata(db, {
      runId: run.runId,
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review']
    })
    const detail = getAgentRun(db, { runId: run.runId })

    expect(updated?.targetRole).toBe('review')
    expect(updated?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(updated?.latestAssistantResponse).toBe('Initial workspace answer')
    expect(detail?.latestAssistantResponse).toBe('Initial workspace answer')

    db.close()
  })

  it('reads default replay metadata for rows inserted without replay columns', () => {
    const db = setupDatabase()
    const runId = 'legacy-run-without-replay-columns'
    const now = new Date().toISOString()

    db.prepare(
      `insert into agent_runs (
        id,
        role,
        task_kind,
        status,
        prompt,
        confirmation_token,
        policy_version,
        error_message,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      'workspace',
      'workspace.ask_memory',
      'queued',
      'Legacy row with no replay metadata',
      null,
      null,
      null,
      now,
      now
    )

    const listed = listAgentRuns(db)
    const detail = getAgentRun(db, { runId })

    expect(listed[0]?.runId).toBe(runId)
    expect(listed[0]?.assignedRoles).toEqual([])
    expect(listed[0]?.latestAssistantResponse).toBeNull()
    expect(listed[0]?.executionOrigin).toBe('operator_manual')
    expect(detail?.assignedRoles).toEqual([])
    expect(detail?.latestAssistantResponse).toBeNull()
    expect(detail?.executionOrigin).toBe('operator_manual')

    db.close()
  })

  it('stores execution origin on runs for audit', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize failures from the safe auto-run lane.',
      executionOrigin: 'auto_runner'
    })

    const detail = getAgentRun(db, { runId: run.runId })

    expect(run.executionOrigin).toBe('auto_runner')
    expect(detail?.executionOrigin).toBe('auto_runner')

    db.close()
  })

  it('appends policy versions instead of mutating prior ones', () => {
    const db = setupDatabase()

    createAgentPolicyVersion(db, {
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 1',
      createdAt: '2026-03-29T00:00:00.000Z'
    })
    createAgentPolicyVersion(db, {
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 2',
      createdAt: '2026-03-29T00:00:01.000Z'
    })

    const rows = db.prepare(
      `select policy_body as policyBody
       from agent_policy_versions
       where role = ?
       order by created_at asc`
    ).all('governance') as Array<{ policyBody: string }>

    expect(rows.map((row) => row.policyBody)).toEqual(['version 1', 'version 2'])

    db.close()
  })

  it('lists policy versions newest-first with optional role and policy-key filters', () => {
    const db = setupDatabase()

    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-1',
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 1',
      createdAt: '2026-03-29T00:00:00.000Z'
    })
    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-2',
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 2',
      createdAt: '2026-03-29T00:00:02.000Z'
    })
    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-3',
      role: 'review',
      policyKey: 'review.safe_batch.policy',
      policyBody: 'review policy',
      createdAt: '2026-03-29T00:00:01.000Z'
    })

    const allPolicies = listAgentPolicyVersions(db)
    const governancePolicies = listAgentPolicyVersions(db, {
      role: 'governance'
    })
    const keyedPolicies = listAgentPolicyVersions(db, {
      policyKey: 'governance.review.policy'
    })

    expect(allPolicies.map((item) => item.policyVersionId)).toEqual([
      'policy-2',
      'policy-3',
      'policy-1'
    ])
    expect(governancePolicies.map((item) => item.policyVersionId)).toEqual([
      'policy-2',
      'policy-1'
    ])
    expect(keyedPolicies.map((item) => item.policyBody)).toEqual([
      'version 2',
      'version 1'
    ])

    db.close()
  })

  it('round-trips persisted task input and lists suggestions newest-first with status filtering', () => {
    const db = setupDatabase()

    upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Summarize safe group candidates for review queue.'
      },
      dedupeKey: 'review.safe-group::person-1',
      sourceRunId: null,
      priority: 'medium',
      rationale: 'A safe review group is ready for manual inspection.',
      autoRunnable: false,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:00:01.000Z'
    })

    const governanceSuggestion = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::latest',
      sourceRunId: null,
      priority: 'high',
      rationale: 'Repeated enrichment failures are blocking downstream review.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:00:02.000Z'
    })

    const suggestions = listAgentSuggestions(db)
    const governanceOnly = listAgentSuggestions(db, {
      status: 'suggested',
      role: 'governance'
    })

    expect(suggestions[0]).toMatchObject({
      triggerKind: 'governance.failed_runs_detected',
      status: 'suggested',
      priority: 'high',
      rationale: 'Repeated enrichment failures are blocking downstream review.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      attemptCount: 0,
      cooldownUntil: null,
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      }
    })
    expect(governanceOnly.map((item) => item.suggestionId)).toEqual([governanceSuggestion.suggestionId])

    db.close()
  })

  it('updates lastObservedAt when dedupe key repeats instead of inserting duplicates', () => {
    const db = setupDatabase()

    const first = upsertAgentSuggestion(db, {
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Retry failed enrichment jobs from the latest run.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-1',
      sourceRunId: null,
      priority: 'critical',
      rationale: 'A failed enrichment job still blocks downstream work.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:10:00.000Z'
    })

    const second = upsertAgentSuggestion(db, {
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Retry failed enrichment jobs from the latest run.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-1',
      sourceRunId: null,
      priority: 'critical',
      rationale: 'A failed enrichment job still blocks downstream work.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:12:00.000Z'
    })

    const suggestions = listAgentSuggestions(db)

    expect(suggestions).toHaveLength(1)
    expect(second.suggestionId).toBe(first.suggestionId)
    expect(second.lastObservedAt).toBe('2026-03-30T00:12:00.000Z')

    db.close()
  })

  it('keeps dismissed and executed suggestions queryable for audit history', () => {
    const db = setupDatabase()
    const sourceRun = createAgentRun(db, {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Generate source run for proactive suggestion'
    })
    const executedRun = createAgentRun(db, {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Generate executed run for proactive suggestion'
    })

    const dismissed = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Summarize safe group candidates for review queue.'
      },
      dedupeKey: 'review.safe-group::dismissed',
      sourceRunId: null,
      priority: 'medium',
      rationale: 'A safe group is ready for review.',
      autoRunnable: false,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:20:00.000Z'
    })
    const executed = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::executed',
      sourceRunId: sourceRun.runId,
      priority: 'high',
      rationale: 'Recent failures still need a governance summary.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:21:00.000Z'
    })

    dismissAgentSuggestion(db, { suggestionId: dismissed.suggestionId })
    markAgentSuggestionExecuted(db, {
      suggestionId: executed.suggestionId,
      runId: executedRun.runId
    })

    const dismissedRows = listAgentSuggestions(db, { status: 'dismissed' })
    const executedRows = listAgentSuggestions(db, { status: 'executed' })
    const executedRow = getAgentSuggestion(db, { suggestionId: executed.suggestionId })

    expect(dismissedRows.map((item) => item.suggestionId)).toEqual([dismissed.suggestionId])
    expect(executedRows.map((item) => item.suggestionId)).toEqual([executed.suggestionId])
    expect(executedRow?.executedRunId).toBe(executedRun.runId)

    db.close()
  })

  it('creates and updates runtime settings through persistence helpers', () => {
    const db = setupDatabase()

    const defaultSettings = getAgentRuntimeSettings(db)
    const updatedSettings = upsertAgentRuntimeSettings(db, {
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:30:00.000Z'
    })

    expect(defaultSettings).toMatchObject({
      settingsId: 'default',
      autonomyMode: 'manual_only'
    })
    expect(updatedSettings).toMatchObject({
      settingsId: 'default',
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:30:00.000Z'
    })
    expect(getAgentRuntimeSettings(db)).toEqual(updatedSettings)

    db.close()
  })

  it('tracks follow-up provenance, attempts, and runnable suggestions for audit', () => {
    const db = setupDatabase()

    const parent = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Suggest a safe group action for manual review.'
      },
      dedupeKey: 'review.safe-group::parent',
      sourceRunId: null,
      priority: 'high',
      rationale: 'A safe group is ready for follow-up.',
      autoRunnable: false,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:40:00.000Z'
    })

    const followUp = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Apply the safe group recommendation.',
        confirmationToken: 'confirm-safe-group'
      },
      dedupeKey: 'review.safe-group::parent::apply',
      sourceRunId: null,
      priority: 'high',
      rationale: 'The safe group recommendation is ready to apply manually.',
      autoRunnable: false,
      followUpOfSuggestionId: parent.suggestionId,
      observedAt: '2026-03-30T00:41:00.000Z'
    })

    const autoRunnable = upsertAgentSuggestion(db, {
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Retry failed enrichment job job-7.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-7',
      sourceRunId: null,
      priority: 'high',
      rationale: 'Repeated enrichment failures are blocking downstream review.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:42:00.000Z'
    })

    const initialRunnable = listRunnableAgentSuggestions(db, {
      now: '2026-03-30T00:42:30.000Z'
    })

    incrementAgentSuggestionAttempt(db, {
      suggestionId: autoRunnable.suggestionId,
      attemptedAt: '2026-03-30T00:43:00.000Z',
      cooldownUntil: '2026-03-30T00:50:00.000Z'
    })

    const cooledDown = getAgentSuggestion(db, { suggestionId: autoRunnable.suggestionId })
    const runnableAfterCooldown = listRunnableAgentSuggestions(db, {
      now: '2026-03-30T00:44:00.000Z'
    })

    expect(getAgentSuggestion(db, { suggestionId: followUp.suggestionId })).toMatchObject({
      followUpOfSuggestionId: parent.suggestionId,
      autoRunnable: false,
      priority: 'high'
    })
    expect(initialRunnable.map((item) => item.suggestionId)).toEqual([autoRunnable.suggestionId])
    expect(cooledDown).toMatchObject({
      attemptCount: 1,
      cooldownUntil: '2026-03-30T00:50:00.000Z'
    })
    expect(runnableAfterCooldown).toEqual([])

    db.close()
  })
})
