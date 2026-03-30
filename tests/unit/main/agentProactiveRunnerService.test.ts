import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createAgentRun, listAgentSuggestions } from '../../../src/main/services/agentPersistenceService'
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
})
