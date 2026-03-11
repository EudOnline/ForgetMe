import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { getDocumentEvidence, listEnrichmentJobs, listStructuredFieldCandidates, rerunEnrichmentJob } from '../../../src/main/services/enrichmentReadService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-enrichment-read-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('enrichmentReadService', () => {
  it('lists enrichment jobs with status filters', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'jobs', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/a.pdf', '/tmp/a.pdf', 'a.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-1', '/tmp/b.png', '/tmp/b.png', 'b.png', '.png', 'image/png', 1, 'hash-2', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-pending', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'pending', 0, null, null, null, null, '{}', createdAt, createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-completed', 'f-2', 'image_understanding', 'openrouter', 'model-b', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)

    const pendingJobs = listEnrichmentJobs(db, { status: 'pending' })

    expect(pendingJobs).toEqual([
      expect.objectContaining({
        id: 'job-pending',
        enhancerType: 'document_ocr',
        status: 'pending'
      })
    ])
    db.close()
  })

  it('returns OCR outputs, approved fields, and field candidates for a document file', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'evidence', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id-card.jpg', '/tmp/id-card.jpg', 'id-card.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"姓名 张三"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"姓名 张三"}]}', createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-1', 'f-1', 'job-1', 'identity', 'national_id_number', '{"value":"123456"}', 'id_card', 0.98, 'high', 1, null, 'pending', createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"fieldType":"education","fieldKey":"school_name","fieldValue":{"value":"北京大学"},"documentType":"transcript"}', 'high', 'approved', createdAt, createdAt)

    const evidence = getDocumentEvidence(db, { fileId: 'f-1' })

    expect(evidence?.rawText).toBe('姓名 张三')
    expect(evidence?.layoutBlocks).toEqual([{ page: 1, text: '姓名 张三' }])
    expect(evidence?.approvedFields).toEqual([
      expect.objectContaining({ fieldKey: 'school_name', value: '北京大学' })
    ])
    expect(evidence?.fieldCandidates).toEqual([
      expect.objectContaining({ id: 'fc-1', fieldKey: 'national_id_number', status: 'pending' })
    ])
    db.close()
  })

  it('creates a new pending job when rerunning a completed enrichment', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'rerun', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id-card.jpg', '/tmp/id-card.jpg', 'id-card.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, 'input-hash', createdAt, createdAt, null, '{"promptTokens":10}', createdAt, createdAt)

    const rerun = rerunEnrichmentJob(db, { jobId: 'job-1' })

    expect(rerun).toEqual(expect.objectContaining({
      fileId: 'f-1',
      enhancerType: 'document_ocr',
      status: 'pending'
    }))
    expect(rerun.id).not.toBe('job-1')
    expect((db.prepare('select count(*) as count from enrichment_jobs where file_id = ?').get('f-1') as { count: number }).count).toBe(2)
    expect(db.prepare('select status from enrichment_jobs where id = ?').get('job-1')).toEqual({ status: 'completed' })
    db.close()
  })

  it('lists structured field candidates with optional status filters', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'candidates', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id-card.jpg', '/tmp/id-card.jpg', 'id-card.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-1', 'f-1', 'job-1', 'identity', 'full_name', '{"value":"张三"}', 'id_card', 0.92, 'high', 1, null, 'pending', createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-2', 'f-1', 'job-1', 'identity', 'address', '{"value":"杭州"}', 'id_card', 0.88, 'high', 1, null, 'approved', createdAt)

    const candidates = listStructuredFieldCandidates(db, { fileId: 'f-1', status: 'pending' })

    expect(candidates).toEqual([
      expect.objectContaining({ id: 'fc-1', fieldKey: 'full_name', status: 'pending' })
    ])
    db.close()
  })
})
