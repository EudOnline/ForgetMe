import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  buildProviderBoundaryRequest,
  persistProviderEgressRequest,
  persistProviderEgressResponse
} from '../../../src/main/services/providerBoundaryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-provider-boundary-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('buildProviderBoundaryRequest', () => {
  it('removes absolute path fields and emits a metadata-only envelope', () => {
    const result = buildProviderBoundaryRequest({
      job: {
        id: 'job-1',
        fileId: 'f-1',
        fileName: 'transcript.pdf',
        frozenPath: '/tmp/transcript.pdf',
        fileSha256: 'hash-1',
        extension: '.pdf',
        mimeType: 'application/pdf',
        enhancerType: 'document_ocr',
        provider: 'siliconflow',
        model: 'model-a'
      }
    })

    expect(JSON.stringify(result.requestEnvelope)).not.toContain('/tmp/transcript.pdf')
    expect(result.redactionSummary.removedFields).toContain('frozenPath')
    expect(result.policyKey).toBe('document_ocr.remote_baseline')
  })
})

describe('persistProviderEgressRequest', () => {
  it('writes artifact and request/response events for the boundary audit trail', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-12T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'boundary', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'job-1',
      'f-1',
      'document_ocr',
      'siliconflow',
      'model-a',
      'processing',
      1,
      null,
      createdAt,
      null,
      null,
      '{}',
      createdAt,
      createdAt
    )

    const boundary = buildProviderBoundaryRequest({
      job: {
        id: 'job-1',
        fileId: 'f-1',
        fileName: 'transcript.pdf',
        frozenPath: '/tmp/transcript.pdf',
        fileSha256: 'hash-1',
        extension: '.pdf',
        mimeType: 'application/pdf',
        enhancerType: 'document_ocr',
        provider: 'siliconflow',
        model: 'model-a'
      }
    })

    const artifactId = persistProviderEgressRequest(db, {
      job: boundary.job,
      policyKey: boundary.policyKey,
      requestEnvelope: boundary.requestEnvelope,
      redactionSummary: boundary.redactionSummary,
      createdAt
    })
    persistProviderEgressResponse(db, {
      artifactId,
      payload: { ok: true },
      createdAt
    })

    const artifactCount = (db.prepare('select count(*) as count from provider_egress_artifacts').get() as { count: number }).count
    const requestCount = (db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('request') as { count: number }).count
    const responseCount = (db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('response') as { count: number }).count
    const policyCount = (db.prepare('select count(*) as count from redaction_policies where policy_key = ?').get('document_ocr.remote_baseline') as { count: number }).count

    expect(artifactCount).toBe(1)
    expect(requestCount).toBe(1)
    expect(responseCount).toBe(1)
    expect(policyCount).toBe(1)

    db.close()
  })
})
