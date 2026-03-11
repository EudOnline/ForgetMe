import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { executeEnrichmentJob } from '../../../src/main/services/enrichmentExecutionService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-execution-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('executeEnrichmentJob', () => {
  it('routes document jobs into OCR persistence, review queueing, and provider boundary audit', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'execution', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'processing', 1, null, createdAt, null, null, '{}', createdAt, createdAt)

    const result = await executeEnrichmentJob(db, {
      jobId: 'job-1',
      callModel: async ({ requestEnvelope }) => {
        expect(JSON.stringify(requestEnvelope)).not.toContain('/tmp/transcript.pdf')
        expect(JSON.stringify(requestEnvelope)).toContain('vault://file/f-1')

        return {
          provider: 'siliconflow',
          model: 'model-a',
          usage: { prompt_tokens: 10 },
          receivedAt: createdAt,
          payload: {
            choices: [{
              message: {
                content: JSON.stringify({
                  documentType: 'transcript',
                  rawText: '学校 北京大学',
                  layoutBlocks: [{ page: 1, text: '学校 北京大学' }],
                  fields: {
                    school_name: '北京大学',
                    student_name: 'Alice Chen'
                  }
                })
              }
            }]
          }
        }
      }
    })

    expect(result.status).toBe('completed')
    expect((db.prepare('select count(*) as count from enrichment_artifacts where job_id = ?').get('job-1') as { count: number }).count).toBe(2)
    expect((db.prepare('select count(*) as count from structured_field_candidates where job_id = ?').get('job-1') as { count: number }).count).toBe(2)
    expect((db.prepare('select count(*) as count from review_queue where candidate_id in (select id from structured_field_candidates where job_id = ?)').get('job-1') as { count: number }).count).toBe(2)
    expect((db.prepare('select count(*) as count from provider_egress_artifacts where job_id = ?').get('job-1') as { count: number }).count).toBe(1)
    expect((db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('request') as { count: number }).count).toBe(1)
    expect((db.prepare('select count(*) as count from provider_egress_events where event_type = ?').get('response') as { count: number }).count).toBe(1)
    db.close()
  })
})
