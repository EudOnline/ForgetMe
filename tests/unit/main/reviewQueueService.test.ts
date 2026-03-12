import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { approveReviewItem, approveSafeReviewGroup, listDecisionJournal, rejectReviewItem, undoDecision } from '../../../src/main/services/reviewQueueService'

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



function seedProfileBatchFixture(db: ReturnType<typeof openDatabase>, input: {
  createdAt: string
  canonicalPersonId: string
  canonicalPersonName: string
  fieldKey: string
  values: string[]
}) {
  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-batch', 'profile-batch-review', 'ready', input.createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(input.canonicalPersonId, input.canonicalPersonName, input.canonicalPersonName.toLowerCase(), 1, input.createdAt, input.createdAt, input.values.length, '[]', 'approved', input.createdAt, input.createdAt)

  for (const [index, value] of input.values.entries()) {
    const suffix = index + 1
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`f-batch-${suffix}`, 'b-batch', `/tmp/profile-${suffix}.pdf`, `/tmp/profile-${suffix}.pdf`, `profile-${suffix}.pdf`, '.pdf', 'application/pdf', 1, `hash-batch-${suffix}`, 'unique', 'parsed', input.createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`job-batch-${suffix}`, `f-batch-${suffix}`, 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, input.createdAt, input.createdAt, null, '{}', input.createdAt, input.createdAt)
    db.prepare('insert into enriched_evidence (id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`ee-batch-${suffix}`, `f-batch-${suffix}`, `job-batch-${suffix}`, 'approved_structured_field', JSON.stringify({ fieldKey: input.fieldKey, fieldValue: { value } }), 'high', 'approved', input.createdAt, input.createdAt)
    db.prepare('insert into profile_attribute_candidates (id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id, attribute_group, attribute_key, value_json, proposal_basis_json, reason_code, confidence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`pac-batch-${suffix}`, input.canonicalPersonId, `f-batch-${suffix}`, `ee-batch-${suffix}`, `fc-batch-${suffix}`, 'education', input.fieldKey, JSON.stringify({ value }), JSON.stringify({ matchedRule: 'single_file_person' }), 'singleton_conflict', 0.95, 'pending', input.createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(`rq-batch-${suffix}`, 'profile_attribute_candidate', `pac-batch-${suffix}`, 'pending', 0, 0.95, JSON.stringify({ attributeKey: input.fieldKey }), input.createdAt)
  }
}

it('approves a safe profile attribute group and can undo the batch from journal history', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  seedProfileBatchFixture(db, {
    createdAt,
    canonicalPersonId: 'cp-batch',
    canonicalPersonName: 'Alice Chen',
    fieldKey: 'school_name',
    values: ['北京大学', '北京大学']
  })

  const approved = approveSafeReviewGroup(db, {
    groupKey: 'cp-batch::profile_attribute_candidate::school_name',
    actor: 'local-user'
  })

  expect(approved.status).toBe('approved')
  expect(approved.itemCount).toBe(2)
  expect((db.prepare('select count(*) as count from person_profile_attributes where status = ?').get('active') as { count: number }).count).toBe(2)
  expect((db.prepare('select count(*) as count from decision_batches').get() as { count: number }).count).toBe(1)
  expect((db.prepare('select count(*) as count from decision_batch_items').get() as { count: number }).count).toBe(2)
  expect(db.prepare('select status from decision_batches where id = ?').get(approved.batchId)).toEqual({ status: 'approved' })

  const undone = undoDecision(db, { journalId: approved.journalId, actor: 'local-user' })

  expect(undone.status).toBe('undone')
  expect((db.prepare('select count(*) as count from person_profile_attributes where status = ?').get('undone') as { count: number }).count).toBe(2)
  expect((db.prepare('select count(*) as count from review_queue where status = ?').get('undone') as { count: number }).count).toBe(2)
  expect(db.prepare('select status from decision_batches where id = ?').get(approved.batchId)).toEqual({ status: 'undone' })
  db.close()
})

it('rejects safe batch approval for single-item profile groups', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  seedProfileBatchFixture(db, {
    createdAt,
    canonicalPersonId: 'cp-single',
    canonicalPersonName: 'Alice Chen',
    fieldKey: 'school_name',
    values: ['北京大学']
  })

  expect(() => approveSafeReviewGroup(db, {
    groupKey: 'cp-single::profile_attribute_candidate::school_name',
    actor: 'local-user'
  })).toThrow(/at least 2 pending/i)
  db.close()
})

it('rejects safe batch approval for structured field groups', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-structured-batch', 'structured-batch-review', 'ready', createdAt)
  db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-structured', 'Alice Chen', 'document', 1, createdAt)
  db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-structured', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 2, '[]', 'approved', createdAt, createdAt)
  db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-structured', 'cp-structured', 'p-structured', 'active', createdAt, createdAt)

  for (const suffix of [1, 2]) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`f-structured-${suffix}`, 'b-structured-batch', `/tmp/structured-${suffix}.pdf`, `/tmp/structured-${suffix}.pdf`, `structured-${suffix}.pdf`, '.pdf', 'application/pdf', 1, `hash-structured-${suffix}`, 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`job-structured-${suffix}`, `f-structured-${suffix}`, 'document_ocr', 'siliconflow', 'fixture-model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(`rel-structured-${suffix}`, 'p-structured', 'person', `f-structured-${suffix}`, 'file', 'mentioned_in', 1, createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`fc-structured-${suffix}`, `f-structured-${suffix}`, `job-structured-${suffix}`, 'education', 'school_name', '{"value":"北京大学"}', 'transcript', 0.99, 'high', 1, null, 'pending', createdAt)
    db.prepare('insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(`rq-structured-${suffix}`, 'structured_field_candidate', `fc-structured-${suffix}`, 'pending', 0, 0.99, '{"fieldKey":"school_name"}', createdAt)
  }

  expect(() => approveSafeReviewGroup(db, {
    groupKey: 'cp-structured::structured_field_candidate::school_name',
    actor: 'local-user'
  })).toThrow(/profile attribute groups/i)
  db.close()
})

it('filters decision journal history by query and returns replay summaries', () => {
  const db = setupDatabase()
  const createdAt = '2026-03-12T00:00:00.000Z'

  seedProfileBatchFixture(db, {
    createdAt,
    canonicalPersonId: 'cp-journal',
    canonicalPersonName: 'Alice Chen',
    fieldKey: 'school_name',
    values: ['北京大学', '北京大学']
  })

  approveSafeReviewGroup(db, {
    groupKey: 'cp-journal::profile_attribute_candidate::school_name',
    actor: 'local-user'
  })

  const matching = listDecisionJournal(db, { query: 'Alice Chen' })
  const nonMatching = listDecisionJournal(db, { query: 'Bob' })

  expect(matching[0]).toEqual(expect.objectContaining({
    decisionType: 'approve_safe_review_group',
    targetType: 'decision_batch',
    replaySummary: 'Safe batch approve · Alice Chen · school_name · 2 items'
  }))
  expect(nonMatching).toEqual([])
  db.close()
})
