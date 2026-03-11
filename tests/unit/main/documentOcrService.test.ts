import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { normalizeDocumentExtraction, persistDocumentExtraction } from '../../../src/main/services/documentOcrService'

describe('normalizeDocumentExtraction', () => {
  it('produces typed fields and generic OCR output for id cards', () => {
    const result = normalizeDocumentExtraction({
      documentType: 'id_card',
      rawText: '姓名 张三\n公民身份号码 1234',
      layoutBlocks: [{ page: 1, text: '姓名 张三', bbox: [0, 0, 100, 20] }],
      fields: {
        full_name: '张三',
        national_id_number: '1234'
      }
    })

    expect(result.generic.rawText).toContain('姓名')
    expect(result.generic.layoutBlocks).toHaveLength(1)
    expect(result.typed?.documentType).toBe('id_card')
    expect(result.typed?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'full_name', value: '张三' }),
      expect.objectContaining({ fieldKey: 'national_id_number', value: '1234' })
    ]))
  })
})

describe('persistDocumentExtraction', () => {
  it('writes raw OCR artifacts, generic evidence, and high-risk field candidates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-doc-ocr-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    const createdAt = '2026-03-11T00:00:00.000Z'

    runMigrations(db)
    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'ocr-test', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id.jpg', '/tmp/id.jpg', 'id.jpg', '.jpg', null, 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'job-1',
      'f-1',
      'document_ocr',
      'siliconflow',
      'Qwen/Qwen2.5-VL-72B-Instruct',
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

    const result = normalizeDocumentExtraction({
      documentType: 'id_card',
      rawText: '姓名 张三\n公民身份号码 1234',
      layoutBlocks: [{ page: 1, text: '姓名 张三', bbox: [0, 0, 100, 20] }],
      fields: {
        full_name: '张三',
        national_id_number: '1234'
      }
    })

    persistDocumentExtraction(db, {
      fileId: 'f-1',
      jobId: 'job-1',
      extraction: result
    })

    const artifacts = db.prepare(
      'select artifact_type as artifactType from enrichment_artifacts where job_id = ? order by artifact_type asc'
    ).all('job-1') as Array<{ artifactType: string }>
    const evidence = db.prepare(
      'select evidence_type as evidenceType, status from enriched_evidence where job_id = ?'
    ).all('job-1') as Array<{ evidenceType: string; status: string }>
    const candidates = db.prepare(
      'select field_key as fieldKey, risk_level as riskLevel, status from structured_field_candidates where job_id = ? order by field_key asc'
    ).all('job-1') as Array<{ fieldKey: string; riskLevel: string; status: string }>

    expect(artifacts).toEqual([
      { artifactType: 'ocr_layout_blocks' },
      { artifactType: 'ocr_raw_text' }
    ])
    expect(evidence).toEqual([
      expect.objectContaining({ evidenceType: 'document_raw_text', status: 'approved' }),
      expect.objectContaining({ evidenceType: 'document_layout_blocks', status: 'approved' })
    ])
    expect(candidates).toEqual([
      { fieldKey: 'full_name', riskLevel: 'high', status: 'pending' },
      { fieldKey: 'national_id_number', riskLevel: 'high', status: 'pending' }
    ])

    db.close()
  })
})
