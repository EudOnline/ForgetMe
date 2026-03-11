import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { approveReviewItem, rejectReviewItem, undoDecision } from '../../../src/main/services/reviewQueueService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-review-queue-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('review queue approvals', () => {
  it('keeps the more informative canonical name when approving a merge', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'alice chen', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-2', 'Alice Chen', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-lower', 'alice chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-title', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-lower', 'cp-lower', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-title', 'cp-title', 'p-2', 'active', createdAt, createdAt)
    db.prepare('insert into person_merge_candidates (id, left_canonical_person_id, right_canonical_person_id, confidence, matched_rules_json, supporting_evidence_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('mc-name', 'cp-lower', 'cp-title', 0.95, '["normalized_name_exact"]', '{"matchedDisplayNames":["alice chen","Alice Chen"]}', 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-name', 'person_merge_candidate', 'mc-name', 'pending', 0, 0.95, '{}', createdAt)

    approveReviewItem(db, { queueItemId: 'rq-name', actor: 'local-user' })

    expect(db.prepare('select status from canonical_people where id = ?').get('cp-title')).toEqual({ status: 'approved' })
    expect(db.prepare('select status from canonical_people where id = ?').get('cp-lower')).toEqual({ status: 'merged' })
    expect((db.prepare('select count(*) as count from person_memberships where canonical_person_id = ? and status = ?').get('cp-title', 'active') as { count: number }).count).toBe(2)
    db.close()
  })

  it('approves a merge candidate and can undo it', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-2', 'alice chen', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-2', 'alice chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-2', 'cp-2', 'p-2', 'active', createdAt, createdAt)
    db.prepare('insert into person_merge_candidates (id, left_canonical_person_id, right_canonical_person_id, confidence, matched_rules_json, supporting_evidence_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('mc-1', 'cp-1', 'cp-2', 0.95, '["normalized_name_exact"]', '{"matchedDisplayNames":["Alice Chen","alice chen"]}', 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-1', 'person_merge_candidate', 'mc-1', 'pending', 0, 0.95, '{}', createdAt)

    const approved = approveReviewItem(db, { queueItemId: 'rq-1', actor: 'local-user' })

    expect(approved.status).toBe('approved')
    expect(db.prepare('select status from canonical_people where id = ?').get('cp-2')).toEqual({ status: 'merged' })
    expect((db.prepare('select count(*) as count from person_memberships where canonical_person_id = ? and status = ?').get('cp-1', 'active') as { count: number }).count).toBe(2)

    const undone = undoDecision(db, { journalId: approved.journalId, actor: 'local-user' })

    expect(undone.status).toBe('undone')
    expect(db.prepare('select status from canonical_people where id = ?').get('cp-2')).toEqual({ status: 'approved' })
    expect((db.prepare('select count(*) as count from person_memberships where canonical_person_id = ? and status = ?').get('cp-1', 'active') as { count: number }).count).toBe(1)
    db.close()
  })

  it('rejects a pending review item without mutating formal state', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-2', 'alice chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_merge_candidates (id, left_canonical_person_id, right_canonical_person_id, confidence, matched_rules_json, supporting_evidence_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('mc-2', 'cp-1', 'cp-2', 0.95, '["normalized_name_exact"]', '{"matchedDisplayNames":["Alice Chen","alice chen"]}', 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-2', 'person_merge_candidate', 'mc-2', 'pending', 0, 0.95, '{}', createdAt)

    const rejected = rejectReviewItem(db, { queueItemId: 'rq-2', actor: 'local-user', note: 'not enough evidence' })

    expect(rejected.status).toBe('rejected')
    expect(db.prepare('select status from person_merge_candidates where id = ?').get('mc-2')).toEqual({ status: 'rejected' })
    expect(db.prepare('select status from review_queue where id = ?').get('rq-2')).toEqual({ status: 'rejected' })
    expect(db.prepare('select status from canonical_people where id = ?').get('cp-2')).toEqual({ status: 'approved' })
    db.close()
  })

  it('approves an event-cluster candidate and can undo it', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-2', 'Bob', 'bob', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'review-test', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/a.json', '/tmp/a.json', 'a.json', '.json', null, 1, 'h1', 'unique', 'parsed', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-1', '/tmp/b.json', '/tmp/b.json', 'b.json', '.json', null, 1, 'h2', 'unique', 'parsed', createdAt)
    db.prepare('insert into event_cluster_candidates (id, proposed_title, time_start, time_end, confidence, supporting_evidence_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('ec-1', 'Coffee meetup', '2026-03-10T10:00:00.000Z', '2026-03-10T10:10:00.000Z', 0.9, '{"evidenceFileIds":["f-1","f-2"],"canonicalPersonIds":["cp-1","cp-2"]}', 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-3', 'event_cluster_candidate', 'ec-1', 'pending', 0, 0.9, '{}', createdAt)

    const approved = approveReviewItem(db, { queueItemId: 'rq-3', actor: 'local-user' })

    expect(approved.status).toBe('approved')
    expect((db.prepare('select count(*) as count from event_clusters').get() as { count: number }).count).toBe(1)
    expect((db.prepare('select count(*) as count from event_cluster_members').get() as { count: number }).count).toBe(2)
    expect((db.prepare('select count(*) as count from event_cluster_evidence').get() as { count: number }).count).toBe(2)

    const undone = undoDecision(db, { journalId: approved.journalId, actor: 'local-user' })

    expect(undone.status).toBe('undone')
    expect((db.prepare('select count(*) as count from event_clusters').get() as { count: number }).count).toBe(0)
    db.close()
  })
})

