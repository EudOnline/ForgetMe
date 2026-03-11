import type {
  DecisionJournalEntry,
  ProfileAttributeCandidate,
  ReviewEvidenceTrace,
  ReviewQueueItem,
  StructuredFieldCandidate
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type QueueItemRow = ReviewQueueItem & {
  candidateId: string
}

type StructuredCandidateRow = StructuredFieldCandidate & {
  approvedJournalId: string | null
}

type ProfileCandidateRow = ProfileAttributeCandidate & {
  approvedJournalId: string | null
  sourceFileId: string | null
  sourceEvidenceId: string | null
  sourceCandidateId: string | null
}

type SourceCandidateLookup = {
  candidateId: string
  candidateType: 'structured_field_candidate' | 'profile_attribute_candidate'
  status: string
  approvedJournalId: string | null
  fileId: string | null
}

function collectStringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringLeaves(entry))
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((entry) => collectStringLeaves(entry))
  }

  return []
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function displayValueFromJson(valueJson: string) {
  return collectStringLeaves(parseJson<unknown>(valueJson, valueJson))[0] ?? valueJson
}

function loadQueueItem(db: ArchiveDatabase, queueItemId: string): QueueItemRow {
  const row = db.prepare(
    `select
      id,
      item_type as itemType,
      candidate_id as candidateId,
      status,
      priority,
      confidence,
      summary_json as summaryJson,
      created_at as createdAt,
      reviewed_at as reviewedAt
     from review_queue
     where id = ?`
  ).get(queueItemId) as {
    id: string
    itemType: string
    candidateId: string
    status: string
    priority: number
    confidence: number
    summaryJson: string
    createdAt: string
    reviewedAt: string | null
  } | undefined

  if (!row) {
    throw new Error(`Review queue item not found: ${queueItemId}`)
  }

  return {
    id: row.id,
    itemType: row.itemType,
    candidateId: row.candidateId,
    status: row.status,
    priority: row.priority,
    confidence: row.confidence,
    summary: parseJson<Record<string, unknown>>(row.summaryJson, {}),
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt
  }
}

function loadStructuredCandidate(db: ArchiveDatabase, candidateId: string, queueItemId: string): StructuredCandidateRow {
  const row = db.prepare(
    `select
      id,
      file_id as fileId,
      job_id as jobId,
      field_type as fieldType,
      field_key as fieldKey,
      field_value_json as fieldValueJson,
      document_type as documentType,
      confidence,
      risk_level as riskLevel,
      source_page as sourcePage,
      status,
      created_at as createdAt,
      reviewed_at as reviewedAt,
      review_note as reviewNote,
      approved_journal_id as approvedJournalId
     from structured_field_candidates
     where id = ?`
  ).get(candidateId) as {
    id: string
    fileId: string
    jobId: string
    fieldType: string
    fieldKey: string
    fieldValueJson: string
    documentType: string
    confidence: number
    riskLevel: string
    sourcePage: number | null
    status: string
    createdAt: string
    reviewedAt: string | null
    reviewNote: string | null
    approvedJournalId: string | null
  } | undefined

  if (!row) {
    throw new Error(`Structured field candidate not found: ${candidateId}`)
  }

  return {
    id: row.id,
    fileId: row.fileId,
    jobId: row.jobId,
    fieldType: row.fieldType,
    fieldKey: row.fieldKey,
    fieldValue: displayValueFromJson(row.fieldValueJson),
    documentType: row.documentType,
    confidence: row.confidence,
    riskLevel: row.riskLevel,
    sourcePage: row.sourcePage,
    status: row.status,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    queueItemId,
    approvedJournalId: row.approvedJournalId
  }
}

