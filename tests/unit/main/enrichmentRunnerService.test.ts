import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { appendEnrichmentAttempt, claimNextEnrichmentJob, completeEnrichmentJob, failEnrichmentJob } from '../../../src/main/services/enrichmentRunnerService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-runner-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('enrichment runner core', () => {
  it('claims the oldest pending job and marks it processing', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'runner', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/late.pdf', '/tmp/late.pdf', 'late.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-1', '/tmp/early.pdf', '/tmp/early.pdf', 'early.pdf', '.pdf', 'application/pdf', 1, 'hash-2', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-late', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'pending', 0, null, null, null, null, '{}', '2026-03-11T00:05:00.000Z', '2026-03-11T00:05:00.000Z')
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-early', 'f-2', 'document_ocr', 'siliconflow', 'model-a', 'pending', 0, null, null, null, null, '{}', '2026-03-11T00:01:00.000Z', '2026-03-11T00:01:00.000Z')

    const result = claimNextEnrichmentJob(db)

    expect(result).toEqual(expect.objectContaining({ id: 'job-early', status: 'processing' }))
    expect(db.prepare('select status from enrichment_jobs where id = ?').get('job-early')).toEqual({ status: 'processing' })
    db.close()
  })

  it('stores attempt records and completes a job cleanly', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'runner', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/doc.pdf', '/tmp/doc.pdf', 'doc.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'processing', 1, null, createdAt, null, null, '{}', createdAt, createdAt)

    const attempt = appendEnrichmentAttempt(db, { jobId: 'job-1', provider: 'siliconflow', model: 'model-a' })
    completeEnrichmentJob(db, {
      jobId: 'job-1',
      usage: { promptTokens: 12 },
      finishedAt: '2026-03-11T00:10:00.000Z'
    })

    expect(attempt.attemptIndex).toBe(1)
    expect(db.prepare('select status, finished_at as finishedAt from enrichment_jobs where id = ?').get('job-1')).toEqual({
      status: 'completed',
      finishedAt: '2026-03-11T00:10:00.000Z'
    })
    expect((db.prepare('select count(*) as count from enrichment_attempts where job_id = ?').get('job-1') as { count: number }).count).toBe(1)
    db.close()
  })

  it('marks a job failed and stores the error message', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'runner', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/doc.pdf', '/tmp/doc.pdf', 'doc.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'processing', 1, null, createdAt, null, null, '{}', createdAt, createdAt)

    failEnrichmentJob(db, {
      jobId: 'job-1',
      errorMessage: 'provider timeout',
      finishedAt: '2026-03-11T00:10:00.000Z'
    })

    expect(db.prepare('select status, error_message as errorMessage from enrichment_jobs where id = ?').get('job-1')).toEqual({
      status: 'failed',
      errorMessage: 'provider timeout'
    })
    db.close()
  })
})


describe('createEnrichmentRunner', () => {
  it('starts a polling loop and can stop cleanly', async () => {
    vi.useFakeTimers()
    try {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-runner-loop-'))
      const { ensureAppPaths } = await import('../../../src/main/services/appPaths')
      const { createEnrichmentRunner } = await import('../../../src/main/services/enrichmentRunnerService')
      const appPaths = ensureAppPaths(root)
      const runCycle = vi.fn().mockResolvedValue(false)

      const runner = createEnrichmentRunner({
        appPaths,
        intervalMs: 20,
        runCycle
      })

      await vi.advanceTimersByTimeAsync(20)
      expect(runCycle).toHaveBeenCalledTimes(1)

      runner.stop()
      await vi.advanceTimersByTimeAsync(60)
      expect(runCycle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
