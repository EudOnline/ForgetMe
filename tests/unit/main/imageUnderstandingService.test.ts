import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { normalizeImageExtraction, persistImageExtraction } from '../../../src/main/services/imageUnderstandingService'

describe('normalizeImageExtraction', () => {
  it('creates screenshot text and generic image summary output', () => {
    const result = normalizeImageExtraction({
      imageType: 'chat_screenshot',
      summary: 'Two chat bubbles are visible',
      transcriptText: 'Alice: hi\nBob: hello',
      detectedDates: ['2026-03-11'],
      detectedLocations: ['Shanghai']
    })

    expect(result.generic.imageSummary).toContain('chat bubbles')
    expect(result.generic.rawText).toContain('Alice')
    expect(result.generic.detectedDates).toEqual(['2026-03-11'])
    expect(result.typed?.imageType).toBe('chat_screenshot')
  })
})

describe('persistImageExtraction', () => {
  it('writes generic image evidence and high-risk screenshot field candidates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-image-understanding-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    const createdAt = '2026-03-11T00:00:00.000Z'

    runMigrations(db)
    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'image-test', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/chat.png', '/tmp/chat.png', 'chat.png', '.png', null, 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'job-1',
      'f-1',
      'chat_screenshot',
      'siliconflow',
      'Qwen/Qwen2.5-VL-32B-Instruct',
      'pending',
      0,
      null,
      null,
      null,
      null,
      '{}',
      createdAt,
      createdAt
    )

    const result = normalizeImageExtraction({
      imageType: 'chat_screenshot',
      summary: 'Two chat bubbles are visible',
      transcriptText: 'Alice: hi\nBob: hello',
      participantFragments: ['Alice', 'Bob'],
      detectedDates: ['2026-03-11'],
      detectedLocations: ['Shanghai']
    })

    persistImageExtraction(db, {
      fileId: 'f-1',
      jobId: 'job-1',
      extraction: result
    })

    const evidence = db.prepare(
      'select evidence_type as evidenceType, status from enriched_evidence where job_id = ? order by evidence_type asc'
    ).all('job-1') as Array<{ evidenceType: string; status: string }>
    const candidates = db.prepare(
      'select field_key as fieldKey, risk_level as riskLevel, status from structured_field_candidates where job_id = ? order by field_key asc'
    ).all('job-1') as Array<{ fieldKey: string; riskLevel: string; status: string }>

    expect(evidence).toEqual([
      expect.objectContaining({ evidenceType: 'image_detected_dates', status: 'approved' }),
      expect.objectContaining({ evidenceType: 'image_detected_locations', status: 'approved' }),
      expect.objectContaining({ evidenceType: 'image_raw_text', status: 'approved' }),
      expect.objectContaining({ evidenceType: 'image_summary', status: 'approved' })
    ])
    expect(candidates).toEqual([
      { fieldKey: 'participant_fragment', riskLevel: 'high', status: 'pending' },
      { fieldKey: 'participant_fragment', riskLevel: 'high', status: 'pending' }
    ])

    db.close()
  })
})
