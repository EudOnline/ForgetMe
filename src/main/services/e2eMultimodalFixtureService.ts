import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import {
  insertEnrichmentArtifact,
  insertFixtureEnrichmentJob,
  insertStructuredFieldCandidate,
  loadFixtureFile,
  loadLinkedCanonicalPersonId,
  persistFixtureProviderBoundary
} from './e2eMultimodalFixturePersistenceService'
import { queueStructuredFieldCandidate } from './enrichmentReviewService'
import { queueProfileAttributeCandidate } from './profileProjectionService'

export function seedE2EMultimodalReviewFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from structured_field_candidates
     where file_id = ? and field_key = ?
     limit 1`
  ).get(input.fileId, 'school_name') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const file = loadFixtureFile(db, input.fileId)
  if (!file) {
    throw new Error(`Fixture file not found for provider boundary seed: ${input.fileId}`)
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()
  const candidateId = crypto.randomUUID()

  insertFixtureEnrichmentJob({
    db,
    jobId,
    fileId: input.fileId,
    enhancerType: 'document_ocr',
    provider: 'siliconflow',
    model: 'fixture-model',
    status: 'completed',
    attemptCount: 1,
    inputHash: 'e2e-fixture',
    createdAt
  })
  persistFixtureProviderBoundary({
    db,
    file,
    jobId,
    enhancerType: 'document_ocr',
    provider: 'siliconflow',
    model: 'fixture-model',
    createdAt
  })
  insertEnrichmentArtifact({
    db,
    artifactId: crypto.randomUUID(),
    jobId,
    artifactType: 'ocr_raw_text',
    payload: { rawText: '姓名 Alice Chen\n学校 北京大学' },
    createdAt
  })
  insertEnrichmentArtifact({
    db,
    artifactId: crypto.randomUUID(),
    jobId,
    artifactType: 'ocr_layout_blocks',
    payload: { layoutBlocks: [{ page: 1, text: '学校 北京大学' }] },
    createdAt
  })
  insertStructuredFieldCandidate({
    db,
    candidateId,
    fileId: input.fileId,
    jobId,
    fieldType: 'education',
    fieldKey: 'school_name',
    fieldValue: { value: '北京大学' },
    documentType: 'transcript',
    confidence: 0.99,
    riskLevel: 'high',
    sourcePage: 1,
    status: 'pending',
    createdAt
  })

  queueStructuredFieldCandidate(db, {
    candidateId,
    fieldKey: 'school_name',
    confidence: 0.99
  })

  return { id: candidateId }
}

export function seedE2ERunnerProfileFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from enrichment_jobs
     where file_id = ? and input_hash = ?
     limit 1`
  ).get(input.fileId, 'e2e-runner-profile') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()

  insertFixtureEnrichmentJob({
    db,
    jobId,
    fileId: input.fileId,
    enhancerType: 'document_ocr',
    provider: 'siliconflow',
    model: 'fixture-model',
    status: 'pending',
    attemptCount: 0,
    inputHash: 'e2e-runner-profile',
    createdAt,
    startedAt: null,
    finishedAt: null,
    usage: {}
  })

  return { id: jobId }
}