function loadProfileCandidate(db: ArchiveDatabase, candidateId: string, queueItemId: string): ProfileCandidateRow {
  const row = db.prepare(
    `select
      id,
      proposed_canonical_person_id as proposedCanonicalPersonId,
      source_file_id as sourceFileId,
      source_evidence_id as sourceEvidenceId,
      source_candidate_id as sourceCandidateId,
      attribute_group as attributeGroup,
      attribute_key as attributeKey,
      value_json as valueJson,
      proposal_basis_json as proposalBasisJson,
      reason_code as reasonCode,
      confidence,
      status,
      created_at as createdAt,
      reviewed_at as reviewedAt,
      review_note as reviewNote,
      approved_journal_id as approvedJournalId
     from profile_attribute_candidates
     where id = ?`
  ).get(candidateId) as {
    id: string
    proposedCanonicalPersonId: string | null
    sourceFileId: string | null
    sourceEvidenceId: string | null
    sourceCandidateId: string | null
    attributeGroup: string
    attributeKey: string
    valueJson: string
    proposalBasisJson: string
    reasonCode: string
    confidence: number
    status: string
    createdAt: string
    reviewedAt: string | null
    reviewNote: string | null
    approvedJournalId: string | null
  } | undefined

  if (!row) {
    throw new Error(`Profile attribute candidate not found: ${candidateId}`)
  }

  return {
    id: row.id,
    proposedCanonicalPersonId: row.proposedCanonicalPersonId,
    sourceFileId: row.sourceFileId,
    sourceEvidenceId: row.sourceEvidenceId,
    sourceCandidateId: row.sourceCandidateId,
    attributeGroup: row.attributeGroup,
    attributeKey: row.attributeKey,
    valueJson: row.valueJson,
    displayValue: displayValueFromJson(row.valueJson),
    proposalBasis: parseJson<Record<string, unknown>>(row.proposalBasisJson, {}),
    reasonCode: row.reasonCode,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    approvedJournalId: row.approvedJournalId,
    queueItemId
  }
}

function loadFileContext(db: ArchiveDatabase, fileId: string | null) {
  if (!fileId) {
    return null
  }

  const row = db.prepare(
    `select
      id as fileId,
      file_name as fileName,
      batch_id as batchId,
      extension as fileKind
     from vault_files
     where id = ?`
  ).get(fileId) as {
    fileId: string
    fileName: string
    batchId: string | null
    fileKind: string | null
  } | undefined

  return row ?? null
}

function loadEvidenceContext(db: ArchiveDatabase, evidenceId: string | null) {
  if (!evidenceId) {
    return null
  }

  const row = db.prepare(
    `select
      id as evidenceId,
      evidence_type as evidenceType,
      status,
      risk_level as riskLevel,
      payload_json as payloadJson,
      file_id as fileId,
      job_id as jobId
     from enriched_evidence
     where id = ?`
  ).get(evidenceId) as {
    evidenceId: string
    evidenceType: string
    status: string
    riskLevel: string
    payloadJson: string
    fileId: string
    jobId: string | null
  } | undefined

  return row ?? null
}

function loadSourceCandidate(db: ArchiveDatabase, sourceCandidateId: string | null): SourceCandidateLookup | null {
  if (!sourceCandidateId) {
    return null
  }

  const structured = db.prepare(
    `select
      id as candidateId,
      status,
      approved_journal_id as approvedJournalId,
      file_id as fileId
     from structured_field_candidates
     where id = ?`
  ).get(sourceCandidateId) as {
    candidateId: string
    status: string
    approvedJournalId: string | null
    fileId: string
  } | undefined

  if (structured) {
    return {
      candidateId: structured.candidateId,
      candidateType: 'structured_field_candidate',
      status: structured.status,
      approvedJournalId: structured.approvedJournalId,
      fileId: structured.fileId
    }
  }

  const profile = db.prepare(
    `select
      id as candidateId,
      status,
      approved_journal_id as approvedJournalId,
      source_file_id as fileId
     from profile_attribute_candidates
     where id = ?`
  ).get(sourceCandidateId) as {
    candidateId: string
    status: string
    approvedJournalId: string | null
    fileId: string | null
  } | undefined

  if (!profile) {
    return null
  }

  return {
    candidateId: profile.candidateId,
    candidateType: 'profile_attribute_candidate',
    status: profile.status,
    approvedJournalId: profile.approvedJournalId,
    fileId: profile.fileId
  }
}

function mapDecisionJournal(row: {
  id: string
  decisionType: string
  targetType: string
  targetId: string
  operationPayloadJson: string
  undoPayloadJson: string
  actor: string
  createdAt: string
  undoneAt: string | null
  undoneBy: string | null
}): DecisionJournalEntry {
  return {
    id: row.id,
    decisionType: row.decisionType,
    targetType: row.targetType,
    targetId: row.targetId,
    operationPayload: parseJson<Record<string, unknown>>(row.operationPayloadJson, {}),
    undoPayload: parseJson<Record<string, unknown>>(row.undoPayloadJson, {}),
    actor: row.actor,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
    undoneBy: row.undoneBy
  }
}

