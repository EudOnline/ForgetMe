import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, markDecisionUndone } from './journalService'

function inTransaction<T>(db: ArchiveDatabase, callback: () => T) {
  db.exec('begin immediate')
  try {
    const result = callback()
    db.exec('commit')
    return result
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

function getQueueItem(db: ArchiveDatabase, queueItemId: string) {
  const item = db.prepare(
    `select id, item_type as itemType, candidate_id as candidateId, status, confidence
     from review_queue where id = ?`
  ).get(queueItemId) as {
    id: string
    itemType: string
    candidateId: string
    status: string
    confidence: number
  } | undefined

  if (!item) {
    throw new Error(`Review queue item not found: ${queueItemId}`)
  }

  return item
}

function getStructuredFieldCandidate(db: ArchiveDatabase, candidateId: string) {
  const candidate = db.prepare(
    `select
      id,
      file_id as fileId,
      job_id as jobId,
      field_type as fieldType,
      field_key as fieldKey,
      field_value_json as fieldValueJson,
      document_type as documentType,
      status
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
    status: string
  } | undefined

  if (!candidate) {
    throw new Error(`Structured field candidate not found: ${candidateId}`)
  }

  return candidate
}

export function queueStructuredFieldCandidate(db: ArchiveDatabase, input: {
  candidateId: string
  fieldKey: string
  confidence: number
}) {
  const existing = db.prepare(
    `select id, item_type as itemType, status from review_queue
     where candidate_id = ? and item_type = ? limit 1`
  ).get(input.candidateId, 'structured_field_candidate') as {
    id: string
    itemType: string
    status: string
  } | undefined

  if (existing) {
    return existing
  }

  const createdAt = new Date().toISOString()
  const queueItemId = crypto.randomUUID()
  db.prepare(
    `insert into review_queue (
      id, item_type, candidate_id, status, priority, confidence, summary_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    queueItemId,
    'structured_field_candidate',
    input.candidateId,
    'pending',
    0,
    input.confidence,
    JSON.stringify({ fieldKey: input.fieldKey }),
    createdAt
  )

  return {
    id: queueItemId,
    itemType: 'structured_field_candidate',
    status: 'pending'
  }
}

export function approveStructuredFieldCandidate(db: ArchiveDatabase, input: {
  queueItemId: string
  actor: string
}) {
  return inTransaction(db, () => {
    const queueItem = getQueueItem(db, input.queueItemId)
    const candidate = getStructuredFieldCandidate(db, queueItem.candidateId)
    const reviewedAt = new Date().toISOString()
    const evidenceId = crypto.randomUUID()

    db.prepare(
      `insert into enriched_evidence (
        id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evidenceId,
      candidate.fileId,
      candidate.jobId,
      'approved_structured_field',
      JSON.stringify({
        candidateId: candidate.id,
        fieldType: candidate.fieldType,
        fieldKey: candidate.fieldKey,
        fieldValue: JSON.parse(candidate.fieldValueJson),
        documentType: candidate.documentType
      }),
      'high',
      'approved',
      reviewedAt,
      reviewedAt
    )

    db.prepare('update structured_field_candidates set status = ?, reviewed_at = ? where id = ?').run('approved', reviewedAt, candidate.id)
    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('approved', reviewedAt, queueItem.id)

    const journal = appendDecisionJournal(db, {
      decisionType: 'approve_structured_field_candidate',
      targetType: 'structured_field_candidate',
      targetId: candidate.id,
      operationPayload: {
        queueItemId: queueItem.id,
        evidenceId
      },
      undoPayload: {
        queueItemId: queueItem.id,
        candidateId: candidate.id,
        evidenceId
      },
      actor: input.actor
    })

    db.prepare('update structured_field_candidates set approved_journal_id = ? where id = ?').run(journal.journalId, candidate.id)

    return {
      status: 'approved' as const,
      journalId: journal.journalId,
      queueItemId: queueItem.id,
      candidateId: candidate.id
    }
  })
}

export function rejectStructuredFieldCandidate(db: ArchiveDatabase, input: {
  queueItemId: string
  actor: string
  note?: string
}) {
  return inTransaction(db, () => {
    const queueItem = getQueueItem(db, input.queueItemId)
    const candidate = getStructuredFieldCandidate(db, queueItem.candidateId)
    const reviewedAt = new Date().toISOString()

    db.prepare('update structured_field_candidates set status = ?, reviewed_at = ?, review_note = ? where id = ?').run(
      'rejected',
      reviewedAt,
      input.note ?? null,
      candidate.id
    )
    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('rejected', reviewedAt, queueItem.id)

    const journal = appendDecisionJournal(db, {
      decisionType: 'reject_structured_field_candidate',
      targetType: 'structured_field_candidate',
      targetId: candidate.id,
      operationPayload: {
        queueItemId: queueItem.id,
        note: input.note ?? null
      },
      undoPayload: {},
      actor: input.actor
    })

    return {
      status: 'rejected' as const,
      journalId: journal.journalId,
      queueItemId: queueItem.id,
      candidateId: candidate.id
    }
  })
}

export function undoStructuredFieldDecision(db: ArchiveDatabase, input: {
  journalId: string
  actor: string
}) {
  return inTransaction(db, () => {
    const journal = db.prepare(
      `select id, target_id as targetId, undo_payload_json as undoPayloadJson, undone_at as undoneAt
       from decision_journal where id = ?`
    ).get(input.journalId) as {
      id: string
      targetId: string
      undoPayloadJson: string
      undoneAt: string | null
    } | undefined

    if (!journal) {
      throw new Error(`Decision journal not found: ${input.journalId}`)
    }
    if (journal.undoneAt) {
      throw new Error(`Decision already undone: ${input.journalId}`)
    }

    const undoPayload = JSON.parse(journal.undoPayloadJson) as {
      queueItemId?: string
      candidateId?: string
      evidenceId?: string
    }

    if (undoPayload.evidenceId) {
      db.prepare('delete from enriched_evidence where id = ?').run(undoPayload.evidenceId)
    }
    if (undoPayload.candidateId) {
      db.prepare('update structured_field_candidates set status = ? where id = ?').run('undone', undoPayload.candidateId)
    }
    if (undoPayload.queueItemId) {
      db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('undone', new Date().toISOString(), undoPayload.queueItemId)
    }

    markDecisionUndone(db, { journalId: input.journalId, actor: input.actor })

    return {
      status: 'undone' as const,
      journalId: input.journalId
    }
  })
}
