import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { setRelationshipLabel } from '../../../src/main/services/graphService'
import {
  askMemoryWorkspacePersisted,
  getMemoryWorkspaceSession,
  listMemoryWorkspaceSessions
} from '../../../src/main/services/memoryWorkspaceSessionService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-memory-session-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedConversationScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-13T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run(
    'b-1',
    'memory-session',
    'ready',
    createdAt
  )

  for (const [fileId, fileName, extension, hash] of [
    ['f-1', 'chat-1.json', '.json', 'hash-1'],
    ['f-2', 'transcript-1.pdf', '.pdf', 'hash-2'],
    ['f-3', 'transcript-2.pdf', '.pdf', 'hash-3']
  ]) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      fileId,
      'b-1',
      `/tmp/${fileName}`,
      `/tmp/${fileName}`,
      fileName,
      extension,
      extension === '.pdf' ? 'application/pdf' : 'application/json',
      1,
      hash,
      'unique',
      'parsed',
      createdAt
    )
  }

  for (const [personId, name] of [
    ['p-1', 'Alice Chen'],
    ['p-2', 'Bob Li']
  ]) {
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run(
      personId,
      name,
      'chat_participant',
      1,
      createdAt
    )
  }

  for (const [personId, name, normalizedName] of [
    ['cp-1', 'Alice Chen', 'alice chen'],
    ['cp-2', 'Bob Li', 'bob li']
  ]) {
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      personId,
      name,
      normalizedName,
      1,
      createdAt,
      createdAt,
      1,
      '[]',
      'approved',
      createdAt,
      createdAt
    )
  }

  db.prepare('insert into person_aliases (id, canonical_person_id, anchor_person_id, display_name, normalized_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'pa-1',
    'cp-1',
    'p-1',
    'Alice C.',
    'alice c.',
    'manual',
    1,
    createdAt
  )

  for (const [membershipId, canonicalPersonId, anchorPersonId] of [
    ['pm-1', 'cp-1', 'p-1'],
    ['pm-2', 'cp-2', 'p-2']
  ]) {
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(
      membershipId,
      canonicalPersonId,
      anchorPersonId,
      'active',
      createdAt,
      createdAt
    )
  }

  for (const [relationId, sourceId, targetId] of [
    ['rel-1', 'p-1', 'f-1'],
    ['rel-2', 'p-2', 'f-1'],
    ['rel-3', 'p-1', 'f-2'],
    ['rel-4', 'p-1', 'f-3']
  ]) {
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
      relationId,
      sourceId,
      'person',
      targetId,
      'file',
      'mentioned_in_file',
      1,
      createdAt
    )
  }

  for (const [evidenceId, fileId, ordinal, speakerDisplayName, speakerAnchorPersonId, text] of [
    ['ce-1', 'f-1', 1, 'Alice Chen', 'p-1', '我们还是把这些记录留在归档里，后面查起来更稳妥。'],
    ['ce-2', 'f-1', 2, 'Bob Li', 'p-2', '先把聊天整理成归档笔记，这样以后能找到。'],
    ['ce-3', 'f-3', 1, 'Alice Chen', 'p-1', '重要细节继续记下来，后面回看归档会更清楚。']
  ] as const) {
    db.prepare(
      'insert into communication_evidence (id, file_id, ordinal, speaker_display_name, speaker_anchor_person_id, excerpt_text, created_at) values (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      evidenceId,
      fileId,
      ordinal,
      speakerDisplayName,
      speakerAnchorPersonId,
      text,
      createdAt
    )
  }

  db.prepare('insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ec-1',
    'Trip planning',
    '2026-03-13T08:00:00.000Z',
    '2026-03-13T08:30:00.000Z',
    'shared planning',
    'approved',
    null,
    createdAt,
    createdAt
  )
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-1', 'ec-1', 'cp-1', createdAt)
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-2', 'ec-1', 'cp-2', createdAt)
  db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-1', 'ec-1', 'f-1', createdAt)

  for (const [jobId, fileId, inputHash] of [
    ['job-1', 'f-2', 'job-1-hash'],
    ['job-2', 'f-3', 'job-2-hash']
  ]) {
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      jobId,
      fileId,
      'document_ocr',
      'fixture',
      'fixture-model',
      'completed',
      1,
      inputHash,
      createdAt,
      createdAt,
      null,
      '{}',
      createdAt,
      createdAt
    )
  }

  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ee-1',
    'f-2',
    'job-1',
    'structured_fields',
    '{}',
    'low',
    'approved',
    createdAt,
    createdAt
  )

  db.prepare('insert into decision_journal (id, decision_type, target_type, target_id, operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'journal-1',
    'approve_profile_attribute_candidate',
    'profile_attribute_candidate',
    'pac-1',
    JSON.stringify({ queueItemId: 'rq-1', attributeId: 'attr-1' }),
    JSON.stringify({ queueItemId: 'rq-1', candidateId: 'pac-1', attributeId: 'attr-1' }),
    'local-user',
    createdAt,
    null,
    null
  )

  db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'attr-1',
    'cp-1',
    'education',
    'school_name',
    '{"value":"北京大学"}',
    '北京大学',
    'f-2',
    'ee-1',
    null,
    '{}',
    1,
    'active',
    'journal-1',
    createdAt,
    createdAt
  )

  db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'fc-1',
    'f-3',
    'job-2',
    'education',
    'school_name',
    '{"value":"清华大学"}',
    'transcript',
    0.98,
    'high',
    1,
    null,
    'pending',
    createdAt
  )

  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'rq-1',
    'structured_field_candidate',
    'fc-1',
    'pending',
    0,
    0.98,
    '{"fieldKey":"school_name"}',
    createdAt
  )

  setRelationshipLabel(db, { fromPersonId: 'cp-1', toPersonId: 'cp-2', label: 'friend' })

  return db
}