function loadDecisionJournalById(db: ArchiveDatabase, journalId: string | null) {
  if (!journalId) {
    return null
  }

  const row = db.prepare(
    `select
      id,
      decision_type as decisionType,
      target_type as targetType,
      target_id as targetId,
      operation_payload_json as operationPayloadJson,
      undo_payload_json as undoPayloadJson,
      actor,
      created_at as createdAt,
      undone_at as undoneAt,
      undone_by as undoneBy
     from decision_journal
     where id = ?`
  ).get(journalId) as {
    id: string
    decisionType: string
    targetType: string
    targetId: string
    operationPayloadJson: string
    undoPayloadJson: string
    actor: string
    createdAt: string
    undoneAt: string | null
    undoneBy: string | null
  } | undefined

  return row ? mapDecisionJournal(row) : null
}

function loadLatestDecisionJournal(db: ArchiveDatabase, targetType: string, targetId: string) {
  const row = db.prepare(
    `select
      id,
      decision_type as decisionType,
      target_type as targetType,
      target_id as targetId,
      operation_payload_json as operationPayloadJson,
      undo_payload_json as undoPayloadJson,
      actor,
      created_at as createdAt,
      undone_at as undoneAt,
      undone_by as undoneBy
     from decision_journal
     where target_type = ? and target_id = ?
     order by created_at desc
     limit 1`
  ).get(targetType, targetId) as {
    id: string
    decisionType: string
    targetType: string
    targetId: string
    operationPayloadJson: string
    undoPayloadJson: string
    actor: string
    createdAt: string
    undoneAt: string | null
    undoneBy: string | null
  } | undefined

  return row ? mapDecisionJournal(row) : null
}

function firstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function resolveEvidenceIdFromJournal(journal: DecisionJournalEntry | null) {
  if (!journal) {
    return null
  }

  return firstString(journal.undoPayload.evidenceId, journal.operationPayload.evidenceId)
}

function resolveJournalForSourceCandidate(db: ArchiveDatabase, sourceCandidate: SourceCandidateLookup | null) {
  if (!sourceCandidate) {
    return null
  }

  return loadDecisionJournalById(db, sourceCandidate.approvedJournalId)
    ?? loadLatestDecisionJournal(db, sourceCandidate.candidateType, sourceCandidate.candidateId)
}

export function getReviewEvidenceTrace(db: ArchiveDatabase, input: { queueItemId: string }): ReviewEvidenceTrace {
  const queueItem = loadQueueItem(db, input.queueItemId)

  if (queueItem.itemType === 'structured_field_candidate') {
    const candidate = loadStructuredCandidate(db, queueItem.candidateId, queueItem.id)
    const sourceJournal = loadDecisionJournalById(db, candidate.approvedJournalId)
      ?? loadLatestDecisionJournal(db, 'structured_field_candidate', candidate.id)
    const evidenceId = resolveEvidenceIdFromJournal(sourceJournal)

    return {
      queueItem,
      candidate,
      sourceFile: loadFileContext(db, candidate.fileId),
      sourceEvidence: loadEvidenceContext(db, evidenceId),
      sourceCandidate: null,
      sourceJournal
    }
  }

  const candidate = loadProfileCandidate(db, queueItem.candidateId, queueItem.id)
  const sourceCandidate = loadSourceCandidate(db, candidate.sourceCandidateId)
  const sourceJournal = resolveJournalForSourceCandidate(db, sourceCandidate)
    ?? loadDecisionJournalById(db, candidate.approvedJournalId)
    ?? loadLatestDecisionJournal(db, 'profile_attribute_candidate', candidate.id)
  const sourceEvidence = loadEvidenceContext(db, candidate.sourceEvidenceId)
  const sourceFileId = candidate.sourceFileId ?? sourceEvidence?.fileId ?? sourceCandidate?.fileId ?? null

  return {
    queueItem,
    candidate,
    sourceFile: loadFileContext(db, sourceFileId),
    sourceEvidence,
    sourceCandidate: sourceCandidate
      ? {
          candidateId: sourceCandidate.candidateId,
          candidateType: sourceCandidate.candidateType,
          status: sourceCandidate.status
        }
      : null,
    sourceJournal
  }
}
