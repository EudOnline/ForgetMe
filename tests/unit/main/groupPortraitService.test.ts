import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { setRelationshipLabel } from '../../../src/main/services/graphService'
import { getGroupPortrait, listGroupPortraits } from '../../../src/main/services/groupPortraitService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-group-portrait-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedRichGroupScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-13T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'group-portrait', 'ready', createdAt)
  for (const [fileId, fileName, hash] of [
    ['f-1', 'chat-1.json', 'hash-1'],
    ['f-2', 'chat-2.json', 'hash-2'],
    ['f-3', 'transcript-1.pdf', 'hash-3'],
    ['f-4', 'transcript-2.pdf', 'hash-4']
  ]) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      fileId,
      'b-1',
      `/tmp/${fileName}`,
      `/tmp/${fileName}`,
      fileName,
      path.extname(fileName),
      null,
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

  for (const [personId, name, normalizedName] of [
    ['cp-1', 'Alice Chen', 'alice chen'],
    ['cp-2', 'Bob Li', 'bob li'],
    ['cp-3', 'Carol Xu', 'carol xu']
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
    ['rel-5', 'p-2', 'f-3'],
    ['rel-6', 'p-2', 'f-4']
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
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-1', 'ec-1', 'cp-1', createdAt)
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-2', 'ec-1', 'cp-2', createdAt)
  db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-1', 'ec-1', 'f-1', createdAt)

  db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'job-1',
    'f-3',
    'document_ocr',
    'fixture',
    'fixture-model',
    'completed',
    1,
    'group-portrait-1',
    createdAt,
    createdAt,
    null,
    '{}',
    createdAt,
    createdAt
  )
  db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'job-2',
    'f-4',
    'document_ocr',
    'fixture',
    'fixture-model',
    'completed',
    1,
    'group-portrait-2',
    createdAt,
    createdAt,
    null,
    '{}',
    createdAt,
    createdAt
  )
  db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'fc-1',
    'f-3',
    'job-1',
    'education',
    'school_name',
    '{"value":"北京大学"}',
    'transcript',
    0.99,
    'high',
    1,
    null,
    'pending',
    createdAt
  )
  db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'fc-2',
    'f-4',
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
    0.99,
    '{"fieldKey":"school_name"}',
    createdAt
  )
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'rq-2',
    'structured_field_candidate',
    'fc-2',
    'pending',
    0,
    0.98,
    '{"fieldKey":"school_name"}',
    createdAt
  )
  db.prepare('insert into decision_journal (id, decision_type, target_type, target_id, operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'journal-1',
    'approve_safe_review_group',
    'decision_batch',
    'batch-1',
    JSON.stringify({
      canonicalPersonId: 'cp-2',
      canonicalPersonName: 'Bob Li',
      fieldKey: 'school_name',
      itemCount: 2
    }),
    JSON.stringify({
      batchId: 'batch-1',
      memberJournalIds: ['member-journal-1', 'member-journal-2']
    }),
    'reviewer',
    createdAt,
    null,
    null
  )

  setRelationshipLabel(db, { fromPersonId: 'cp-1', toPersonId: 'cp-2', label: 'friend' })

  return db
}

function seedSparseScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-13T00:00:00.000Z'

  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'cp-empty',
    'Sparse Person',
    'sparse person',
    0,
    createdAt,
    createdAt,
    0,
    '[]',
    'approved',
    createdAt,
    createdAt
  )

  return db
}

