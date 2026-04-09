import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import type { PersonAgentRefreshQueueRecord } from '../../../src/shared/archiveContracts'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'
import { upsertPersonAgent } from '../../../src/main/services/governancePersistenceService'
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

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  displayName: string
  anchorPersonId: string
}) {
  db.prepare(
    `insert into people (id, display_name, source_type, confidence, created_at)
     values (?, ?, ?, ?, ?)`
  ).run(
    input.anchorPersonId,
    input.displayName,
    'chat',
    1,
    NOW
  )

  db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.canonicalPersonId,
    input.displayName,
    input.displayName.toLowerCase(),
    1,
    4,
    '[]',
    'approved',
    NOW,
    NOW
  )

  db.prepare(
    `insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    `${input.canonicalPersonId}:${input.anchorPersonId}`,
    input.canonicalPersonId,
    input.anchorPersonId,
    'active',
    NOW,
    NOW
  )
}

function seedCapsuleFixture(db: ReturnType<typeof openDatabase>, appPaths: ReturnType<typeof ensureAppPaths>) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })

  const personAgent = upsertPersonAgent(db, {
    canonicalPersonId: 'cp-1',
    status: 'active',
    promotionTier: 'high_signal',
    promotionScore: 81,
    promotionReasonSummary: 'High signal person.',
    strategyProfile: {
      profileVersion: 2,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'conflict_forward'
    },
    factsVersion: 3,
    interactionVersion: 4
  })

  const capsule = materializePersonAgentCapsule(db, {
    appPaths,
    personAgent,
    activationSource: 'import_batch',
    checkpointKind: 'activation',
    summary: 'Initial capsule for runtime runner tests.',
    now: NOW
  })

  return {
    personAgent,
    capsule
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
    expect(processNextRefresh).toHaveBeenCalledWith(db, expect.objectContaining({
      appPaths: undefined,
      now: NOW,
      processRuntimeLoop: expect.any(Function)
    }))
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
         from person_agent_runtime_runner_state
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

  it('counts refresh-triggered runtime runs and syncs capsule artifacts even when the background loop is empty', () => {
    const { appPaths, db } = setupDatabase()
    const { personAgent } = seedCapsuleFixture(db, appPaths)
    const processRuntimeLoop = vi
      .fn()
      .mockReturnValueOnce([
        {
          runId: 'run-refresh-1',
          taskId: 'task-refresh-1',
          taskKey: 'resolve_conflict:conflict.school_name:hash-conflict',
          personAgentId: personAgent.personAgentId,
          canonicalPersonId: 'cp-1',
          taskKind: 'resolve_conflict',
          runStatus: 'completed',
          summary: 'Review the conflicting evidence.',
          suggestedQuestion: '哪一个来源更可信？',
          actionItems: [],
          source: 'refresh_sync',
          createdAt: NOW,
          updatedAt: NOW
        }
      ])
      .mockReturnValueOnce([])
    const processNextRefresh = vi.fn((runtimeDb, input = {}) => {
      input.processRuntimeLoop?.(runtimeDb, {
        canonicalPersonId: 'cp-1',
        source: 'refresh_sync',
        now: NOW
      })
      const refreshRecord: PersonAgentRefreshQueueRecord = {
        refreshId: 'refresh-1',
        canonicalPersonId: 'cp-1',
        personAgentId: personAgent.personAgentId,
        status: 'completed',
        reasons: ['runtime_sync'],
        requestedAt: NOW,
        startedAt: NOW,
        completedAt: NOW,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW
      }
      return refreshRecord
    })
    const syncRuntimeArtifacts = vi.fn()

    const processed = runPersonAgentRuntimeRunnerCycle(db, {
      appPaths,
      now: NOW,
      processNextRefresh,
      processRuntimeLoop,
      syncRuntimeArtifacts
    })

    expect(processed).toBe(true)
    expect(processRuntimeLoop).toHaveBeenNthCalledWith(1, db, {
      canonicalPersonId: 'cp-1',
      source: 'refresh_sync',
      now: NOW
    })
    expect(processRuntimeLoop).toHaveBeenNthCalledWith(2, db, {
      limit: undefined,
      source: 'background_runner',
      now: NOW
    })
    expect(syncRuntimeArtifacts).toHaveBeenCalledWith(db, expect.objectContaining({
      now: NOW,
      personAgent: expect.objectContaining({
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1'
      }),
      capsule: expect.objectContaining({
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1'
      })
    }))
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
         from person_agent_runtime_runner_state
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
