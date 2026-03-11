import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { approveProfileAttributeCandidate, rejectProfileAttributeCandidate, undoProfileAttributeDecision } from '../../../src/main/services/profileCandidateReviewService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-profile-review-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('profile attribute review flow', () => {
  it('approves a profile attribute candidate into formal profile state and can undo it', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'profile-review', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"fieldKey":"school_name","fieldValue":{"value":"北京大学"}}', 'high', 'approved', createdAt, createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'pac-1',
      'cp-1',
      'f-1',
      'ee-1',
      'fc-1',
      'education',
      'school_name',
      '{"value":"北京大学"}',
      '{"matchedRule":"single_file_person"}',
      'singleton_conflict',
      0.95,
      'pending',
      createdAt
    )
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile-1', 'profile_attribute_candidate', 'pac-1', 'pending', 0, 0.95, '{"attributeKey":"school_name"}', createdAt)

    const approved = approveProfileAttributeCandidate(db, { queueItemId: 'rq-profile-1', actor: 'local-user' })

    expect(approved.status).toBe('approved')
    expect((db.prepare('select count(*) as count from person_profile_attributes').get() as { count: number }).count).toBe(1)

    const undone = undoProfileAttributeDecision(db, { journalId: approved.journalId, actor: 'local-user' })

    expect(undone.status).toBe('undone')
    expect(db.prepare('select status from profile_attribute_candidates where id = ?').get('pac-1')).toEqual({ status: 'undone' })
    expect(db.prepare('select status from person_profile_attributes').get()).toEqual({ status: 'undone' })
    db.close()
  })

  it('rejects a profile attribute candidate', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'pac-2',
      'cp-1',
      null,
      null,
      'fc-2',
      'education',
      'school_name',
      '{"value":"北京大学"}',
      '{"matchedRule":"single_file_person"}',
      'ambiguous_person_match',
      0.85,
      'pending',
      createdAt
    )
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile-2', 'profile_attribute_candidate', 'pac-2', 'pending', 0, 0.85, '{"attributeKey":"school_name"}', createdAt)

    const rejected = rejectProfileAttributeCandidate(db, { queueItemId: 'rq-profile-2', actor: 'local-user', note: 'need manual confirmation' })

    expect(rejected.status).toBe('rejected')
    expect(db.prepare('select status from profile_attribute_candidates where id = ?').get('pac-2')).toEqual({ status: 'rejected' })
    expect(db.prepare('select status from review_queue where id = ?').get('rq-profile-2')).toEqual({ status: 'rejected' })
    db.close()
  })
})
