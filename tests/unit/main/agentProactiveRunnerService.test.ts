import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import {
  createAgentRun,
  getAgentRun,
  listAgentSuggestions,
  upsertAgentRuntimeSettings,
  upsertAgentSuggestion
} from '../../../src/main/services/agentPersistenceService'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createAgentProactiveRunner } from '../../../src/main/services/agentProactiveRunnerService'

function setupAppPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-proactive-runner-'))
  return ensureAppPaths(root)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createAgentProactiveRunner', () => {
  it('refreshes proactive suggestions on an interval using the default cycle', async () => {
    vi.useFakeTimers()
    const appPaths = setupAppPaths()
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)
    createAgentRun(db, {
      runId: 'run-failed-1',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize recent runtime failures.',
      status: 'failed',
      errorMessage: 'runtime failure',
      createdAt: '2026-03-30T00:30:00.000Z',
      updatedAt: '2026-03-30T00:30:00.000Z'
    })
    db.close()

    const runner = createAgentProactiveRunner({
      appPaths,
      intervalMs: 20
    })

    await vi.advanceTimersByTimeAsync(20)
    runner.stop()

    const verifyDb = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    const suggestions = listAgentSuggestions(verifyDb, {
      status: 'suggested'
    })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      triggerKind: 'governance.failed_runs_detected',
      dedupeKey: 'governance.failed-runs::latest'
    })

    verifyDb.close()
  })

  it('starts a polling loop and can stop cleanly', async () => {
    vi.useFakeTimers()
    const appPaths = setupAppPaths()
    const runCycle = vi.fn().mockResolvedValue(false)

    const runner = createAgentProactiveRunner({
      appPaths,
      intervalMs: 20,
      runCycle
    })

    await vi.advanceTimersByTimeAsync(20)
    expect(runCycle).toHaveBeenCalledTimes(1)

    runner.stop()
    await vi.advanceTimersByTimeAsync(60)
    expect(runCycle).toHaveBeenCalledTimes(1)
  })

  it('reads runtime settings before auto-running safe suggestions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T01:00:00.000Z'))
    const appPaths = setupAppPaths()
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)
    upsertAgentRuntimeSettings(db, {
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:59:00.000Z'
    })
    const autoRunnable = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::auto-run',
      sourceRunId: null,
      priority: 'medium',
      rationale: 'Failed agent runs were detected and should be summarized.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:58:00.000Z'
    })
    const disallowed = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Apply safe group group-safe-1.'
      },
      dedupeKey: 'review.safe-group::blocked-auto-run',
      sourceRunId: null,
      priority: 'high',
      rationale: 'A destructive follow-up still requires manual confirmation.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T00:58:30.000Z'
    })
    db.close()

    const runner = createAgentProactiveRunner({
      appPaths,
      intervalMs: 20
    })

    await vi.advanceTimersByTimeAsync(20)
    runner.stop()

    const verifyDb = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    const executedSuggestion = listAgentSuggestions(verifyDb).find((item) => item.suggestionId === autoRunnable.suggestionId)
    const blockedSuggestion = listAgentSuggestions(verifyDb).find((item) => item.suggestionId === disallowed.suggestionId)
    const executedRun = executedSuggestion?.executedRunId
      ? getAgentRun(verifyDb, { runId: executedSuggestion.executedRunId })
      : null

    expect(executedSuggestion?.status).toBe('executed')
    expect(executedRun?.executionOrigin).toBe('auto_runner')
    expect(blockedSuggestion?.executedRunId).toBeNull()

    verifyDb.close()
  })

  it('does not auto-run in manual_only mode and cools down failed auto-run attempts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T02:00:00.000Z'))
    const appPaths = setupAppPaths()
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)
    upsertAgentRuntimeSettings(db, {
      autonomyMode: 'manual_only',
      updatedAt: '2026-03-30T01:59:00.000Z'
    })
    const manualSuggestion = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::manual-only',
      sourceRunId: null,
      priority: 'medium',
      rationale: 'Failed agent runs were detected and should be summarized.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T01:58:00.000Z'
    })
    db.close()

    const manualRunner = createAgentProactiveRunner({
      appPaths,
      intervalMs: 20
    })

    await vi.advanceTimersByTimeAsync(20)
    manualRunner.stop()

    const manualDb = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    const manualRow = listAgentSuggestions(manualDb).find((item) => item.suggestionId === manualSuggestion.suggestionId)

    expect(manualRow?.status).toBe('suggested')
    expect(manualRow?.executedRunId).toBeNull()
    manualDb.close()

    const failedPaths = setupAppPaths()
    const failedDb = openDatabase(path.join(failedPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(failedDb)
    upsertAgentRuntimeSettings(failedDb, {
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T01:59:30.000Z'
    })
    const failedSuggestion = upsertAgentSuggestion(failedDb, {
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Retry enrichment without a valid job id.'
      },
      dedupeKey: 'ingestion.failed-enrichment::auto-run-failure',
      sourceRunId: null,
      priority: 'high',
      rationale: 'A failed enrichment job is blocking downstream review.',
      autoRunnable: true,
      followUpOfSuggestionId: null,
      observedAt: '2026-03-30T01:59:45.000Z'
    })
    failedDb.close()

    const failedRunner = createAgentProactiveRunner({
      appPaths: failedPaths,
      intervalMs: 20
    })

    await vi.advanceTimersByTimeAsync(20)
    failedRunner.stop()

    const verifyFailedDb = openDatabase(path.join(failedPaths.sqliteDir, 'archive.sqlite'))
    const failedRow = listAgentSuggestions(verifyFailedDb).find((item) => item.suggestionId === failedSuggestion.suggestionId)
    const failedRun = verifyFailedDb.prepare(
      `select executed_run_id as executedRunId from agent_suggestions where id = ?`
    ).get(failedSuggestion.suggestionId) as { executedRunId: string | null }
    const latestRun = verifyFailedDb.prepare(
      `select id as runId from agent_runs order by created_at desc limit 1`
    ).get() as { runId: string } | undefined
    const failedRunDetail = latestRun ? getAgentRun(verifyFailedDb, { runId: latestRun.runId }) : null

    expect(failedRun.executedRunId).toBeNull()
    expect(failedRow).toMatchObject({
      attemptCount: 1,
      cooldownUntil: expect.any(String)
    })
    expect(failedRunDetail?.status).toBe('failed')
    expect(failedRunDetail?.executionOrigin).toBe('auto_runner')

    verifyFailedDb.close()
  })
})
