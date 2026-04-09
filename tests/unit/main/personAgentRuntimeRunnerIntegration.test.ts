import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendPersonAgentAuditEvent,
  enqueuePersonAgentRefresh,
  getPersonAgentRuntimeRunnerState,
  listPersonAgentTaskRuns,
  listPersonAgentTasks,
  replacePersonAgentFactMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'
import { syncPersonAgentTasks } from '../../../src/main/services/personAgentTaskService'
import {
  createPersonAgentRuntimeRunner,
  PERSON_AGENT_RUNTIME_RUNNER_NAME,
  runPersonAgentRuntimeRunnerCycle
} from '../../../src/main/services/personAgentRuntimeRunnerService'

const NOW = '2026-04-09T01:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-task-queue-runner-'))
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

function seedExecutableTaskFixture(
  db: ReturnType<typeof openDatabase>,
  appPaths?: ReturnType<typeof ensureAppPaths>
) {
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

  replacePersonAgentFactMemories(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    rows: [
      {
        memoryKey: 'conflict.school_name',
        sectionKey: 'conflict',
        displayLabel: 'school_name',
        summaryValue: 'Pending values: 北京大学 / 清华大学 (2 pending)',
        memoryKind: 'conflict',
        confidence: null,
        conflictState: 'open',
        freshnessAt: NOW,
        sourceRefs: [],
        sourceHash: 'hash-conflict'
      },
      {
        memoryKey: 'coverage.work.empty',
        sectionKey: 'coverage',
        displayLabel: 'Work coverage gap',
        summaryValue: 'No approved work facts yet.',
        memoryKind: 'coverage_gap',
        confidence: null,
        conflictState: 'none',
        freshnessAt: null,
        sourceRefs: [],
        sourceHash: 'hash-gap'
      }
    ]
  })

  upsertPersonAgentInteractionMemory(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    memoryKey: 'topic.profile_facts',
    topicLabel: 'Profile facts',
    summary: 'Birthday asked 3 times.',
    questionCount: 3,
    citationCount: 1,
    outcomeKinds: ['answered'],
    supportingTurnIds: ['turn-1'],
    lastQuestionAt: NOW,
    lastCitationAt: NOW
  })

  appendPersonAgentAuditEvent(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    eventKind: 'strategy_profile_updated',
    payload: {
      source: 'refresh_rebuild',
      changedFields: ['conflictBehavior']
    },
    createdAt: '2026-04-09T01:01:00.000Z'
  })

  materializePersonAgentCapsule(db, {
    appPaths,
    personAgent,
    activationSource: 'import_batch',
    checkpointKind: 'activation',
    summary: 'Initial capsule for task runner tests.',
    now: NOW
  })

  syncPersonAgentTasks(db, {
    canonicalPersonId: 'cp-1',
    now: NOW
  })
}

function seedBlockedTaskFixture(db: ReturnType<typeof openDatabase>) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-2',
    displayName: 'Bob Li',
    anchorPersonId: 'p-2'
  })

  const personAgent = upsertPersonAgent(db, {
    canonicalPersonId: 'cp-2',
    status: 'active',
    promotionTier: 'high_signal',
    promotionScore: 65,
    promotionReasonSummary: 'Active person agent.',
    strategyProfile: {
      profileVersion: 1,
      responseStyle: 'concise',
      evidencePreference: 'balanced',
      conflictBehavior: 'balanced'
    },
    factsVersion: 1,
    interactionVersion: 1
  })

  enqueuePersonAgentRefresh(db, {
    refreshId: 'refresh-only',
    canonicalPersonId: 'cp-2',
    personAgentId: personAgent.personAgentId,
    status: 'pending',
    reasons: ['import_batch'],
    requestedAt: NOW
  })

  syncPersonAgentTasks(db, {
    canonicalPersonId: 'cp-2',
    now: NOW
  })
}

