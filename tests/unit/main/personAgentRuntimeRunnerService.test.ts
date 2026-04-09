import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  createPersonAgentRuntimeRunner,
  PERSON_AGENT_RUNTIME_RUNNER_NAME,
  runPersonAgentRuntimeRunnerCycle,
  runPersonAgentRuntimeStartupRepairs
} from '../../../src/main/services/personAgentRuntimeRunnerService'

const NOW = '2026-04-09T10:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-runtime-runner-'))
  const appPaths = ensureAppPaths(root)
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return {
    root,
    appPaths,
    db
  }
}

describe('personAgentRuntimeRunnerService', () => {
  it('owns startup repairs through the runtime runner startup path', () => {
    const { appPaths } = setupDatabase()
    const runBackfill = vi.fn().mockReturnValue({
      scannedCount: 2,
      repairedCount: 1,
      skippedCount: 1,
      repairedPersonAgentIds: ['pa-1']
    })

    const result = runPersonAgentRuntimeStartupRepairs({
      appPaths,
      now: NOW,
      runBackfill
    })

    expect(runBackfill).toHaveBeenCalledWith({
      appPaths,
      now: NOW
    })
    expect(result).toEqual({
      scannedCount: 2,
      repairedCount: 1,
      skippedCount: 1,
      repairedPersonAgentIds: ['pa-1']
    })
  })

  it('runs refresh work before runtime loop work and records runtime runner state', () => {
    const { db } = setupDatabase()
    const processNextRefresh = vi.fn().mockReturnValue({
      refreshId: 'refresh-1',
      canonicalPersonId: 'cp-1',
      status: 'completed'
    })
    const processRuntimeLoop = vi.fn().mockReturnValue([
      {
        runId: 'run-1',
        taskId: 'task-1',
        taskKey: 'resolve_conflict:conflict.school_name:hash-conflict',
        personAgentId: 'pa-1',
        canonicalPersonId: 'cp-1',
        taskKind: 'resolve_conflict',
        runStatus: 'completed',
        summary: 'Review the conflicting evidence.',
        suggestedQuestion: '哪一个来源更可信？',
        actionItems: [],
        source: 'background_runner',
        createdAt: NOW,
        updatedAt: NOW
      }
    ])

    const processed = runPersonAgentRuntimeRunnerCycle(db, {
      now: NOW,
      processNextRefresh,
      processRuntimeLoop
    })

    expect(processed).toBe(true)
    expect(processNextRefresh).toHaveBeenCalledWith(db, {
      appPaths: undefined,
      now: NOW
    })
    expect(processRuntimeLoop).toHaveBeenCalledWith(db, {
      limit: undefined,
      source: 'background_runner',
      now: NOW
    })
    expect(processNextRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      processRuntimeLoop.mock.invocationCallOrder[0]
    )
    expect(
      db.prepare(
        `select
          runner_name as runnerName,
          status,
          last_started_at as lastStartedAt,
          last_completed_at as lastCompletedAt,
          last_failed_at as lastFailedAt,
          last_processed_task_count as lastProcessedTaskCount,
          total_processed_task_count as totalProcessedTaskCount,
          last_error as lastError,
          updated_at as updatedAt
         from person_agent_task_queue_runner_state
         where runner_name = ?`
      ).get(PERSON_AGENT_RUNTIME_RUNNER_NAME)
    ).toEqual({
      runnerName: PERSON_AGENT_RUNTIME_RUNNER_NAME,
      status: 'idle',
      lastStartedAt: NOW,
      lastCompletedAt: NOW,
      lastFailedAt: null,
      lastProcessedTaskCount: 1,
      totalProcessedTaskCount: 1,
      lastError: null,
      updatedAt: NOW
    })

    db.close()
  })

  it('starts a polling runtime loop and stops cleanly', async () => {
    vi.useFakeTimers()
    try {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-runtime-runner-loop-'))
      const appPaths = ensureAppPaths(root)
      const runCycle = vi.fn().mockResolvedValue(false)

      const runner = createPersonAgentRuntimeRunner({
        appPaths,
        intervalMs: 20,
        runCycle
      })

      await vi.advanceTimersByTimeAsync(20)
      expect(runCycle).toHaveBeenCalledTimes(1)

      runner.stop()
      await vi.advanceTimersByTimeAsync(60)
      expect(runCycle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
