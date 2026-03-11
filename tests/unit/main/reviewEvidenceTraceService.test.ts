import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { getReviewEvidenceTrace } from '../../../src/main/services/reviewEvidenceTraceService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-review-trace-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('getReviewEvidenceTrace', () => {
  it('returns source file, evidence, and upstream candidate context for a profile candidate', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'trace', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at, reviewed_at, review_note, approved_journal_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-1', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.98, 'high', 1, null, 'approved', createdAt, createdAt, null, null)
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"candidateId":"fc-1","fieldKey":"school_name","fieldValue":{"value":"北京大学"}}', 'high', 'approved', createdAt, createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('pac-1', 'cp-1', 'f-1', 'ee-1', 'fc-1', 'education', 'school_name', '{"value":"北京大学"}', '{"matchedRule":"single_file_person"}', 'singleton_conflict', 0.95, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile-1', 'profile_attribute_candidate', 'pac-1', 'pending', 0, 0.95, '{"attributeKey":"school_name"}', createdAt)
    db.prepare('insert into decision_journal (id, decision_type, target_type, target_id, operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('j-1', 'approve_structured_field_candidate', 'structured_field_candidate', 'fc-1', '{"queueItemId":"rq-structured-1","evidenceId":"ee-1"}', '{"queueItemId":"rq-structured-1","candidateId":"fc-1","evidenceId":"ee-1"}', 'local-user', createdAt, null, null)
    db.prepare('update structured_field_candidates set approved_journal_id = ? where id = ?').run('j-1', 'fc-1')

    const result = getReviewEvidenceTrace(db, { queueItemId: 'rq-profile-1' })

    expect(result.queueItem.id).toBe('rq-profile-1')
    expect(result.sourceFile?.fileId).toBe('f-1')
    expect(result.sourceEvidence?.evidenceId).toBe('ee-1')
    expect(result.sourceCandidate?.candidateId).toBe('fc-1')
    expect(result.sourceCandidate?.candidateType).toBe('structured_field_candidate')
    expect(result.sourceJournal?.id).toBe('j-1')
    db.close()
  })

  it('returns direct file context for a structured field candidate', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-2', 'trace', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-2', '/tmp/id-card.png', '/tmp/id-card.png', 'id-card.png', '.png', 'image/png', 1, 'hash-2', 'unique', 'parsed', createdAt)
    db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-2', 'f-2', 'image_understanding', 'openrouter', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-2', 'f-2', 'job-2', 'identity', 'full_name', '{"value":"Alice Chen"}', 'id_card', 0.97, 'high', 1, null, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-structured-2', 'structured_field_candidate', 'fc-2', 'pending', 0, 0.97, '{"fieldKey":"full_name"}', createdAt)

    const result = getReviewEvidenceTrace(db, { queueItemId: 'rq-structured-2' })

    expect(result.queueItem.id).toBe('rq-structured-2')
    expect(result.candidate?.id).toBe('fc-2')
    expect(result.sourceFile?.fileId).toBe('f-2')
    expect(result.sourceEvidence).toBeNull()
    expect(result.sourceCandidate).toBeNull()
    db.close()
  })
})
