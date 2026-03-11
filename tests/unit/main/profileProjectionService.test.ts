import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { projectApprovedFieldToProfile } from '../../../src/main/services/profileProjectionService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-profile-projection-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('projectApprovedFieldToProfile', () => {
  it('writes a formal profile attribute for deterministic approved fields', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'projection', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'document', 1, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAt)
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'ee-1',
      'f-1',
      'job-1',
      'approved_structured_field',
      '{"candidateId":"fc-1","fieldType":"education","fieldKey":"school_name","fieldValue":{"value":"北京大学"},"documentType":"transcript"}',
      'high',
      'approved',
      createdAt,
      createdAt
    )

    const result = projectApprovedFieldToProfile(db, { evidenceId: 'ee-1' })

    expect(result.status).toBe('projected')
    expect((db.prepare('select count(*) as count from person_profile_attributes').get() as { count: number }).count).toBe(1)
    db.close()
  })

  it('queues a profile candidate instead of overwriting a conflicting singleton attribute', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'projection', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'document', 1, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAt)
    db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'ppa-1',
      'cp-1',
      'education',
      'school_name',
      '{"value":"清华大学"}',
      '清华大学',
      'f-1',
      null,
      null,
      '{}',
      1,
      'active',
      null,
      createdAt,
      createdAt
    )
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'ee-2',
      'f-1',
      'job-1',
      'approved_structured_field',
      '{"candidateId":"fc-2","fieldType":"education","fieldKey":"school_name","fieldValue":{"value":"北京大学"},"documentType":"transcript"}',
      'high',
      'approved',
      createdAt,
      createdAt
    )

    const result = projectApprovedFieldToProfile(db, { evidenceId: 'ee-2' })

    expect(result.status).toBe('queued')
    expect((db.prepare('select count(*) as count from profile_attribute_candidates').get() as { count: number }).count).toBe(1)
    expect((db.prepare("select count(*) as count from review_queue where item_type = 'profile_attribute_candidate'").get() as { count: number }).count).toBe(1)
    db.close()
  })
})
