import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, runMigrations } from '../../../../src/main/services/db'
import { setRelationshipLabel } from '../../../../src/main/services/graphService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-memory-workspace-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

export function seedMemoryWorkspaceScenario() {
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
    ['f-5', 'transcript-3.pdf', '.pdf', 'hash-5'],
    ['f-6', 'profile-note.txt', '.txt', 'hash-6']
  ]) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      fileId,
      'b-1',
      `/tmp/${fileName}`,
      `/tmp/${fileName}`,
      fileName,
      extension,
      extension === '.pdf'
        ? 'application/pdf'
        : extension === '.txt'
          ? 'text/plain'
          : 'application/json',
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
    ['rel-7', 'p-1', 'f-5'],
    ['rel-8', 'p-1', 'f-6']
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
    ['ce-3', 'f-2', 1, 'Alice Chen', 'p-1', '我会继续记下关键细节，归档后就不会丢。'],
    ['ce-4', 'f-2', 2, 'Carol Xu', 'p-3', '周末一起去看展吧。']
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
    ['job-3', 'f-5'],
    ['job-4', 'f-6']
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

  for (const [evidenceId, fileId, jobId] of [
    ['ee-1', 'f-3', 'job-1'],
    ['ee-2', 'f-6', 'job-4']
  ]) {
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      evidenceId,
      fileId,
      jobId,
      'structured_fields',
      '{}',
      'low',
      'approved',
      createdAt,
      createdAt
    )
  }

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

  for (const attribute of [
    {
      id: 'attr-1',
      group: 'education',
      key: 'school_name',
      valueJson: '{"value":"北京大学"}',
      displayValue: '北京大学',
      sourceFileId: 'f-3',
      sourceEvidenceId: 'ee-1',
      sourceCandidateId: 'fc-1'
    },
    {
      id: 'attr-2',
      group: 'profile',
      key: 'note',
      valueJson: '{"value":"Keeps personal archive notes."}',
      displayValue: 'Keeps personal archive notes.',
      sourceFileId: 'f-6',
      sourceEvidenceId: 'ee-2',
      sourceCandidateId: null
    }
  ]) {
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      attribute.id,
      'cp-1',
      attribute.group,
      attribute.key,
      attribute.valueJson,
      attribute.displayValue,
      attribute.sourceFileId,
      attribute.sourceEvidenceId,
      attribute.sourceCandidateId,
      '{}',
      1,
      'active',
      'journal-1',
      createdAt,
      createdAt
    )
  }

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