export function seedE2EDossierConflictFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from enrichment_jobs
     where file_id = ? and input_hash = ?
     limit 1`
  ).get(input.fileId, 'e2e-dossier-conflict') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const canonicalPersonId = loadLinkedCanonicalPersonId(db, input.fileId)
  if (!canonicalPersonId) {
    throw new Error(`Dossier conflict fixture could not resolve canonical person for file: ${input.fileId}`)
  }

  const file = loadFixtureFile(db, input.fileId)
  if (!file) {
    throw new Error(`Fixture file not found for dossier conflict seed: ${input.fileId}`)
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()
  const candidateId = crypto.randomUUID()

  insertFixtureEnrichmentJob({
    db,
    jobId,
    fileId: input.fileId,
    enhancerType: 'document_ocr',
    provider: 'fixture',
    model: 'fixture-dossier-conflict',
    status: 'completed',
    attemptCount: 1,
    inputHash: 'e2e-dossier-conflict',
    createdAt
  })
  persistFixtureProviderBoundary({
    db,
    file,
    jobId,
    enhancerType: 'document_ocr',
    provider: 'fixture',
    model: 'fixture-dossier-conflict',
    createdAt
  })
  insertEnrichmentArtifact({
    db,
    artifactId: crypto.randomUUID(),
    jobId,
    artifactType: 'ocr_raw_text',
    payload: { rawText: '姓名 Alice Chen\n学校 清华大学' },
    createdAt
  })
  insertEnrichmentArtifact({
    db,
    artifactId: crypto.randomUUID(),
    jobId,
    artifactType: 'ocr_layout_blocks',
    payload: { layoutBlocks: [{ page: 1, text: '学校 清华大学' }] },
    createdAt
  })
  insertStructuredFieldCandidate({
    db,
    candidateId,
    fileId: input.fileId,
    jobId,
    fieldType: 'education',
    fieldKey: 'school_name',
    fieldValue: { value: '清华大学' },
    documentType: 'transcript',
    confidence: 0.97,
    riskLevel: 'high',
    sourcePage: 1,
    status: 'pending',
    createdAt
  })

  queueStructuredFieldCandidate(db, {
    candidateId,
    fieldKey: 'school_name',
    confidence: 0.97
  })

  return { id: candidateId }
}

export function seedE2EGroupPortraitFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existing = db.prepare(
    `select id
     from enrichment_jobs
     where file_id = ? and input_hash = ?
     limit 1`
  ).get(input.fileId, 'e2e-group-portrait') as { id: string } | undefined

  if (existing) {
    return existing
  }

  const anchorCanonicalPersonId = loadLinkedCanonicalPersonId(db, input.fileId)
  if (!anchorCanonicalPersonId) {
    throw new Error(`Group portrait fixture could not resolve anchor person for file: ${input.fileId}`)
  }

  const file = loadFixtureFile(db, input.fileId)
  if (!file || !file.batchId) {
    throw new Error(`Fixture file not found for group portrait seed: ${input.fileId}`)
  }

  const createdAt = new Date().toISOString()
  const bobAnchorPersonId = crypto.randomUUID()
  const bobCanonicalPersonId = crypto.randomUUID()
  const bobFileOneId = crypto.randomUUID()
  const bobFileTwoId = crypto.randomUUID()
  const jobOneId = crypto.randomUUID()
  const jobTwoId = crypto.randomUUID()
  const candidateOneId = crypto.randomUUID()
  const candidateTwoId = crypto.randomUUID()
  const queueItemOneId = crypto.randomUUID()
  const queueItemTwoId = crypto.randomUUID()
  const journalId = 'journal-group-1'

  db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run(
    bobAnchorPersonId,
    'Bob Li',
    'chat_participant',
    1,
    createdAt
  )

  db.prepare(
    'insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    bobCanonicalPersonId,
    'Bob Li',
    'bob li',
    1,
    createdAt,
    createdAt,
    1,
    '[]',
    'approved',
    createdAt,
    createdAt
  )

  db.prepare(
    'insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    bobCanonicalPersonId,
    bobAnchorPersonId,
    'active',
    createdAt,
    createdAt
  )

  db.prepare(
    'insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    bobAnchorPersonId,
    'person',
    input.fileId,
    'file',
    'mentioned_in_file',
    1,
    createdAt
  )

  db.prepare(
    'insert into canonical_relationship_labels (id, from_person_id, to_person_id, label, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    anchorCanonicalPersonId,
    bobCanonicalPersonId,
    'friend',
    'approved',
    createdAt,
    createdAt
  )

  db.prepare(
    'insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    'Trip planning',
    '2026-03-13T08:00:00.000Z',
    '2026-03-13T08:30:00.000Z',
    'shared planning',
    'approved',
    null,
    createdAt,
    createdAt
  )

  const eventClusterId = db.prepare(
    `select id
     from event_clusters
     where title = ? and status = 'approved'
     order by created_at desc
     limit 1`
  ).get('Trip planning') as { id: string }

  db.prepare(
    'insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), eventClusterId.id, anchorCanonicalPersonId, createdAt)
  db.prepare(
    'insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), eventClusterId.id, bobCanonicalPersonId, createdAt)
  db.prepare(
    'insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), eventClusterId.id, input.fileId, createdAt)

  for (const [fileId, fileName, hash] of [
    [bobFileOneId, 'bob-transcript-1.pdf', 'e2e-group-portrait-file-1'],
    [bobFileTwoId, 'bob-transcript-2.pdf', 'e2e-group-portrait-file-2']
  ]) {
    db.prepare(
      'insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      fileId,
      file.batchId,
      `/tmp/${fileName}`,
      `/tmp/${fileName}`,
      fileName,
      '.pdf',
      'application/pdf',
      1,
      hash,
      'unique',
      'parsed',
      createdAt
    )

    db.prepare(
      'insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      bobAnchorPersonId,
      'person',
      fileId,
      'file',
      'mentioned_in_file',
      1,
      createdAt
    )
  }

  for (const [jobId, fileId, inputHash, value, candidateId, queueItemId, confidence] of [
    [jobOneId, bobFileOneId, 'e2e-group-portrait-job-1', '北京大学', candidateOneId, queueItemOneId, 0.99],
    [jobTwoId, bobFileTwoId, 'e2e-group-portrait-job-2', '清华大学', candidateTwoId, queueItemTwoId, 0.98]
  ] as const) {
    insertFixtureEnrichmentJob({
      db,
      jobId,
      fileId,
      enhancerType: 'document_ocr',
      provider: 'fixture',
      model: 'fixture-group-portrait',
      status: 'completed',
      attemptCount: 1,
      inputHash,
      createdAt
    })

    insertStructuredFieldCandidate({
      db,
      candidateId,
      fileId,
      jobId,
      fieldType: 'education',
      fieldKey: 'school_name',
      fieldValue: { value },
      documentType: 'transcript',
      confidence,
      riskLevel: 'high',
      sourcePage: 1,
      status: 'pending',
      createdAt
    })

    db.prepare(
      'insert into review_queue (id, item_type, candidate_id, status, priority, confidence, summary_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      queueItemId,
      'structured_field_candidate',
      candidateId,
      'pending',
      0,
      confidence,
      JSON.stringify({ fieldKey: 'school_name' }),
      createdAt
    )
  }

  db.prepare(
    `insert into decision_journal (
      id, decision_type, target_type, target_id,
      operation_payload_json, undo_payload_json, actor, created_at, undone_at, undone_by
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    journalId,
    'approve_safe_review_group',
    'decision_batch',
    'batch-group-1',
    JSON.stringify({
      canonicalPersonId: bobCanonicalPersonId,
      canonicalPersonName: 'Bob Li',
      fieldKey: 'school_name',
      itemCount: 2
    }),
    JSON.stringify({
      batchId: 'batch-group-1',
      memberJournalIds: ['member-journal-1', 'member-journal-2']
    }),
    'reviewer',
    createdAt,
    null,
    null
  )

  insertFixtureEnrichmentJob({
    db,
    jobId: crypto.randomUUID(),
    fileId: input.fileId,
    enhancerType: 'group_portrait_fixture',
    provider: 'fixture',
    model: 'fixture-group-portrait-anchor',
    status: 'completed',
    attemptCount: 1,
    inputHash: 'e2e-group-portrait',
    createdAt
  })

  return { id: bobCanonicalPersonId }
}