describe('getGroupPortrait', () => {
  it('builds an anchored group portrait from approved neighbors, shared events, and ambiguity', () => {
    const db = seedRichGroupScenario()

    const portrait = getGroupPortrait(db, { canonicalPersonId: 'cp-1' })

    expect(portrait?.members.map((member) => member.displayName)).toEqual([
      'Alice Chen',
      'Bob Li',
      'Carol Xu'
    ])
    expect(portrait?.relationshipDensity.memberCount).toBe(3)
    expect(portrait?.relationshipDensity.actualEdgeCount).toBe(2)
    expect(portrait?.relationshipDensity.possibleEdgeCount).toBe(3)
    expect(portrait?.relationshipDensity.densityRatio).toBeCloseTo(2 / 3, 5)
    expect(portrait?.relationshipDensity.displayType).toBe('derived_summary')
    expect(portrait?.sharedEvents[0]).toMatchObject({
      title: 'Trip planning',
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      displayType: 'approved_fact'
    })
    expect(portrait?.timelineWindows).toEqual([
      {
        windowId: 'window:ec-1',
        title: 'Trip planning',
        timeStart: '2026-03-13T08:00:00.000Z',
        timeEnd: '2026-03-13T08:30:00.000Z',
        eventCount: 1,
        memberCount: 2,
        members: ['Alice Chen', 'Bob Li'],
        eventTitles: ['Trip planning'],
        displayType: 'approved_fact'
      }
    ])
    expect(portrait?.narrativeSummary).toEqual([
      {
        summaryId: 'group-size',
        text: 'Alice Chen anchors a 3-person group with Bob Li and Carol Xu.',
        displayType: 'derived_summary'
      },
      {
        summaryId: 'shared-evidence',
        text: 'The group shares 1 approved event and 2 shared evidence sources.',
        displayType: 'derived_summary'
      },
      {
        summaryId: 'ambiguity',
        text: 'Review ambiguity remains: 2 pending items across 1 conflict group.',
        displayType: 'open_conflict'
      }
    ])
    expect(portrait?.sharedEvidenceSources).toEqual([
      {
        fileId: 'f-1',
        fileName: 'chat-1.json',
        memberCount: 2,
        members: ['Alice Chen', 'Bob Li'],
        displayType: 'approved_fact'
      },
      {
        fileId: 'f-2',
        fileName: 'chat-2.json',
        memberCount: 2,
        members: ['Alice Chen', 'Carol Xu'],
        displayType: 'approved_fact'
      }
    ])
    expect(portrait?.replayShortcuts).toEqual([
      {
        journalId: 'journal-1',
        label: 'Safe batch approve · Bob Li · school_name · 2 items',
        query: 'journal-1',
        displayType: 'approved_fact'
      }
    ])
    expect(portrait?.centralPeople[0]).toMatchObject({
      personId: 'cp-1',
      displayName: 'Alice Chen',
      connectionCount: 2,
      displayType: 'derived_summary'
    })
    expect(portrait?.ambiguitySummary).toMatchObject({
      pendingReviewCount: 2,
      conflictGroupCount: 1,
      affectedMemberCount: 1,
      displayType: 'open_conflict',
      reviewShortcut: {
        label: 'Open school_name conflicts',
        canonicalPersonId: 'cp-2',
        fieldKey: 'school_name',
        hasConflict: true,
        queueItemId: 'rq-1'
      }
    })

    db.close()
  })

  it('returns a sparse portrait with coverage-gap density and zero ambiguity when no neighbors exist', () => {
    const db = seedSparseScenario()

    const portrait = getGroupPortrait(db, { canonicalPersonId: 'cp-empty' })

    expect(portrait?.members).toHaveLength(1)
    expect(portrait?.members[0]).toMatchObject({
      personId: 'cp-empty',
      displayName: 'Sparse Person',
      isAnchor: true
    })
    expect(portrait?.relationshipDensity).toMatchObject({
      memberCount: 1,
      actualEdgeCount: 0,
      possibleEdgeCount: 0,
      densityRatio: 0,
      displayType: 'coverage_gap'
    })
    expect(portrait?.sharedEvents).toEqual([])
    expect(portrait?.timelineWindows).toEqual([])
    expect(portrait?.narrativeSummary).toEqual([
      {
        summaryId: 'group-size',
        text: 'Sparse Person does not yet have approved group connections.',
        displayType: 'coverage_gap'
      },
      {
        summaryId: 'shared-evidence',
        text: 'No shared events or shared evidence sources have been approved yet.',
        displayType: 'coverage_gap'
      },
      {
        summaryId: 'ambiguity',
        text: 'No unresolved ambiguity is currently open for this group.',
        displayType: 'derived_summary'
      }
    ])
    expect(portrait?.sharedEvidenceSources).toEqual([])
    expect(portrait?.replayShortcuts).toEqual([])
    expect(portrait?.ambiguitySummary).toMatchObject({
      pendingReviewCount: 0,
      conflictGroupCount: 0,
      affectedMemberCount: 0,
      displayType: 'derived_summary',
      reviewShortcut: null
    })

    db.close()
  })
})

describe('listGroupPortraits', () => {
  it('lists anchored browse summaries for discovered multi-person groups with the densest group first', () => {
    const db = seedRichGroupScenario()

    const summaries = listGroupPortraits(db)

    expect(summaries).toHaveLength(3)
    expect(summaries[0]).toEqual({
      anchorPersonId: 'cp-1',
      anchorDisplayName: 'Alice Chen',
      title: 'Alice Chen Group Portrait',
      memberCount: 3,
      sharedEventCount: 1,
      sharedEvidenceSourceCount: 2,
      densityRatio: 2 / 3,
      membersPreview: ['Alice Chen', 'Bob Li', 'Carol Xu'],
      displayType: 'derived_summary'
    })
    expect(summaries.map((summary) => summary.anchorPersonId)).toEqual(['cp-1', 'cp-2', 'cp-3'])

    db.close()
  })
})