describe('memoryWorkspaceSessionService', () => {
  it('creates a new session and first turn for a persisted ask', () => {
    const db = seedConversationScenario()

    const turn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？',
      expressionMode: 'advice'
    })

    expect(turn).toMatchObject({
      sessionId: expect.any(String),
      ordinal: 1,
      question: '她现在有哪些还没解决的冲突？',
      response: {
        title: 'Memory Workspace · Alice Chen',
        expressionMode: 'advice'
      }
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: turn!.sessionId })
    expect(detail).toMatchObject({
      sessionId: turn!.sessionId,
      turnCount: 1,
      latestQuestion: '她现在有哪些还没解决的冲突？',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' }
    })

    db.close()
  })

  it('appends immutable turns when continuing the same session', () => {
    const db = seedConversationScenario()

    const firstTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })
    const secondTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料？',
      sessionId: firstTurn!.sessionId
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: firstTurn!.sessionId })

    expect(secondTurn).toMatchObject({
      sessionId: firstTurn!.sessionId,
      ordinal: 2
    })
    expect(detail?.turns.map((turn) => turn.ordinal)).toEqual([1, 2])
    expect(detail?.turns[0]?.question).toBe('她现在有哪些还没解决的冲突？')
    expect(detail?.turns[0]?.response).toEqual(firstTurn?.response)

    db.close()
  })

  it('lists newest sessions first and respects scope filters', () => {
    const db = seedConversationScenario()

    const globalTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'global' },
      question: '现在档案库里最值得优先关注的是什么？'
    })
    const personTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })
    const groupTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？'
    })

    const allSessions = listMemoryWorkspaceSessions(db)
    const personSessions = listMemoryWorkspaceSessions(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' }
    })

    expect(allSessions[0]?.sessionId).toBe(groupTurn?.sessionId)
    expect(allSessions.map((session) => session.sessionId)).toEqual([
      groupTurn!.sessionId,
      personTurn!.sessionId,
      globalTurn!.sessionId
    ])
    expect(personSessions).toEqual([
      expect.objectContaining({
        sessionId: personTurn!.sessionId,
        scope: { kind: 'person', canonicalPersonId: 'cp-1' }
      })
    ])

    db.close()
  })

  it('returns replayable stored snapshots from a session detail read', () => {
    const db = seedConversationScenario()

    const turn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料？',
      expressionMode: 'advice'
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: turn!.sessionId })

    expect(detail?.turns).toHaveLength(1)
    expect(detail?.turns[0]?.response).toEqual(turn?.response)
    expect(detail?.turns[0]?.response.expressionMode).toBe('advice')
    expect(detail?.turns[0]?.response.boundaryRedirect).toBeNull()
    expect(detail?.turns[0]?.contextHash).toBe(turn?.contextHash)

    db.close()
  })

  it('preserves persona boundary redirects in persisted replay turns', () => {
    const db = seedConversationScenario()

    const turn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么说？',
      expressionMode: 'grounded'
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: turn!.sessionId })

    expect(turn?.response.boundaryRedirect?.kind).toBe('persona_request')
    expect(detail?.turns[0]?.response.boundaryRedirect).toEqual(turn?.response.boundaryRedirect)
    expect(detail?.turns[0]?.response.workflowKind).toBe('default')
    expect(detail?.turns[0]?.response.personaDraft).toBeNull()
    expect(detail?.turns[0]?.response.boundaryRedirect?.suggestedActions.some((item) => item.label === 'Past expressions' && item.kind === 'ask')).toBe(true)
    expect(
      detail?.turns[0]?.response.boundaryRedirect?.suggestedActions.some((item) => item.kind === 'open_persona_draft_sandbox')
    ).toBe(true)
    expect(detail?.turns[0]?.response.boundaryRedirect?.suggestedActions.map((item) => item.expressionMode)).toEqual(
      expect.arrayContaining(['grounded', 'advice'])
    )

    db.close()
  })

  it('preserves communication evidence in persisted replay turns', () => {
    const db = seedConversationScenario()

    const turn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
      expressionMode: 'grounded'
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: turn!.sessionId })

    expect(turn?.response.communicationEvidence?.title).toBe('Communication Evidence')
    expect(turn?.response.communicationEvidence?.excerpts[0]?.speakerDisplayName).toBe('Alice Chen')
    expect(detail?.turns[0]?.response.communicationEvidence).toEqual(turn?.response.communicationEvidence)
    expect(detail?.turns[0]?.response.boundaryRedirect).toBeNull()
    expect(detail?.turns[0]?.response.workflowKind).toBe('default')
    expect(detail?.turns[0]?.response.personaDraft).toBeNull()

    db.close()
  })

  it('persists reviewed persona draft sandbox turns for replay', () => {
    const db = seedConversationScenario()

    const turn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      workflowKind: 'persona_draft_sandbox',
      expressionMode: 'grounded'
    })

    const detail = getMemoryWorkspaceSession(db, { sessionId: turn!.sessionId })

    expect(turn?.response.workflowKind).toBe('persona_draft_sandbox')
    expect(turn?.response.boundaryRedirect).toBeNull()
    expect(turn?.response.communicationEvidence?.excerpts.length).toBeGreaterThan(1)
    expect(turn?.response.personaDraft?.reviewState).toBe('review_required')
    expect(detail?.turns[0]?.response).toEqual(turn?.response)
    expect(detail?.turns[0]?.response.personaDraft?.trace.length).toBeGreaterThan(0)

    db.close()
  })

  it('returns null for missing or mismatched sessions', () => {
    const db = seedConversationScenario()

    const globalTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'global' },
      question: '现在档案库里最值得优先关注的是什么？'
    })

    expect(askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？',
      sessionId: globalTurn!.sessionId
    })).toBeNull()

    expect(askMemoryWorkspacePersisted(db, {
      scope: { kind: 'global' },
      question: '现在档案库里最值得优先关注的是什么？',
      sessionId: 'missing-session'
    })).toBeNull()

    db.close()
  })
})
