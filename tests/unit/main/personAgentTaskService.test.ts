import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendPersonAgentAuditEvent,
  enqueuePersonAgentRefresh,
  listPersonAgentAuditEvents,
  listPersonAgentTaskRuns,
  listPersonAgentTasks,
  replacePersonAgentFactMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import {
  executePersonAgentTask,
  processPersonAgentTaskQueue,
  syncPersonAgentTasks,
  transitionPersonAgentTask
} from '../../../src/main/services/personAgentTaskService'

const NOW = '2026-04-08T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-tasks-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
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

function seedTaskFixture(db: ReturnType<typeof openDatabase>) {
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

  enqueuePersonAgentRefresh(db, {
    refreshId: 'refresh-1',
    canonicalPersonId: 'cp-1',
    personAgentId: personAgent.personAgentId,
    status: 'pending',
    reasons: ['review_conflict_changed'],
    requestedAt: '2026-04-08T12:05:00.000Z'
  })

  appendPersonAgentAuditEvent(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    eventKind: 'strategy_profile_updated',
    payload: {
      source: 'refresh_rebuild',
      changedFields: ['conflictBehavior']
    },
    createdAt: '2026-04-08T12:01:00.000Z'
  })

  return personAgent
}

describe('personAgentTaskService', () => {
  it('derives pending refresh, conflict, coverage, interaction, and strategy tasks', () => {
    const db = setupDatabase()
    const personAgent = seedTaskFixture(db)

    const tasks = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })

    expect(tasks.map((task) => task.taskKind)).toEqual([
      'await_refresh',
      'resolve_conflict',
      'fill_coverage_gap',
      'expand_topic',
      'review_strategy_change'
    ])
    expect(tasks[0]).toMatchObject({
      personAgentId: personAgent.personAgentId,
      taskKey: 'await_refresh:refresh-1',
      status: 'pending',
      priority: 'high',
      statusChangedAt: NOW,
      statusSource: null,
      statusReason: null
    })

    db.close()
  })

  it('replaces stale task sets instead of duplicating them', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })

    db.prepare("delete from person_agent_refresh_queue where canonical_person_id = ?").run('cp-1')
    db.prepare("delete from person_agent_audit_events where canonical_person_id = ?").run('cp-1')
    db.prepare("delete from person_agent_interaction_memory where canonical_person_id = ?").run('cp-1')

    const tasks = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: '2026-04-08T12:10:00.000Z'
    })

    expect(tasks.map((task) => task.taskKind)).toEqual([
      'resolve_conflict',
      'fill_coverage_gap'
    ])
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1'
    }).map((task) => task.taskKind)).toEqual([
      'resolve_conflict',
      'fill_coverage_gap'
    ])

    db.close()
  })

  it('preserves dismissed task state across sync when the derived task key is unchanged', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    const firstSync = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })
    const conflictTask = firstSync.find((task) => task.taskKind === 'resolve_conflict')

    expect(conflictTask).toBeTruthy()

    transitionPersonAgentTask(db, {
      taskId: conflictTask!.taskId,
      status: 'dismissed',
      source: 'workspace_ui',
      reason: 'handled in external review queue',
      now: '2026-04-08T12:02:00.000Z'
    })

    const resynced = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: '2026-04-08T12:03:00.000Z'
    })
    const dismissedTask = resynced.find((task) => task.taskKind === 'resolve_conflict')

    expect(dismissedTask).toMatchObject({
      taskKey: 'resolve_conflict:conflict.school_name:hash-conflict',
      status: 'dismissed',
      statusChangedAt: '2026-04-08T12:02:00.000Z',
      statusSource: 'workspace_ui',
      statusReason: 'handled in external review queue'
    })

    db.close()
  })

  it('reopens a derived task when its source fingerprint changes', () => {
    const db = setupDatabase()
    const personAgent = seedTaskFixture(db)

    const firstSync = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })
    const conflictTask = firstSync.find((task) => task.taskKind === 'resolve_conflict')

    transitionPersonAgentTask(db, {
      taskId: conflictTask!.taskId,
      status: 'completed',
      source: 'workspace_ui',
      reason: 'reviewed current evidence set',
      now: '2026-04-08T12:02:00.000Z'
    })

    replacePersonAgentFactMemories(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      rows: [
        {
          memoryKey: 'conflict.school_name',
          sectionKey: 'conflict',
          displayLabel: 'school_name',
          summaryValue: 'Pending values: 北京大学 / 清华大学 / 复旦大学 (3 pending)',
          memoryKind: 'conflict',
          confidence: null,
          conflictState: 'open',
          freshnessAt: NOW,
          sourceRefs: [],
          sourceHash: 'hash-conflict-v2'
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

    const resynced = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: '2026-04-08T12:05:00.000Z'
    })
    const reopenedTask = resynced.find((task) => task.taskKind === 'resolve_conflict')

    expect(reopenedTask).toMatchObject({
      taskKey: 'resolve_conflict:conflict.school_name:hash-conflict-v2',
      status: 'pending',
      statusChangedAt: '2026-04-08T12:05:00.000Z',
      statusSource: null,
      statusReason: null
    })

    db.close()
  })

  it('transitions tasks and records audit events for task status updates', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    const [firstTask] = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })

    const processingTask = transitionPersonAgentTask(db, {
      taskId: firstTask.taskId,
      status: 'processing',
      source: 'workspace_ui',
      reason: 'starting review',
      now: '2026-04-08T12:02:00.000Z'
    })
    const completedTask = transitionPersonAgentTask(db, {
      taskId: firstTask.taskId,
      status: 'completed',
      source: 'workspace_ui',
      reason: 'refresh finished and reviewed',
      now: '2026-04-08T12:04:00.000Z'
    })

    expect(processingTask).toMatchObject({
      taskId: firstTask.taskId,
      status: 'processing',
      statusChangedAt: '2026-04-08T12:02:00.000Z',
      statusSource: 'workspace_ui',
      statusReason: 'starting review'
    })
    expect(completedTask).toMatchObject({
      taskId: firstTask.taskId,
      status: 'completed',
      statusChangedAt: '2026-04-08T12:04:00.000Z',
      statusSource: 'workspace_ui',
      statusReason: 'refresh finished and reviewed'
    })
    expect(listPersonAgentAuditEvents(db, {
      canonicalPersonId: 'cp-1',
      eventKind: 'task_status_updated'
    })).toEqual([
      expect.objectContaining({
        eventKind: 'task_status_updated',
        payload: expect.objectContaining({
          taskId: firstTask.taskId,
          taskKey: firstTask.taskKey,
          nextStatus: 'completed',
          source: 'workspace_ui',
          reason: 'refresh finished and reviewed'
        })
      }),
      expect.objectContaining({
        eventKind: 'task_status_updated',
        payload: expect.objectContaining({
          taskId: firstTask.taskId,
          taskKey: firstTask.taskKey,
          nextStatus: 'processing',
          source: 'workspace_ui',
          reason: 'starting review'
        })
      })
    ])

    db.close()
  })

  it('executes conflict-resolution tasks into completed task runs', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    const tasks = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })
    const conflictTask = tasks.find((task) => task.taskKind === 'resolve_conflict')

    const run = executePersonAgentTask(db, {
      taskId: conflictTask!.taskId,
      source: 'workspace_ui',
      now: '2026-04-08T12:06:00.000Z'
    })

    expect(run).toMatchObject({
      taskId: conflictTask!.taskId,
      taskKey: 'resolve_conflict:conflict.school_name:hash-conflict',
      taskKind: 'resolve_conflict',
      runStatus: 'completed',
      summary: 'Review the conflicting evidence for school_name before answering with a single value.',
      suggestedQuestion: '这条冲突信息里，哪一个来源更可信？',
      actionItems: [
        expect.objectContaining({
          kind: 'review_conflict',
          label: 'Review conflicting memory',
          payload: expect.objectContaining({
            memoryKey: 'conflict.school_name'
          })
        })
      ],
      source: 'workspace_ui',
      createdAt: '2026-04-08T12:06:00.000Z'
    })
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      status: 'completed'
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: conflictTask!.taskId,
        status: 'completed'
      })
    ]))
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    })).toEqual([
      expect.objectContaining({
        taskId: conflictTask!.taskId,
        runStatus: 'completed'
      })
    ])
    expect(listPersonAgentAuditEvents(db, {
      canonicalPersonId: 'cp-1',
      eventKind: 'task_executed'
    })).toEqual([
      expect.objectContaining({
        eventKind: 'task_executed',
        payload: expect.objectContaining({
          taskId: conflictTask!.taskId,
          taskKey: conflictTask!.taskKey,
          runStatus: 'completed',
          source: 'workspace_ui'
        })
      })
    ])

    db.close()
  })

  it('records blocked runs for await-refresh tasks without completing them', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    const tasks = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })
    const refreshTask = tasks.find((task) => task.taskKind === 'await_refresh')

    const run = executePersonAgentTask(db, {
      taskId: refreshTask!.taskId,
      source: 'workspace_ui',
      now: '2026-04-08T12:07:00.000Z'
    })

    expect(run).toMatchObject({
      taskId: refreshTask!.taskId,
      taskKind: 'await_refresh',
      runStatus: 'blocked',
      summary: 'Refresh is still pending, so downstream conflict review should wait.',
      suggestedQuestion: null,
      actionItems: [
        expect.objectContaining({
          kind: 'wait_for_refresh',
          label: 'Wait for queued refresh',
          payload: expect.objectContaining({
            refreshId: 'refresh-1'
          })
        })
      ]
    })
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1'
    }).find((task) => task.taskId === refreshTask!.taskId)).toMatchObject({
      taskId: refreshTask!.taskId,
      status: 'pending'
    })

    db.close()
  })

  it('auto-processes executable tasks while leaving await-refresh pending', () => {
    const db = setupDatabase()
    seedTaskFixture(db)

    syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })

    const runs = processPersonAgentTaskQueue(db, {
      canonicalPersonId: 'cp-1',
      source: 'background_queue',
      now: '2026-04-08T12:08:00.000Z'
    })

    expect(runs.map((run) => run.taskKind)).toEqual([
      'resolve_conflict',
      'fill_coverage_gap',
      'expand_topic',
      'review_strategy_change'
    ])
    expect(runs.every((run) => run.runStatus === 'completed')).toBe(true)
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      status: 'pending'
    })).toEqual([
      expect.objectContaining({
        taskKind: 'await_refresh',
        status: 'pending'
      })
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
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    }).map((run) => run.taskKind).sort()).toEqual([
      'expand_topic',
      'fill_coverage_gap',
      'resolve_conflict',
      'review_strategy_change'
    ])

    db.close()
  })
})
