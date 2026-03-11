import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { queueStructuredFieldCandidate } from './enrichmentReviewService'

export function seedE2EMultimodalReviewFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from structured_field_candidates
     where file_id = ? and field_key = ?
     limit 1`
  ).get(input.fileId, 'school_name') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()
  const candidateId = crypto.randomUUID()

  db.prepare(
    `insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count,
      input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jobId,
    input.fileId,
    'document_ocr',
    'siliconflow',
    'fixture-model',
    'completed',
    1,
    'e2e-fixture',
    createdAt,
    createdAt,
    null,
    JSON.stringify({ fixture: true }),
    createdAt,
    createdAt
  )

  db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    jobId,
    'ocr_raw_text',
    JSON.stringify({ rawText: '姓名 Alice Chen\n学校 北京大学' }),
    createdAt
  )

  db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    jobId,
    'ocr_layout_blocks',
    JSON.stringify({ layoutBlocks: [{ page: 1, text: '学校 北京大学' }] }),
    createdAt
  )

  db.prepare(
    `insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    candidateId,
    input.fileId,
    jobId,
    'education',
    'school_name',
    JSON.stringify({ value: '北京大学' }),
    'transcript',
    0.99,
    'high',
    1,
    null,
    'pending',
    createdAt
  )

  queueStructuredFieldCandidate(db, {
    candidateId,
    fieldKey: 'school_name',
    confidence: 0.99
  })

  return { id: candidateId }
}

export function seedE2ERunnerProfileFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from enrichment_jobs
     where file_id = ? and input_hash = ?
     limit 1`
  ).get(input.fileId, 'e2e-runner-profile') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()

  db.prepare(
    `insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count,
      input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jobId,
    input.fileId,
    'document_ocr',
    'siliconflow',
    'fixture-model',
    'pending',
    0,
    'e2e-runner-profile',
    null,
    null,
    null,
    '{}',
    createdAt,
    createdAt
  )

  return { id: jobId }
}