export function seedE2ESafeBatchFixture(db: ArchiveDatabase, input: { fileId: string }) {
  const existingCount = db.prepare(
    `select count(*) as count
     from profile_attribute_candidates
     where source_file_id = ?
       and attribute_key = ?
       and reason_code = ?`
  ).get(input.fileId, 'school_name', 'e2e_safe_batch') as { count: number }

  if (existingCount.count >= 2) {
    return { count: existingCount.count }
  }

  const canonicalPersonId = loadLinkedCanonicalPersonId(db, input.fileId)
  if (!canonicalPersonId) {
    throw new Error(`Safe batch fixture could not resolve canonical person for file: ${input.fileId}`)
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()

  insertFixtureEnrichmentJob({
    db,
    jobId,
    fileId: input.fileId,
    enhancerType: 'profile_projection',
    provider: 'fixture',
    model: 'fixture-safe-batch',
    status: 'completed',
    attemptCount: 1,
    inputHash: 'e2e-safe-batch',
    createdAt
  })

  for (const suffix of ['1', '2']) {
    const evidenceId = crypto.randomUUID()
    db.prepare(
      `insert into enriched_evidence (
        id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evidenceId,
      input.fileId,
      jobId,
      'approved_structured_field',
      JSON.stringify({ fieldKey: 'school_name', value: '北京大学', fixture: true, ordinal: suffix }),
      'low',
      'approved',
      createdAt,
      createdAt
    )

    queueProfileAttributeCandidate(db, {
      proposedCanonicalPersonId: canonicalPersonId,
      sourceFileId: input.fileId,
      sourceEvidenceId: evidenceId,
      sourceCandidateId: null,
      attributeGroup: 'education',
      attributeKey: 'school_name',
      valueJson: JSON.stringify({ value: '北京大学' }),
      proposalBasis: {
        matchedRule: 'e2e_safe_batch',
        fixture: true,
        ordinal: suffix
      },
      reasonCode: 'e2e_safe_batch',
      confidence: 0.99
    })
  }

  return { count: 2 }
}
