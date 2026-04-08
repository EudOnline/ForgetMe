import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendPersonAgentAuditEvent,
  enqueuePersonAgentRefresh,
  listPersonAgentTasks,
  replacePersonAgentFactMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import { syncPersonAgentTasks } from '../../../src/main/services/personAgentTaskService'

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
      status: 'pending',
      priority: 'high'
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
})
