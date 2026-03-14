import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { setRelationshipLabel } from '../../../src/main/services/graphService'
import { getPersonDossier } from '../../../src/main/services/personDossierService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-dossier-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedApprovedPersonScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'dossier', 'ready', createdAt)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-1', '/tmp/transcript-2.pdf', '/tmp/transcript-2.pdf', 'transcript-2.pdf', '.pdf', 'application/pdf', 1, 'hash-2', 'unique', 'parsed', createdAt)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-3', 'b-1', '/tmp/transcript-3.pdf', '/tmp/transcript-3.pdf', 'transcript-3.pdf', '.pdf', 'application/pdf', 1, 'hash-3', 'unique', 'parsed', createdAt)
  db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
  db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-2', 'f-2', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
  db.prepare('insert into enrichment_jobs (id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('job-3', 'f-3', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-1', 'f-1', 'job-1', 'structured_fields', '{}', 'low', 'approved', createdAt, createdAt)
  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-2', 'f-2', 'job-2', 'structured_fields', '{}', 'low', 'approved', createdAt, createdAt)
  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-3', 'f-3', 'job-3', 'structured_fields', '{}', 'low', 'approved', createdAt, createdAt)
  db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'chat_participant', 1, createdAt)
  db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-2', 'Bob Li', 'chat_participant', 1, createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '["college-friend"]', 'approved', createdAt, createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-2', 'Bob Li', 'bob li', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
  db.prepare('insert into person_aliases (id, canonical_person_id, anchor_person_id, display_name, normalized_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('pa-1', 'cp-1', 'p-1', 'Alice C.', 'alice c.', 'manual', 1, createdAt)
  db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
  db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-2', 'cp-2', 'p-2', 'active', createdAt, createdAt)
  db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in_file', 1, createdAt)
  db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-3', 'p-1', 'person', 'f-2', 'file', 'mentioned_in_file', 1, createdAt)
  db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-4', 'p-1', 'person', 'f-3', 'file', 'mentioned_in_file', 1, createdAt)
  db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-2', 'p-2', 'person', 'f-1', 'file', 'mentioned_in_file', 1, createdAt)
  db.prepare('insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ec-1', 'Approved event', '2026-03-12T10:00:00.000Z', '2026-03-12T10:05:00.000Z', 'approved summary', 'approved', null, createdAt, createdAt)
  db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-1', 'ec-1', 'cp-1', createdAt)
  db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-1', 'ec-1', 'f-1', createdAt)
  db.prepare('insert into decision_journal (id, decision_type, target_type, target_id, operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('j-1', 'approve_profile_attribute_candidate', 'profile_attribute_candidate', 'pac-1', '{"queueItemId":"rq-1","attributeId":"attr-1"}', '{"queueItemId":"rq-1","candidateId":"pac-1","attributeId":"attr-1"}', 'local-user', createdAt, null, null)
  db.prepare('insert into person_profile_attributes (id, canonical_person_id, attribute_group, attribute_key, value_json, display_value, source_file_id, source_evidence_id, source_candidate_id, provenance_json, confidence, status, approved_journal_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('attr-1', 'cp-1', 'education', 'school_name', '{"value":"北京大学"}', '北京大学', 'f-1', 'ee-1', 'fc-1', '{}', 1, 'active', 'j-1', createdAt, createdAt)
  db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-2', 'f-2', 'job-2', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
  db.prepare('insert into structured_field_candidates (id, file_id, job_id, field_type, field_key, field_value_json, document_type, confidence, risk_level, source_page, source_span_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fc-3', 'f-3', 'job-3', 'education', 'school_name', '{"value":"清华大学"}', 'transcript', 0.98, 'high', 1, null, 'pending', createdAt)
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-2', 'structured_field_candidate', 'fc-2', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-3', 'structured_field_candidate', 'fc-3', 'pending', 0, 0.98, '{"fieldKey":"school_name"}', createdAt)
  setRelationshipLabel(db, { fromPersonId: 'cp-1', toPersonId: 'cp-2', label: 'friend' })

  return db
}

function seedSparsePersonScenario() {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-empty', 'Sparse Person', 'sparse person', 0, createdAt, createdAt, 0, '[]', 'approved', createdAt, createdAt)

  return db
}

describe('getPersonDossier', () => {
  it('builds a dossier from approved person, timeline, and relationship reads', () => {
    const db = seedApprovedPersonScenario()

    const dossier = getPersonDossier(db, { canonicalPersonId: 'cp-1' })

    expect(dossier?.identityCard).toMatchObject({
      primaryDisplayName: 'Alice Chen',
      displayType: 'approved_fact',
      evidenceCount: 1,
      manualLabels: ['college-friend'],
      aliases: ['Alice C.']
    })
    expect(dossier?.thematicSections).toContainEqual(expect.objectContaining({
      sectionKey: 'education',
      title: 'Education',
      displayType: 'approved_fact',
      items: [
        expect.objectContaining({
          label: 'school_name',
          value: '北京大学',
          displayType: 'approved_fact'
        })
      ]
    }))
    expect(dossier?.timelineHighlights[0]).toMatchObject({
      eventId: 'ec-1',
      title: 'Approved event',
      displayType: 'approved_fact'
    })
    expect(dossier?.relationshipSummary[0]).toMatchObject({
      personId: 'cp-2',
      displayName: 'Bob Li',
      manualLabel: 'friend',
      sharedFileCount: 1,
      displayType: 'approved_fact'
    })
    expect(dossier?.conflictSummary[0]).toMatchObject({
      fieldKey: 'school_name',
      pendingCount: 2,
      distinctValues: ['北京大学', '清华大学'],
      displayType: 'open_conflict'
    })
    expect(dossier?.reviewShortcuts).toContainEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      fieldKey: 'school_name',
      hasConflict: true
    }))
    expect(dossier?.evidenceBacktrace).toContainEqual({
      kind: 'file',
      id: 'f-1',
      label: 'transcript.pdf'
    })

    db.close()
  })

  it('emits coverage-gap placeholders when approved data is missing', () => {
    const db = seedSparsePersonScenario()

    const dossier = getPersonDossier(db, { canonicalPersonId: 'cp-empty' })

    expect(dossier?.identityCard).toMatchObject({
      primaryDisplayName: 'Sparse Person',
      displayType: 'approved_fact',
      evidenceCount: 0
    })
    expect(dossier?.thematicSections).toContainEqual(expect.objectContaining({
      displayType: 'coverage_gap'
    }))
    expect(dossier?.coverageGaps).toContainEqual(expect.objectContaining({
      gapKey: 'timeline.empty',
      displayType: 'coverage_gap'
    }))
    expect(dossier?.coverageGaps).toContainEqual(expect.objectContaining({
      gapKey: 'relationships.empty',
      displayType: 'coverage_gap'
    }))
    expect(dossier?.timelineHighlights).toEqual([])
    expect(dossier?.relationshipSummary).toEqual([])

    db.close()
  })
})
