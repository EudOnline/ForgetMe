import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { approveStructuredFieldCandidate, queueStructuredFieldCandidate, rejectStructuredFieldCandidate, undoStructuredFieldDecision } from '../../../src/main/services/enrichmentReviewService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-enrichment-review-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('structured field review flow', () => {
  it('queues a pending high-risk field candidate into the shared review queue', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'review', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id.jpg', '/tmp/id.jpg', 'id.jpg', '.jpg', null, 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model', 'pending', 0, null, null, null, null, '{}', createdAt, createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-1', 'f-1', 'job-1', 'identity', 'national_id_number', '{"value":"1234"}', 'id_card', 0.92, 'high', 1, null, 'pending', createdAt)

    const item = queueStructuredFieldCandidate(db, {
      candidateId: 'fc-1',
      fieldKey: 'national_id_number',
      confidence: 0.92
    })

    expect(item.itemType).toBe('structured_field_candidate')
    expect(item.status).toBe('pending')
    expect(db.prepare('select status from review_queue where id = ?').get(item.id)).toEqual({ status: 'pending' })
    db.close()
  })

  it('approves, rejects, and undoes structured field candidates', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'review', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id.jpg', '/tmp/id.jpg', 'id.jpg', '.jpg', null, 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model', 'pending', 0, null, null, null, null, '{}', createdAt, createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-approve', 'f-1', 'job-1', 'identity', 'national_id_number', '{"value":"1234"}', 'id_card', 0.92, 'high', 1, null, 'pending', createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-reject', 'f-1', 'job-1', 'identity', 'full_name', '{"value":"张三"}', 'id_card', 0.9, 'high', 1, null, 'pending', createdAt)

    const approveItem = queueStructuredFieldCandidate(db, { candidateId: 'fc-approve', fieldKey: 'national_id_number', confidence: 0.92 })
    const rejectItem = queueStructuredFieldCandidate(db, { candidateId: 'fc-reject', fieldKey: 'full_name', confidence: 0.9 })

    const approved = approveStructuredFieldCandidate(db, { queueItemId: approveItem.id, actor: 'local-user' })
    expect(approved.status).toBe('approved')
    expect(db.prepare('select status from structured_field_candidates where id = ?').get('fc-approve')).toEqual({ status: 'approved' })
    expect((db.prepare('select count(*) as count from enriched_evidence where job_id = ? and evidence_type = ?').get('job-1', 'approved_structured_field') as { count: number }).count).toBe(1)

    const rejected = rejectStructuredFieldCandidate(db, { queueItemId: rejectItem.id, actor: 'local-user', note: 'wrong name' })
    expect(rejected.status).toBe('rejected')
    expect(db.prepare('select status from structured_field_candidates where id = ?').get('fc-reject')).toEqual({ status: 'rejected' })

    const undone = undoStructuredFieldDecision(db, { journalId: approved.journalId, actor: 'local-user' })
    expect(undone.status).toBe('undone')
    expect(db.prepare('select status from structured_field_candidates where id = ?').get('fc-approve')).toEqual({ status: 'undone' })
    expect((db.prepare('select count(*) as count from enriched_evidence where job_id = ? and evidence_type = ?').get('job-1', 'approved_structured_field') as { count: number }).count).toBe(0)
    db.close()
  })
})