describe('personAgentRuntimeRunnerService', () => {
  it('runs a queue cycle across pending executable tasks and returns true', () => {
    const { appPaths, db } = setupDatabase()
    seedExecutableTaskFixture(db, appPaths)

    const processed = runPersonAgentRuntimeRunnerCycle(db, {
      source: 'background_runner',
      now: '2026-04-09T01:05:00.000Z'
    })

    expect(processed).toBe(true)
    const taskRuns = listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(taskRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskKind: 'review_strategy_change',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: expect.stringMatching(/^person-agent:/)
      }),
      expect.objectContaining({
        taskKind: 'expand_topic',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: expect.stringMatching(/^person-agent:/)
      }),
      expect.objectContaining({
        taskKind: 'fill_coverage_gap',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: expect.stringMatching(/^person-agent:/)
      }),
      expect.objectContaining({
        taskKind: 'resolve_conflict',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: expect.stringMatching(/^person-agent:/)
      })
    ]))
    expect(taskRuns.map((run) => run.taskKind).sort()).toEqual([
      'expand_topic',
      'fill_coverage_gap',
      'resolve_conflict',
      'review_strategy_change'
    ])
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      status: 'completed'
    }).map((task) => task.taskKind)).toEqual([
      'resolve_conflict',
      'fill_coverage_gap',
      'expand_topic',
      'review_strategy_change'
    ])
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
      lastStartedAt: '2026-04-09T01:05:00.000Z',
      lastCompletedAt: '2026-04-09T01:05:00.000Z',
      lastFailedAt: null,
      lastProcessedTaskCount: 4,
      totalProcessedTaskCount: 4,
      lastError: null,
      updatedAt: '2026-04-09T01:05:00.000Z'
    })
    expect(getPersonAgentRuntimeRunnerState(db, {
      runnerName: PERSON_AGENT_RUNTIME_RUNNER_NAME
    })).toEqual(expect.objectContaining({
      runnerName: PERSON_AGENT_RUNTIME_RUNNER_NAME,
      lastProcessedTaskCount: 4,
      lastProcessedCanonicalPersonId: 'cp-1',
      lastProcessedCapsuleId: expect.any(String),
      lastProcessedCapsuleSessionNamespace: expect.stringMatching(/^person-agent:/)
    }))
    const runtimeStateArtifact = JSON.parse(
      fs.readFileSync(
        path.join(appPaths.personAgentStateDir, taskRuns[0]!.personAgentId, 'runtime-state.json'),
        'utf8'
      )
    ) as Record<string, unknown>
    const activityLogEntries = fs.readFileSync(
      path.join(appPaths.personAgentStateDir, taskRuns[0]!.personAgentId, 'activity-log.jsonl'),
      'utf8'
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(runtimeStateArtifact).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      personAgentId: taskRuns[0]!.personAgentId,
      latestTaskRunId: expect.any(String),
      latestTaskRunKind: expect.stringMatching(/resolve_conflict|fill_coverage_gap|expand_topic|review_strategy_change/),
      runtimeRunner: expect.objectContaining({
        runnerName: PERSON_AGENT_RUNTIME_RUNNER_NAME,
        status: 'idle',
        lastCompletedAt: '2026-04-09T01:05:00.000Z'
      })
    }))
    expect(activityLogEntries.at(-1)).toEqual(expect.objectContaining({
      eventKind: 'task_run_recorded',
      canonicalPersonId: 'cp-1',
      personAgentId: taskRuns[0]!.personAgentId,
      runId: expect.any(String),
      taskKind: expect.stringMatching(/resolve_conflict|fill_coverage_gap|expand_topic|review_strategy_change/)
    }))

    db.close()
  })

  it('returns true when the runtime runner completes a pending refresh even without task runs', () => {
    const { db } = setupDatabase()
    seedBlockedTaskFixture(db)

    const processed = runPersonAgentRuntimeRunnerCycle(db, {
      source: 'background_runner',
      now: '2026-04-09T01:06:00.000Z'
    })

    expect(processed).toBe(true)
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-2'
    })).toEqual([])
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-2'
    })).toEqual([
      expect.objectContaining({
        taskKind: 'await_refresh',
        status: 'pending'
      })
    ])
    expect(
      db.prepare(
        `select
          runner_name as runnerName,
          status,
          last_processed_task_count as lastProcessedTaskCount,
          total_processed_task_count as totalProcessedTaskCount,
          last_error as lastError
         from person_agent_runtime_runner_state
         where runner_name = ?`
      ).get(PERSON_AGENT_RUNTIME_RUNNER_NAME)
    ).toEqual({
      runnerName: PERSON_AGENT_RUNTIME_RUNNER_NAME,
      status: 'idle',
      lastProcessedTaskCount: 0,
      totalProcessedTaskCount: 0,
      lastError: null
    })

    db.close()
  })

  it('records runner failures when task queue processing throws', () => {
    const { db } = setupDatabase()

    expect(() => runPersonAgentRuntimeRunnerCycle(db, {
      now: '2026-04-09T01:07:00.000Z',
      processRuntimeLoop: (() => {
        throw new Error('runner exploded')
      }) as never
    } as never)).toThrow('runner exploded')

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
      status: 'error',
      lastStartedAt: '2026-04-09T01:07:00.000Z',
      lastCompletedAt: null,
      lastFailedAt: '2026-04-09T01:07:00.000Z',
      lastProcessedTaskCount: 0,
      totalProcessedTaskCount: 0,
      lastError: 'runner exploded',
      updatedAt: '2026-04-09T01:07:00.000Z'
    })

    db.close()
  })

  it('starts a polling loop and stops cleanly', async () => {
    vi.useFakeTimers()
    try {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-task-runner-loop-'))
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
