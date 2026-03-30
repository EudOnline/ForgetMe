import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAgentRun } from '../../../src/main/services/agentPersistenceService'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { evaluateAgentProactiveSuggestions } from '../../../src/main/services/agentProactiveTriggerService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-proactive-trigger-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function insertBatchAndFile(input: {
  db: ReturnType<typeof setupDatabase>
  batchId: string
  fileId: string
  fileName: string
  createdAt: string
}) {
  input.db.prepare(
    'insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)'
  ).run(input.batchId, input.batchId, 'ready', input.createdAt)
  input.db.prepare(
    `insert into vault_files (
      id, batch_id, source_path, frozen_path, file_name, extension, mime_type,
      file_size, sha256, duplicate_class, parser_status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.fileId,
    input.batchId,
    `/tmp/${input.fileName}`,
    `/tmp/${input.fileName}`,
    input.fileName,
    '.pdf',
    'application/pdf',
    1,
    `hash-${input.fileId}`,
    'unique',
    'parsed',
    input.createdAt
  )
}

describe('agentProactiveTriggerService', () => {
  it('creates one governance suggestion when failed agent runs exist', () => {
    const db = setupDatabase()

    createAgentRun(db, {
      runId: 'run-failed-1',
      role: 'workspace',
      taskKind: 'workspace.ask_memory',
      status: 'failed',
      errorMessage: 'workspace failure',
      prompt: 'Answer from workspace memory',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z'
    })
    createAgentRun(db, {
      runId: 'run-failed-2',
      role: 'review',
      taskKind: 'review.summarize_queue',
      status: 'failed',
      errorMessage: 'review failure',
      prompt: 'Summarize review queue',
      createdAt: '2026-03-30T00:01:00.000Z',
      updatedAt: '2026-03-30T00:01:00.000Z'
    })

    const suggestions = evaluateAgentProactiveSuggestions(db)

    expect(suggestions.filter((item) => item.triggerKind === 'governance.failed_runs_detected')).toHaveLength(1)
    expect(suggestions).toContainEqual(expect.objectContaining({
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::latest',
      sourceRunId: 'run-failed-2'
    }))

    db.close()
  })

  it('creates one review suggestion when a safe group is available', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:10:00.000Z'
    insertBatchAndFile({
      db,
      batchId: 'batch-safe-group',
      fileId: 'file-safe-group',
      fileName: 'safe-group.pdf',
      createdAt
    })

    db.prepare(
      `insert into enrichment_jobs (
        id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
        started_at, finished_at, error_message, usage_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'job-safe-group',
      'file-safe-group',
      'document_ocr',
      'siliconflow',
      'model-a',
      'completed',
      1,
      null,
      createdAt,
      createdAt,
      null,
      '{}',
      createdAt,
      createdAt
    )

    db.prepare(
      `insert into structured_field_candidates (
        id, file_id, job_id, field_type, field_key, field_value_json, document_type,
        confidence, risk_level, source_page, source_span_json, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'candidate-safe-1',
      'file-safe-group',
      'job-safe-group',
      'identity',
      'full_name',
      '{"value":"Alice"}',
      'id_card',
      0.92,
      'high',
      1,
      null,
      'pending',
      createdAt
    )
    db.prepare(
      `insert into structured_field_candidates (
        id, file_id, job_id, field_type, field_key, field_value_json, document_type,
        confidence, risk_level, source_page, source_span_json, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'candidate-safe-2',
      'file-safe-group',
      'job-safe-group',
      'identity',
      'full_name',
      '{"value":"Alice"}',
      'id_card',
      0.91,
      'high',
      1,
      null,
      'pending',
      createdAt
    )

    db.prepare(
      `insert into review_queue (
        id, item_type, candidate_id, status, priority, confidence, summary_json, created_at, reviewed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('rq-safe-1', 'structured_field_candidate', 'candidate-safe-1', 'pending', 0, 0.92, '{}', createdAt, null)
    db.prepare(
      `insert into review_queue (
        id, item_type, candidate_id, status, priority, confidence, summary_json, created_at, reviewed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('rq-safe-2', 'structured_field_candidate', 'candidate-safe-2', 'pending', 0, 0.91, '{}', createdAt, null)

    const suggestions = evaluateAgentProactiveSuggestions(db)

    expect(suggestions.filter((item) => item.triggerKind === 'review.safe_group_available')).toHaveLength(1)
    expect(suggestions).toContainEqual(expect.objectContaining({
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Check for a safe review group that is ready for approval.'
      }
    }))

    db.close()
  })

  it('creates one rerun suggestion per failed enrichment job', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:20:00.000Z'
    insertBatchAndFile({
      db,
      batchId: 'batch-enrichment-1',
      fileId: 'file-enrichment-1',
      fileName: 'failed-a.pdf',
      createdAt
    })
    insertBatchAndFile({
      db,
      batchId: 'batch-enrichment-2',
      fileId: 'file-enrichment-2',
      fileName: 'failed-b.pdf',
      createdAt
    })

    db.prepare(
      `insert into enrichment_jobs (
        id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
        started_at, finished_at, error_message, usage_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('job-failed-1', 'file-enrichment-1', 'document_ocr', 'siliconflow', 'model-a', 'failed', 2, null, createdAt, createdAt, 'timeout', '{}', createdAt, createdAt)
    db.prepare(
      `insert into enrichment_jobs (
        id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
        started_at, finished_at, error_message, usage_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('job-failed-2', 'file-enrichment-2', 'image_understanding', 'openrouter', 'model-b', 'failed', 1, null, createdAt, createdAt, 'provider error', '{}', createdAt, createdAt)
    db.prepare(
      `insert into enrichment_jobs (
        id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
        started_at, finished_at, error_message, usage_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('job-completed-1', 'file-enrichment-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)

    const suggestions = evaluateAgentProactiveSuggestions(db)
    const rerunSuggestions = suggestions.filter((item) => item.triggerKind === 'ingestion.failed_enrichment_job')

    expect(rerunSuggestions).toHaveLength(2)
    expect(rerunSuggestions).toContainEqual(expect.objectContaining({
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Rerun failed enrichment job job-failed-1 for file failed-a.pdf.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-failed-1'
    }))
    expect(rerunSuggestions).toContainEqual(expect.objectContaining({
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Rerun failed enrichment job job-failed-2 for file failed-b.pdf.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-failed-2'
    }))

    db.close()
  })

  it('keeps dedupe keys stable across evaluation cycles', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:30:00.000Z'
    createAgentRun(db, {
      runId: 'run-failed-stable',
      role: 'workspace',
      taskKind: 'workspace.ask_memory',
      status: 'failed',
      errorMessage: 'workspace failure',
      prompt: 'Answer from workspace memory',
      createdAt,
      updatedAt: createdAt
    })
    insertBatchAndFile({
      db,
      batchId: 'batch-stable',
      fileId: 'file-stable',
      fileName: 'stable.pdf',
      createdAt
    })
    db.prepare(
      `insert into enrichment_jobs (
        id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
        started_at, finished_at, error_message, usage_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('job-stable-failed', 'file-stable', 'document_ocr', 'siliconflow', 'model-a', 'failed', 1, null, createdAt, createdAt, 'network error', '{}', createdAt, createdAt)
    db.prepare(
      `insert into structured_field_candidates (
        id, file_id, job_id, field_type, field_key, field_value_json, document_type,
        confidence, risk_level, source_page, source_span_json, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('candidate-stable-1', 'file-stable', 'job-stable-failed', 'identity', 'full_name', '{"value":"Stable Alice"}', 'id_card', 0.9, 'high', 1, null, 'pending', createdAt)
    db.prepare(
      `insert into structured_field_candidates (
        id, file_id, job_id, field_type, field_key, field_value_json, document_type,
        confidence, risk_level, source_page, source_span_json, status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('candidate-stable-2', 'file-stable', 'job-stable-failed', 'identity', 'full_name', '{"value":"Stable Alice"}', 'id_card', 0.89, 'high', 1, null, 'pending', createdAt)
    db.prepare(
      `insert into review_queue (
        id, item_type, candidate_id, status, priority, confidence, summary_json, created_at, reviewed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('rq-stable-1', 'structured_field_candidate', 'candidate-stable-1', 'pending', 0, 0.9, '{}', createdAt, null)
    db.prepare(
      `insert into review_queue (
        id, item_type, candidate_id, status, priority, confidence, summary_json, created_at, reviewed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('rq-stable-2', 'structured_field_candidate', 'candidate-stable-2', 'pending', 0, 0.89, '{}', createdAt, null)

    const firstCycle = evaluateAgentProactiveSuggestions(db)
    const secondCycle = evaluateAgentProactiveSuggestions(db)

    expect(firstCycle.map((item) => item.dedupeKey)).toEqual(secondCycle.map((item) => item.dedupeKey))
    expect(firstCycle.map((item) => item.triggerKind)).toEqual(secondCycle.map((item) => item.triggerKind))

    db.close()
  })
})
