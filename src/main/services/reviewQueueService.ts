import type { ArchiveDatabase } from './db'
import { approveStructuredFieldCandidate, rejectStructuredFieldCandidate, undoStructuredFieldDecision } from './enrichmentReviewService'
import { appendDecisionJournal, listDecisionJournal } from './journalService'
import { approveProfileAttributeCandidate, rejectProfileAttributeCandidate, undoProfileAttributeDecisionInTransaction } from './profileCandidateReviewService'
import {
  approveEventClusterCandidate,
  approveMergeCandidate,
  approveSafeReviewGroupInTransaction,
  syncDecisionBatchStatusForMemberJournal,
  type DecisionJournalRow,
  type ReviewQueueItemRow,
  undoReviewDecisionInTransaction
} from './reviewQueueDecisionService'

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

function getReviewQueueItem(db: ArchiveDatabase, queueItemId: string) {
  const item = db.prepare(
    `select
      id,
      item_type as itemType,
      candidate_id as candidateId,
      status,
      confidence,
      summary_json as summaryJson
    from review_queue
    where id = ?`
  ).get(queueItemId) as ReviewQueueItemRow | undefined

  if (!item) {
    throw new Error(`Review queue item not found: ${queueItemId}`)
  }

  return item
}
export function approveSafeReviewGroup(db: ArchiveDatabase, input: { groupKey: string; actor: string }) {
  return inTransaction(db, () => approveSafeReviewGroupInTransaction(db, input))
}

export function listReviewQueue(db: ArchiveDatabase, input?: { status?: string }) {
  const rows = db.prepare(
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
    where (? is null or status = ?)
    order by created_at asc`
  ).all(input?.status ?? null, input?.status ?? null) as Array<{
    id: string
    itemType: string
    candidateId: string
    status: string
    priority: number
    confidence: number
    summaryJson: string
    createdAt: string
    reviewedAt: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    itemType: row.itemType,
    candidateId: row.candidateId,
    status: row.status,
    priority: row.priority,
    confidence: row.confidence,
    summary: JSON.parse(row.summaryJson),
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt
  }))
}

export function approveReviewItem(db: ArchiveDatabase, input: { queueItemId: string; actor: string }) {
  const queueItem = getReviewQueueItem(db, input.queueItemId)
  if (queueItem.itemType === 'structured_field_candidate') {
    return approveStructuredFieldCandidate(db, input)
  }
  if (queueItem.itemType === 'profile_attribute_candidate') {
    return approveProfileAttributeCandidate(db, input)
  }

  return inTransaction(db, () => {
    if (queueItem.status !== 'pending') {
      throw new Error(`Review queue item is not pending: ${input.queueItemId}`)
    }

    if (queueItem.itemType === 'person_merge_candidate') {
      return approveMergeCandidate(db, queueItem, input.actor)
    }

    if (queueItem.itemType === 'event_cluster_candidate') {
      return approveEventClusterCandidate(db, queueItem, input.actor)
    }

    throw new Error(`Unsupported review item type: ${queueItem.itemType}`)
  })
}

export function rejectReviewItem(db: ArchiveDatabase, input: { queueItemId: string; actor: string; note?: string }) {
  const queueItem = getReviewQueueItem(db, input.queueItemId)
  if (queueItem.itemType === 'structured_field_candidate') {
    return rejectStructuredFieldCandidate(db, input)
  }
  if (queueItem.itemType === 'profile_attribute_candidate') {
    return rejectProfileAttributeCandidate(db, input)
  }

  return inTransaction(db, () => {
    const reviewedAt = new Date().toISOString()

    if (queueItem.itemType === 'person_merge_candidate') {
      db.prepare('update person_merge_candidates set status = ?, reviewed_at = ?, review_note = ? where id = ?').run(
        'rejected',
        reviewedAt,
        input.note ?? null,
        queueItem.candidateId
      )
    } else if (queueItem.itemType === 'event_cluster_candidate') {
      db.prepare('update event_cluster_candidates set status = ?, reviewed_at = ?, review_note = ? where id = ?').run(
        'rejected',
        reviewedAt,
        input.note ?? null,
        queueItem.candidateId
      )
    } else {
      throw new Error(`Unsupported review item type: ${queueItem.itemType}`)
    }

    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('rejected', reviewedAt, queueItem.id)
    const journal = appendDecisionJournal(db, {
      decisionType: 'reject_review_item',
      targetType: queueItem.itemType,
      targetId: queueItem.candidateId,
      operationPayload: {
        queueItemId: queueItem.id,
        note: input.note ?? null
      },
      undoPayload: {},
      actor: input.actor
    })

    return { status: 'rejected' as const, journalId: journal.journalId, queueItemId: queueItem.id, candidateId: queueItem.candidateId }
  })
}

export function undoDecision(db: ArchiveDatabase, input: { journalId: string; actor: string }) {
  const journal = db.prepare(
    `select
      id,
      target_type as targetType,
      target_id as targetId,
      undo_payload_json as undoPayloadJson,
      undone_at as undoneAt
    from decision_journal
    where id = ?`
  ).get(input.journalId) as DecisionJournalRow | undefined

  if (!journal) {
    throw new Error(`Decision journal not found: ${input.journalId}`)
  }
  if (journal.undoneAt) {
    throw new Error(`Decision already undone: ${input.journalId}`)
  }
  if (journal.targetType === 'structured_field_candidate') {
    return undoStructuredFieldDecision(db, input)
  }
  if (journal.targetType === 'profile_attribute_candidate') {
    return inTransaction(db, () => {
      const result = undoProfileAttributeDecisionInTransaction(db, input)
      syncDecisionBatchStatusForMemberJournal(db, input.journalId, input.actor)
      return result
    })
  }

  return inTransaction(db, () => undoReviewDecisionInTransaction(db, {
    journal,
    actor: input.actor
  }))
}

export { listDecisionJournal }
