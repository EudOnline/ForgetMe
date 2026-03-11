import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { getReviewWorkbenchItem, listReviewConflictGroups, listReviewInboxPeople, listReviewWorkbenchItems } from '../../../src/main/services/reviewWorkbenchReadService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-workbench-read-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('review workbench read model', () => {
  it('returns a structured workbench payload for a single queue item', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'workbench', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'import', 1, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAt)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-1', 'cp-1', 'identity', 'full_name', '{"value":"Alice Chen"}', 'Alice Chen', 'f-1', null, null, '{}', 1, 'active', null, createdAt, createdAt)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-1', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-1', 'structured_field_candidate', 'fc-1', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)

    const result = getReviewWorkbenchItem(db, { queueItemId: 'rq-1' })

    expect(result.item.queueItemId).toBe('rq-1')
    expect(result.item.itemType).toBe('structured_field_candidate')
    expect(result.impactPreview.approveImpact.kind).toBeTruthy()
    expect(result.trace.sourceFile?.fileId).toBe('f-1')
    expect(result.currentProfileAttributes.map((attribute) => attribute.attributeKey)).toContain('full_name')
    db.close()
  })

  it('lists structured and profile items with basic filters', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-2', 'workbench', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-2', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-school', 'cp-1', 'education', 'school_name', '{"value":"清华大学"}', '清华大学', 'f-1', null, null, '{}', 1, 'active', null, createdAt, createdAt)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-structured', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('pac-1', 'cp-1', 'f-1', null, 'fc-structured', 'education', 'school_name', '{"value":"复旦大学"}', '{}', 'projection_conflict', 0.95, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-structured', 'structured_field_candidate', 'fc-structured', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile', 'profile_attribute_candidate', 'pac-1', 'pending', 0, 0.95, '{"attributeKey":"school_name"}', createdAt)

    const structuredOnly = listReviewWorkbenchItems(db, { itemType: 'structured_field_candidate' })
    const conflictOnly = listReviewWorkbenchItems(db, { hasConflict: true })

    expect(structuredOnly.map((item) => item.queueItemId)).toEqual(['rq-structured'])
    expect(conflictOnly.map((item) => item.queueItemId)).toEqual(['rq-profile'])
    expect(conflictOnly[0]?.canonicalPersonId).toBe('cp-1')
    db.close()
  })

  it('groups pending items into people-centric inbox summaries', () => {
    const db = setupDatabase()
    const createdAtA = '2026-03-11T00:00:00.000Z'
    const createdAtB = '2026-03-11T01:00:00.000Z'
    const createdAtC = '2026-03-11T02:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-3', 'workbench', 'ready', createdAtA)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-a1', 'b-3', '/tmp/a1.pdf', '/tmp/a1.pdf', 'alice-school.pdf', '.pdf', 'application/pdf', 1, 'hash-a1', 'unique', 'parsed', createdAtA)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-a2', 'b-3', '/tmp/a2.pdf', '/tmp/a2.pdf', 'alice-birth.pdf', '.pdf', 'application/pdf', 1, 'hash-a2', 'unique', 'parsed', createdAtB)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-b1', 'b-3', '/tmp/b1.pdf', '/tmp/b1.pdf', 'bob-school.pdf', '.pdf', 'application/pdf', 1, 'hash-b1', 'unique', 'parsed', createdAtC)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-a1', 'f-a1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtA, createdAtA, null, '{}', createdAtA, createdAtA)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-a2', 'f-a2', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtB, createdAtB, null, '{}', createdAtB, createdAtB)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-b1', 'f-b1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtC, createdAtC, null, '{}', createdAtC, createdAtC)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-a', 'Alice Chen', 'import', 1, createdAtA)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-b', 'Bob Li', 'import', 1, createdAtC)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-a', 'Alice Chen', 'alice chen', 1, createdAtA, createdAtB, 2, '[]', 'approved', createdAtA, createdAtB)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-b', 'Bob Li', 'bob li', 1, createdAtC, createdAtC, 1, '[]', 'approved', createdAtC, createdAtC)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-a', 'cp-a', 'p-a', 'active', createdAtA, createdAtA)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-b', 'cp-b', 'p-b', 'active', createdAtC, createdAtC)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-a1', 'p-a', 'person', 'f-a1', 'file', 'mentioned_in', 1, createdAtA)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-a2', 'p-a', 'person', 'f-a2', 'file', 'mentioned_in', 1, createdAtB)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-b1', 'p-b', 'person', 'f-b1', 'file', 'mentioned_in', 1, createdAtC)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-a', 'cp-a', 'education', 'school_name', '{"value":"清华大学"}', '清华大学', 'f-a1', null, null, '{}', 1, 'active', null, createdAtA, createdAtA)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-a1', 'f-a1', 'job-a1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAtA)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-a2', 'f-a2', 'job-a2', 'identity', 'birth_date', '{"value":"1990-01-01"}', 'id_card', 0.97, 'high', 1, null, 'pending', createdAtB)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-b1', 'f-b1', 'job-b1', 'education', 'school_name', '{"value":"复旦大学"}', 'transcript', 0.96, 'high', 1, null, 'pending', createdAtC)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-a1', 'structured_field_candidate', 'fc-a1', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAtA)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-a2', 'structured_field_candidate', 'fc-a2', 'pending', 0, 0.97, '{"fieldKey":"birth_date"}', createdAtB)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-b1', 'structured_field_candidate', 'fc-b1', 'pending', 0, 0.96, '{"fieldKey":"school_name"}', createdAtC)

    const inbox = listReviewInboxPeople(db)

    expect(inbox).toHaveLength(2)
    expect(inbox[0]).toMatchObject({
      canonicalPersonId: 'cp-a',
      canonicalPersonName: 'Alice Chen',
      pendingCount: 2,
      conflictCount: 1,
      fieldKeys: ['birth_date', 'school_name'],
      nextQueueItemId: 'rq-a1',
      hasContinuousSequence: true,
      latestPendingCreatedAt: createdAtB
    })
    expect(inbox[1]).toMatchObject({
      canonicalPersonId: 'cp-b',
      canonicalPersonName: 'Bob Li',
      pendingCount: 1,
      conflictCount: 0,
      fieldKeys: ['school_name'],
      nextQueueItemId: 'rq-b1',
      hasContinuousSequence: false,
      latestPendingCreatedAt: createdAtC
    })
    db.close()
  })

  it('groups pending items into field-level conflict groups', () => {
    const db = setupDatabase()
    const createdAtA = '2026-03-11T00:00:00.000Z'
    const createdAtB = '2026-03-11T00:05:00.000Z'
    const createdAtC = '2026-03-11T00:10:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-4', 'workbench', 'ready', createdAtA)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-4', '/tmp/a1.pdf', '/tmp/a1.pdf', 'alice-1.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAtA)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-4', '/tmp/a2.pdf', '/tmp/a2.pdf', 'alice-2.pdf', '.pdf', 'application/pdf', 1, 'hash-2', 'unique', 'parsed', createdAtB)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-3', 'b-4', '/tmp/a3.pdf', '/tmp/a3.pdf', 'alice-3.pdf', '.pdf', 'application/pdf', 1, 'hash-3', 'unique', 'parsed', createdAtC)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtA, createdAtA, null, '{}', createdAtA, createdAtA)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-2', 'f-2', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtB, createdAtB, null, '{}', createdAtB, createdAtB)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-3', 'f-3', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAtC, createdAtC, null, '{}', createdAtC, createdAtC)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-a', 'Alice Chen', 'import', 1, createdAtA)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-a', 'Alice Chen', 'alice chen', 1, createdAtA, createdAtC, 3, '[]', 'approved', createdAtA, createdAtC)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-a', 'cp-a', 'p-a', 'active', createdAtA, createdAtA)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-a', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAtA)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-2', 'p-a', 'person', 'f-2', 'file', 'mentioned_in', 1, createdAtB)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-3', 'p-a', 'person', 'f-3', 'file', 'mentioned_in', 1, createdAtC)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-1', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAtA)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-2', 'f-2', 'job-2', 'education', 'school_name', '{"value":"清华大学"}', 'transcript', 0.98, 'high', 1, null, 'pending', createdAtB)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-3', 'f-3', 'job-3', 'identity', 'birth_date', '{"value":"1990-01-01"}', 'id_card', 0.97, 'high', 1, null, 'pending', createdAtC)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-1', 'structured_field_candidate', 'fc-1', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAtA)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-2', 'structured_field_candidate', 'fc-2', 'pending', 0, 0.98, '{"fieldKey":"school_name"}', createdAtB)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-3', 'structured_field_candidate', 'fc-3', 'pending', 0, 0.97, '{"fieldKey":"birth_date"}', createdAtC)

    const groups = listReviewConflictGroups(db)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      canonicalPersonId: 'cp-a',
      canonicalPersonName: 'Alice Chen',
      itemType: 'structured_field_candidate',
      fieldKey: 'school_name',
      pendingCount: 2,
      distinctValues: ['北京大学', '清华大学'],
      hasConflict: true,
      nextQueueItemId: 'rq-1',
      latestPendingCreatedAt: createdAtB
    })
    expect(groups[1]).toMatchObject({
      fieldKey: 'birth_date',
      pendingCount: 1,
      distinctValues: ['1990-01-01'],
      hasConflict: false,
      nextQueueItemId: 'rq-3'
    })
    db.close()
  })
})
