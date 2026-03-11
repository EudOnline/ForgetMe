import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { buildReviewImpactPreview } from '../../../src/main/services/reviewImpactService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-review-impact-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('buildReviewImpactPreview', () => {
  it('shows a projected formal attribute when a structured field can deterministically project', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'impact', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'import', 1, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAt)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-1', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-structured-1', 'structured_field_candidate', 'fc-1', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)

    const result = buildReviewImpactPreview(db, { queueItemId: 'rq-structured-1' })

    expect(result.approveImpact.kind).toBe('project_formal_attribute')
    expect(result.approveImpact.canonicalPersonId).toBe('cp-1')
    expect(result.approveImpact.nextValue).toBe('北京大学')
    expect(result.rejectImpact.kind).toBe('reject_review_item')
    expect(result.undoImpact.kind).toBe('no_approved_decision')
    db.close()
  })

  it('flags a profile attribute conflict before approval', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-1', 'cp-1', 'education', 'school_name', '{"value":"清华大学"}', '清华大学', null, null, null, '{}', 1, 'active', null, createdAt, createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('pac-1', 'cp-1', null, null, 'fc-1', 'education', 'school_name', '{"value":"北京大学"}', '{"matchedRule":"single_file_person"}', 'singleton_conflict', 0.95, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile-1', 'profile_attribute_candidate', 'pac-1', 'pending', 0, 0.95, '{"attributeKey":"school_name"}', createdAt)

    const result = buildReviewImpactPreview(db, { queueItemId: 'rq-profile-1' })

    expect(result.approveImpact.kind).toBe('conflict_formal_attribute')
    expect(result.approveImpact.canonicalPersonId).toBe('cp-1')
    expect(result.approveImpact.currentValue).toBe('清华大学')
    expect(result.approveImpact.nextValue).toBe('北京大学')
    db.close()
  })

  it('shows rollback impact for an approved profile attribute decision', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, lastSeenAt, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'.replace('lastSeenAt', 'last_seen_at')).run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at, reviewed_at, approved_journal_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('pac-2', 'cp-1', null, null, 'fc-2', 'education', 'school_name', '{"value":"北京大学"}', '{"matchedRule":"single_file_person"}', 'singleton_conflict', 0.95, 'approved', createdAt, createdAt, null)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at, reviewed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile-2', 'profile_attribute_candidate', 'pac-2', 'approved', 0, 0.95, '{"attributeKey":"school_name"}', createdAt, createdAt)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-2', 'cp-1', 'education', 'school_name', '{"value":"北京大学"}', '北京大学', null, null, 'fc-2', '{}', 1, 'active', null, createdAt, createdAt)
    db.prepare('insert into decision_journal (id, decision_type, target_type, target_id, operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('j-1', 'approve_profile_attribute_candidate', 'profile_attribute_candidate', 'pac-2', '{"queueItemId":"rq-profile-2","attributeId":"attr-2"}', '{"queueItemId":"rq-profile-2","candidateId":"pac-2","attributeId":"attr-2"}', 'local-user', createdAt, null, null)
    db.prepare('update profile_attribute_candidates set approved_journal_id = ? where id = ?').run('j-1', 'pac-2')
    db.prepare('update person_profile_attributes set approved_journal_id = ? where id = ?').run('j-1', 'attr-2')

    const result = buildReviewImpactPreview(db, { queueItemId: 'rq-profile-2' })

    expect(result.undoImpact.kind).toBe('rollback_profile_attribute')
    expect(result.undoImpact.affectedJournalId).toBe('j-1')
    expect(result.undoImpact.affectedAttributeIds).toEqual(['attr-2'])
    db.close()
  })
})
