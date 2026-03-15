import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { setRelationshipLabel } from '../../../src/main/services/graphService'
import { askMemoryWorkspace } from '../../../src/main/services/memoryWorkspaceService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-memory-workspace-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedMemoryWorkspaceScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-13T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run(
    'b-1',
    'memory-workspace',
    'ready',
    createdAt
  )

  for (const [fileId, fileName, extension, hash] of [
    ['f-1', 'chat-1.json', '.json', 'hash-1'],
    ['f-2', 'chat-2.json', '.json', 'hash-2'],
    ['f-3', 'transcript-1.pdf', '.pdf', 'hash-3'],
    ['f-4', 'transcript-2.pdf', '.pdf', 'hash-4'],
    ['f-5', 'transcript-3.pdf', '.pdf', 'hash-5']
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
    ['p-2', 'Bob Li'],
    ['p-3', 'Carol Xu']
  ]) {
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run(
      personId,
      name,
      'chat_participant',
      1,
      createdAt
    )
  }

  for (const [personId, name, normalizedName, labels] of [
    ['cp-1', 'Alice Chen', 'alice chen', '["college-friend"]'],
    ['cp-2', 'Bob Li', 'bob li', '[]'],
    ['cp-3', 'Carol Xu', 'carol xu', '[]']
  ]) {
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      personId,
      name,
      normalizedName,
      1,
      createdAt,
      createdAt,
      1,
      labels,
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
    ['pm-2', 'cp-2', 'p-2'],
    ['pm-3', 'cp-3', 'p-3']
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
    ['rel-4', 'p-3', 'f-2'],
    ['rel-5', 'p-1', 'f-3'],
    ['rel-6', 'p-1', 'f-4'],
    ['rel-7', 'p-1', 'f-5']
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
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run(
    'ecm-1',
    'ec-1',
    'cp-1',
    createdAt
  )
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run(
    'ecm-2',
    'ec-1',
    'cp-2',
    createdAt
  )
  db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run(
    'ece-1',
    'ec-1',
    'f-1',
    createdAt
  )

  for (const [jobId, fileId] of [
    ['job-1', 'f-3'],
    ['job-2', 'f-4'],
    ['job-3', 'f-5']
  ]) {
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      jobId,
      fileId,
      'document_ocr',
      'fixture',
      'fixture-model',
      'completed',
      1,
      null,
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
    'f-3',
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
    JSON.stringify({
      queueItemId: 'rq-1',
      attributeId: 'attr-1'
    }),
    JSON.stringify({
      queueItemId: 'rq-1',
      candidateId: 'pac-1',
      attributeId: 'attr-1'
    }),
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
    'f-3',
    'ee-1',
    'fc-1',
    '{}',
    1,
    'active',
    'journal-1',
    createdAt,
    createdAt
  )

  for (const [candidateId, fileId, jobId, value] of [
    ['fc-2', 'f-4', 'job-2', '{"value":"北京大学"}'],
    ['fc-3', 'f-5', 'job-3', '{"value":"清华大学"}']
  ]) {
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      candidateId,
      fileId,
      jobId,
      'education',
      'school_name',
      value,
      'transcript',
      0.99,
      'high',
      1,
      null,
      'pending',
      createdAt
    )
  }

  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'rq-2',
    'structured_field_candidate',
    'fc-2',
    'pending',
    0,
    0.99,
    '{"fieldKey":"school_name"}',
    createdAt
  )
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'rq-3',
    'structured_field_candidate',
    'fc-3',
    'pending',
    0,
    0.98,
    '{"fieldKey":"school_name"}',
    createdAt
  )

  setRelationshipLabel(db, { fromPersonId: 'cp-1', toPersonId: 'cp-2', label: 'friend' })

  return db
}

describe('askMemoryWorkspace', () => {
  it('builds a person-scoped grounded answer from dossier facts and open conflicts', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })

    expect(result?.title).toBe('Memory Workspace · Alice Chen')
    expect(result?.answer.displayType).toBe('open_conflict')
    expect(result?.answer.summary).toContain('school_name')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.guardrail.reasonCodes).toContain('open_conflict_present')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.contextCards.map((card) => card.title)).toContain('Conflicts & Gaps')
    expect(result?.contextCards.some((card) => card.citations.some((citation) => citation.kind === 'review'))).toBe(true)

    db.close()
  })

  it('builds a group-scoped grounded answer from portrait summary and timeline windows', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？'
    })

    expect(result?.title).toBe('Memory Workspace · Alice Chen Group')
    expect(result?.answer.summary).toContain('Trip planning')
    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.contextCards.map((card) => card.title)).toContain('Timeline Windows')
    expect(result?.contextCards.map((card) => card.title)).toContain('Summary')

    db.close()
  })

  it('builds a global-scoped grounded answer from approved people, groups, and review pressure', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'global' },
      question: '现在档案库里最值得优先关注的是什么？'
    })

    expect(result?.title).toBe('Memory Workspace · Global')
    expect(result?.contextCards.map((card) => card.title)).toEqual(
      expect.arrayContaining(['People Overview', 'Group Overview', 'Review Pressure'])
    )
    expect(result?.answer.summary).toContain('pending')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('builds an advice-mode answer without dropping grounded guardrails', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.title).toBe('Memory Workspace · Alice Chen Group')
    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.answer.summary).toContain('Based on the archive')
    expect(result?.answer.summary).toContain('safest next step')
    expect(result?.answer.citations.length ?? 0).toBeGreaterThan(0)
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('keeps conflict fallback semantics in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '我下一步最应该关注什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.answer.summary).toContain('archive shows unresolved conflicts')
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('degrades persona-style requests into a grounded policy fallback', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么建议我？请模仿她的口吻回答。'
    })
    const repeatResult = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么建议我？请模仿她的口吻回答。'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.answer.summary).toContain('cannot answer as if it were')
    expect(result?.guardrail.decision).toBe('fallback_unsupported_request')
    expect(result?.guardrail.reasonCodes).toContain('persona_request')
    expect(result?.boundaryRedirect).toMatchObject({
      kind: 'persona_request',
      title: 'Persona request blocked'
    })
    expect(result?.boundaryRedirect?.suggestedAsks.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(result?.boundaryRedirect?.suggestedAsks.length ?? 0).toBeLessThanOrEqual(4)
    expect(result?.boundaryRedirect?.suggestedAsks.map((item) => item.expressionMode)).toEqual(
      expect.arrayContaining(['grounded', 'advice'])
    )
    expect(result?.boundaryRedirect?.suggestedAsks.every((item) => ['grounded', 'advice'].includes(item.expressionMode))).toBe(true)
    expect(result?.boundaryRedirect).toEqual(repeatResult?.boundaryRedirect)

    db.close()
  })

  it('keeps persona fallback primary in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '像她本人一样给我建议，用她的语气回答。',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_unsupported_request')
    expect(result?.answer.summary).toContain('cannot answer as if it were')
    expect(result?.boundaryRedirect?.kind).toBe('persona_request')
    expect(result?.boundaryRedirect?.suggestedAsks.some((item) => item.expressionMode === 'advice')).toBe(true)

    db.close()
  })

  it('marks low-coverage answers when the archive cannot support the request', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-3' },
      question: '她的毕业学校是什么？'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.guardrail.fallbackApplied).toBe(true)
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('keeps insufficient-evidence fallback semantics in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-3' },
      question: '她的毕业学校是什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.answer.summary).toContain('insufficient')
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('returns null when the requested scope does not exist', () => {
    const db = seedMemoryWorkspaceScenario()

    expect(askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'missing' },
      question: 'hi'
    })).toBeNull()

    db.close()
  })
})