it('routes structured field candidates through the shared review queue handlers', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-11T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'structured-review', 'ready', createdAt)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
  db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'document', 1, createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
  db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
  db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rel-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in', 1, createdAt)
  db.prepare(`insert into enrichment_jobs (
    id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
    started_at, finished_at, error_message, usage_json, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
  db.prepare(`insert into structured_field_candidates (
    id, file_id, job_id, field_type, field_key, field_value_json, document_type,
    confidence, risk_level, source_page, source_span_json, status, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-1', 'f-1', 'job-1', 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-structured', 'structured_field_candidate', 'fc-1', 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)

  const approved = approveReviewItem(db, { queueItemId: 'rq-structured', actor: 'local-user' })

  expect(approved.status).toBe('approved')
  expect(db.prepare('select status from structured_field_candidates where id = ?').get('fc-1')).toEqual({ status: 'approved' })
  expect((db.prepare('select count(*) as count from enriched_evidence where evidence_type = ?').get('approved_structured_field') as { count: number }).count).toBe(1)
  expect((db.prepare('select count(*) as count from person_profile_attributes').get() as { count: number }).count).toBe(1)

  const undone = undoDecision(db, { journalId: approved.journalId, actor: 'local-user' })

  expect(undone.status).toBe('undone')
  expect(db.prepare('select status from structured_field_candidates where id = ?').get('fc-1')).toEqual({ status: 'undone' })
  db.close()
})

it('routes profile attribute candidates through the shared review queue handlers', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-11T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'profile-review', 'ready', createdAt)
  db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
  db.prepare(`insert into enrichment_jobs (
    id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
    started_at, finished_at, error_message, usage_json, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
  db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"fieldKey":"school_name","fieldValue":{"value":"北京大学"}}', 'high', 'approved', createdAt, createdAt)
  db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('pac-1', 'cp-1', 'f-1', 'ee-1', 'fc-1', 'education', 'school_name', '{"value":"北京大学"}', '{"matchedRule":"single_file_person"}', 'singleton_conflict', 0.95, 'pending', createdAt)
  db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('rq-profile', 'profile_attribute_candidate', 'pac-1', 'pending', 0, 0.95, '{"attributeKey":"school_name"}', createdAt)

  const approved = approveReviewItem(db, { queueItemId: 'rq-profile', actor: 'local-user' })

  expect(approved.status).toBe('approved')
  expect((db.prepare('select count(*) as count from person_profile_attributes').get() as { count: number }).count).toBe(1)

  const undone = undoDecision(db, { journalId: approved.journalId, actor: 'local-user' })

  expect(undone.status).toBe('undone')
  expect(db.prepare('select status from profile_attribute_candidates where id = ?').get('pac-1')).toEqual({ status: 'undone' })
  db.close()
})

