import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentAuditEvents,
  listPersonAgentFactMemories,
  listPersonAgentInteractionMemories,
  listPersonAgentRefreshQueue,
  listPersonAgentTaskRuns,
  listPersonAgentTasks
} from '../../../src/main/services/governancePersistenceService'
import { approveProfileAttributeCandidate } from '../../../src/main/services/profileCandidateReviewService'
import {
  enqueuePersonAgentRefreshForCanonicalPeople,
  enqueuePersonAgentRefreshesForBatch,
  processNextPersonAgentRefresh
} from '../../../src/main/services/personAgentRefreshService'

const NOW = '2026-04-06T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-refresh-'))
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

function seedBatchLinkedPerson(db: ReturnType<typeof openDatabase>) {
  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'refresh-test', 'ready', NOW)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'f-1',
    'b-1',
    '/tmp/chat-1.json',
    '/tmp/chat-1.json',
    'chat-1.json',
    '.json',
    'application/json',
    1,
    'hash-1',
    'unique',
    'parsed',
    NOW
  )
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })

  db.prepare(
    `insert into relations (
      id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('rel-person-file', 'p-1', 'person', 'f-1', 'file', 'mentioned_in_file', 1, NOW)

  db.prepare(
    `insert into relations (
      id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('rel-file-batch', 'f-1', 'file', 'b-1', 'batch', 'belongs_to_batch', 1, NOW)
}

function seedPromotionReadyPerson(db: ReturnType<typeof openDatabase>) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-2',
    displayName: 'Bob Li',
    anchorPersonId: 'p-2'
  })

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-seed', 'refresh-seed', 'ready', NOW)

  for (const [fileId, hash] of [
    ['f-10', 'hash-10'],
    ['f-11', 'hash-11'],
    ['f-12', 'hash-12'],
    ['f-13', 'hash-13']
  ] as const) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      fileId,
      'b-seed',
      `/tmp/${fileId}.json`,
      `/tmp/${fileId}.json`,
      `${fileId}.json`,
      '.json',
      'application/json',
      1,
      hash,
      'unique',
      'parsed',
      NOW
    )
  }

  for (const [jobId, fileId, evidenceId] of [
    ['job-10', 'f-10', 'ee-10'],
    ['job-11', 'f-11', 'ee-11'],
    ['job-12', 'f-12', 'ee-12'],
    ['job-13', 'f-13', 'ee-13']
  ] as const) {
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      jobId,
      fileId,
      'document_ocr',
      'fixture',
      'fixture-model',
      'completed',
      1,
      null,
      NOW,
      NOW,
      null,
      '{}',
      NOW,
      NOW
    )
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      evidenceId,
      fileId,
      jobId,
      'structured_fields',
      '{}',
      'low',
      'approved',
      NOW,
      NOW
    )
  }

  for (const [id, fileId] of [
    ['rel-a', 'f-shared-1'],
    ['rel-b', 'f-shared-2']
  ] as const) {
    db.prepare(
      `insert into relations (
        id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, 'p-1', 'person', fileId, 'file', 'mentioned_in_file', 1, NOW)
  }

  db.prepare(
    `insert into relations (
      id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('rel-peer', 'p-2', 'person', 'f-shared-1', 'file', 'mentioned_in_file', 1, NOW)

  db.prepare(
    `insert into communication_evidence (
      id, file_id, ordinal, speaker_display_name, speaker_anchor_person_id, excerpt_text, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)`
  ).run('ce-1', 'f-10', 1, 'Alice Chen', 'p-1', '先把关键记录留在归档里。', NOW)
  db.prepare(
    `insert into communication_evidence (
      id, file_id, ordinal, speaker_display_name, speaker_anchor_person_id, excerpt_text, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)`
  ).run('ce-2', 'f-11', 1, 'Alice Chen', 'p-1', '后面继续补充关键细节。', NOW)

  for (const [id, key, value, fileId, evidenceId] of [
    ['attr-1', 'birthday', '1997-02-03', 'f-10', 'ee-10'],
    ['attr-2', 'school_name', '北京大学', 'f-11', 'ee-11'],
    ['attr-3', 'city', 'Shanghai', 'f-12', 'ee-12'],
    ['attr-4', 'habit', 'Journaling', 'f-13', 'ee-13']
  ] as const) {
    db.prepare(
      `insert into person_profile_attributes (
        id, canonical_person_id, attribute_group, attribute_key, value_json, display_value,
        source_file_id, source_evidence_id, source_candidate_id, provenance_json,
        confidence, status, approved_journal_id, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      'cp-1',
      'identity',
      key,
      JSON.stringify({ value }),
      value,
      fileId,
      evidenceId,
      null,
      '{}',
      0.95,
      'active',
      null,
      NOW,
      NOW
    )
  }

  db.prepare(
    `insert into memory_workspace_sessions (
      id, scope_kind, scope_target_id, title, latest_question, turn_count, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('session-1', 'person', 'cp-1', 'Memory Workspace · Alice Chen', 'question', 2, NOW, NOW)

  for (const [turnId, ordinal, createdAt] of [
    ['turn-1', 1, '2026-04-05T08:00:00.000Z'],
    ['turn-2', 2, '2026-04-05T09:00:00.000Z']
  ] as const) {
    db.prepare(
      `insert into memory_workspace_turns (
        id, session_id, ordinal, question, response_json, provider, model, prompt_hash, context_hash, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      turnId,
      'session-1',
      ordinal,
      'who is she',
      JSON.stringify({
        answer: {
          citations: [
            { citationId: `c-${turnId}-1`, kind: 'file', targetId: 'f-10', label: 'f-10' },
            { citationId: `c-${turnId}-2`, kind: 'file', targetId: 'f-11', label: 'f-11' }
          ]
        },
        guardrail: {
          citationCount: 2
        }
      }),
      null,
      null,
      `prompt-${turnId}`,
      `context-${turnId}`,
      createdAt
    )
  }
}

function seedReviewApprovalFixture(db: ReturnType<typeof openDatabase>) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-review', 'review-refresh', 'ready', NOW)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'f-1',
    'b-review',
    '/tmp/review.pdf',
    '/tmp/review.pdf',
    'review.pdf',
    '.pdf',
    'application/pdf',
    1,
    'hash-review',
    'unique',
    'parsed',
    NOW
  )
  db.prepare(`insert into enrichment_jobs (
    id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
    started_at, finished_at, error_message, usage_json, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'job-1',
    'f-1',
    'document_ocr',
    'fixture',
    'fixture-model',
    'completed',
    1,
    null,
    NOW,
    NOW,
    null,
    '{}',
    NOW,
    NOW
  )
  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ee-1',
    'f-1',
    'job-1',
    'structured_fields',
    '{}',
    'low',
    'approved',
    NOW,
    NOW
  )

  db.prepare(
    `insert into profile_attribute_candidates (
      id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id,
      attribute_group, attribute_key, value_json, proposal_basis_json, reason_code,
      confidence, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'pac-1',
    'cp-1',
    'f-1',
    'ee-1',
    'fc-1',
    'education',
    'school_name',
    '{"value":"北京大学"}',
    '{}',
    'singleton_conflict',
    0.95,
    'pending',
    NOW
  )

  db.prepare(
    `insert into review_queue (
      id, item_type, candidate_id, status, priority, confidence, summary_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'rq-1',
    'profile_attribute_candidate',
    'pac-1',
    'pending',
    0,
    0.95,
    '{"attributeKey":"school_name"}',
    NOW
  )
}

function seedPendingConflictProfileCandidates(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  createdAt: string
}) {
  for (const [suffix, value, fileId, evidenceId] of [
    ['1', '北京大学', 'f-12', 'ee-12'],
    ['2', '清华大学', 'f-13', 'ee-13']
  ] as const) {
    db.prepare(
      `insert into profile_attribute_candidates (
        id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id,
        attribute_group, attribute_key, value_json, proposal_basis_json, reason_code,
        confidence, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `pac-conflict-${suffix}`,
      input.canonicalPersonId,
      fileId,
      evidenceId,
      `fc-conflict-${suffix}`,
      'education',
      'school_name',
      JSON.stringify({ value }),
      JSON.stringify({ reason: 'refresh-strategy-test' }),
      'projection_conflict',
      0.95,
      'pending',
      input.createdAt
    )

    db.prepare(
      `insert into review_queue (
        id, item_type, candidate_id, status, priority, confidence, summary_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `rq-conflict-${suffix}`,
      'profile_attribute_candidate',
      `pac-conflict-${suffix}`,
      'pending',
      0,
      0.95,
      JSON.stringify({ attributeKey: 'school_name' }),
      input.createdAt
    )
  }
}

describe('personAgentRefreshService', () => {
  it('enqueues import-linked refreshes and coalesces repeated pending reasons', () => {
    const db = setupDatabase()
    seedBatchLinkedPerson(db)

    enqueuePersonAgentRefreshesForBatch(db, {
      batchId: 'b-1',
      reason: 'import_batch',
      requestedAt: NOW
    })
    enqueuePersonAgentRefreshForCanonicalPeople(db, {
      canonicalPersonIds: ['cp-1'],
      reason: 'review_approved',
      requestedAt: '2026-04-06T12:05:00.000Z'
    })

    const queue = listPersonAgentRefreshQueue(db, {
      status: 'pending'
    })

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      canonicalPersonId: 'cp-1',
      status: 'pending',
      reasons: ['import_batch', 'review_approved']
    })

    db.close()
  })

  it('enqueues refreshes after approved review decisions', () => {
    const db = setupDatabase()
    seedReviewApprovalFixture(db)

    approveProfileAttributeCandidate(db, {
      queueItemId: 'rq-1',
      actor: 'local-user'
    })

    const queue = listPersonAgentRefreshQueue(db, {
      status: 'pending'
    })

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      canonicalPersonId: 'cp-1',
      reasons: ['review_approved']
    })

    db.close()
  })

  it('processes a pending refresh by recomputing promotion and refreshing fact memory', () => {
    const db = setupDatabase()
    seedPromotionReadyPerson(db)

    enqueuePersonAgentRefreshForCanonicalPeople(db, {
      canonicalPersonIds: ['cp-1'],
      reason: 'relationship_changed',
      requestedAt: NOW
    })

    const processed = processNextPersonAgentRefresh(db, {
      now: NOW
    })

    const queue = listPersonAgentRefreshQueue(db, {})
    const memories = listPersonAgentFactMemories(db, {
      canonicalPersonId: 'cp-1'
    })
    const refreshedAgent = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: 'cp-1'
    })
    const interactionMemories = processed?.personAgentId
      ? listPersonAgentInteractionMemories(db, {
          personAgentId: processed.personAgentId
        })
      : []

    expect(processed).toMatchObject({
      canonicalPersonId: 'cp-1',
      status: 'completed'
    })
    expect(queue[0]?.status).toBe('completed')
    expect(memories.length).toBeGreaterThan(0)
    expect(refreshedAgent?.strategyProfile).toEqual({
      profileVersion: 1,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'balanced'
    })
    expect(interactionMemories).toEqual([
      expect.objectContaining({
        memoryKey: 'topic.profile_facts',
        questionCount: 2,
        supportingTurnIds: ['turn-1', 'turn-2']
      })
    ])

    db.close()
  })

  it('increments strategy profile version and records an audit event when refresh changes the strategy', () => {
    const db = setupDatabase()
    seedPromotionReadyPerson(db)

    enqueuePersonAgentRefreshForCanonicalPeople(db, {
      canonicalPersonIds: ['cp-1'],
      reason: 'relationship_changed',
      requestedAt: NOW
    })

    processNextPersonAgentRefresh(db, {
      now: NOW
    })

    const initialAgent = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(initialAgent?.strategyProfile).toEqual({
      profileVersion: 1,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'balanced'
    })
    expect(listPersonAgentAuditEvents(db, {
      canonicalPersonId: 'cp-1'
    }).filter((event) => event.eventKind === 'strategy_profile_updated')).toEqual([])

    seedPendingConflictProfileCandidates(db, {
      canonicalPersonId: 'cp-1',
      createdAt: '2026-04-06T12:10:00.000Z'
    })

    enqueuePersonAgentRefreshForCanonicalPeople(db, {
      canonicalPersonIds: ['cp-1'],
      reason: 'review_conflict_changed',
      requestedAt: '2026-04-06T12:15:00.000Z'
    })

    processNextPersonAgentRefresh(db, {
      now: '2026-04-06T12:15:00.000Z'
    })

    const refreshedAgent = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: 'cp-1'
    })
    const auditEvents = listPersonAgentAuditEvents(db, {
      canonicalPersonId: 'cp-1'
    }).filter((event) => event.eventKind === 'strategy_profile_updated')

    expect(refreshedAgent?.strategyProfile).toEqual({
      profileVersion: 2,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'conflict_forward'
    })
    expect(auditEvents).toEqual([
      expect.objectContaining({
        eventKind: 'strategy_profile_updated',
        payload: expect.objectContaining({
          source: 'refresh_rebuild',
          reasons: ['review_conflict_changed'],
          changedFields: ['conflictBehavior'],
          previousProfile: expect.objectContaining({
            profileVersion: 1,
            conflictBehavior: 'balanced'
          }),
          nextProfile: expect.objectContaining({
            profileVersion: 2,
            conflictBehavior: 'conflict_forward'
          })
        })
      })
    ])

    db.close()
  })

  it('resyncs and auto-processes person-agent tasks after refresh completion', () => {
    const db = setupDatabase()
    seedPromotionReadyPerson(db)

    enqueuePersonAgentRefreshForCanonicalPeople(db, {
      canonicalPersonIds: ['cp-1'],
      reason: 'relationship_changed',
      requestedAt: NOW
    })

    processNextPersonAgentRefresh(db, {
      now: NOW
    })

    const tasks = listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1'
    })
    const expandTask = tasks.find((task) => task.taskKind === 'expand_topic')

    expect(expandTask).toMatchObject({
      taskKind: 'expand_topic',
      taskKey: 'expand_topic:topic.profile_facts:2:4',
      status: 'completed'
    })
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    }).map((run) => run.taskKind).sort()).toEqual([
      'expand_topic',
      'fill_coverage_gap'
    ])

    db.close()
  })
})
