import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { chooseCanonicalPersonName } from './canonicalPeopleService'
import { approveStructuredFieldCandidate, rejectStructuredFieldCandidate, undoStructuredFieldDecision } from './enrichmentReviewService'
import { appendDecisionJournal, listDecisionJournal, markDecisionUndone } from './journalService'
import { approveProfileAttributeCandidate, rejectProfileAttributeCandidate, undoProfileAttributeDecision } from './profileCandidateReviewService'

type ReviewQueueItemRow = {
  id: string
  itemType: string
  candidateId: string
  status: string
  confidence: number
  summaryJson: string
}

type DecisionJournalRow = {
  id: string
  targetType: string
  targetId: string
  undoPayloadJson: string
  undoneAt: string | null
}

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

function approveMergeCandidate(db: ArchiveDatabase, queueItem: ReviewQueueItemRow, actor: string) {
  const candidate = db.prepare(
    `select
      id,
      left_canonical_person_id as leftCanonicalPersonId,
      right_canonical_person_id as rightCanonicalPersonId,
      status
    from person_merge_candidates
    where id = ?`
  ).get(queueItem.candidateId) as {
    id: string
    leftCanonicalPersonId: string
    rightCanonicalPersonId: string
    status: string
  } | undefined

  if (!candidate) {
    throw new Error(`Merge candidate not found: ${queueItem.candidateId}`)
  }

  const canonicalPeople = db.prepare(
    `select id, primary_display_name as displayName
     from canonical_people
     where id in (?, ?)`
  ).all(candidate.leftCanonicalPersonId, candidate.rightCanonicalPersonId) as Array<{
    id: string
    displayName: string
  }>
  const leftCanonical = canonicalPeople.find((person) => person.id === candidate.leftCanonicalPersonId)
  const rightCanonical = canonicalPeople.find((person) => person.id === candidate.rightCanonicalPersonId)

  if (!leftCanonical || !rightCanonical) {
    throw new Error(`Canonical people missing for merge candidate: ${candidate.id}`)
  }

  const preferredDisplayName = chooseCanonicalPersonName([
    { displayName: leftCanonical.displayName, sourceType: 'candidate', confidence: 1 },
    { displayName: rightCanonical.displayName, sourceType: 'candidate', confidence: 1 }
  ])
  const primaryCanonicalPersonId = preferredDisplayName === rightCanonical.displayName && preferredDisplayName !== leftCanonical.displayName
    ? candidate.rightCanonicalPersonId
    : candidate.leftCanonicalPersonId
  const secondaryCanonicalPersonId = primaryCanonicalPersonId === candidate.leftCanonicalPersonId
    ? candidate.rightCanonicalPersonId
    : candidate.leftCanonicalPersonId

  const membershipRows = db.prepare(
    `select
      id,
      anchor_person_id as anchorPersonId,
      status
    from person_memberships
    where canonical_person_id = ? and status = ?`
  ).all(secondaryCanonicalPersonId, 'active') as Array<{
    id: string
    anchorPersonId: string
    status: string
  }>
  const createdAt = new Date().toISOString()
  const insertedMemberships = membershipRows.map((membership) => ({
    id: crypto.randomUUID(),
    anchorPersonId: membership.anchorPersonId
  }))

  for (const membership of insertedMemberships) {
    db.prepare(
      `insert into person_memberships (
        id, canonical_person_id, anchor_person_id, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?)`
    ).run(
      membership.id,
      primaryCanonicalPersonId,
      membership.anchorPersonId,
      'active',
      createdAt,
      createdAt
    )
  }

  db.prepare('update person_memberships set status = ?, updated_at = ? where canonical_person_id = ? and status = ?').run(
    'merged',
    createdAt,
    secondaryCanonicalPersonId,
    'active'
  )
  db.prepare('update canonical_people set status = ?, updated_at = ? where id = ?').run('merged', createdAt, secondaryCanonicalPersonId)
  db.prepare('update person_merge_candidates set status = ?, reviewed_at = ? where id = ?').run('approved', createdAt, candidate.id)
  db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('approved', createdAt, queueItem.id)

  const journal = appendDecisionJournal(db, {
    decisionType: 'approve_merge_candidate',
    targetType: 'person_merge_candidate',
    targetId: candidate.id,
    operationPayload: {
      queueItemId: queueItem.id,
      leftCanonicalPersonId: candidate.leftCanonicalPersonId,
      rightCanonicalPersonId: candidate.rightCanonicalPersonId
    },
    undoPayload: {
      queueItemId: queueItem.id,
      candidateId: candidate.id,
      rightCanonicalPersonId: secondaryCanonicalPersonId,
      previousRightStatus: 'approved',
      reactivatedMembershipIds: membershipRows.map((membership) => membership.id),
      insertedMembershipIds: insertedMemberships.map((membership) => membership.id)
    },
    actor
  })

  db.prepare('update person_merge_candidates set approved_journal_id = ? where id = ?').run(journal.journalId, candidate.id)

  return { status: 'approved' as const, journalId: journal.journalId, queueItemId: queueItem.id, candidateId: candidate.id }
}

function approveEventClusterCandidate(db: ArchiveDatabase, queueItem: ReviewQueueItemRow, actor: string) {
  const candidate = db.prepare(
    `select
      id,
      proposed_title as proposedTitle,
      time_start as timeStart,
      time_end as timeEnd,
      supporting_evidence_json as supportingEvidenceJson
    from event_cluster_candidates
    where id = ?`
  ).get(queueItem.candidateId) as {
    id: string
    proposedTitle: string
    timeStart: string
    timeEnd: string
    supportingEvidenceJson: string
  } | undefined

  if (!candidate) {
    throw new Error(`Event cluster candidate not found: ${queueItem.candidateId}`)
  }

  const supportingEvidence = JSON.parse(candidate.supportingEvidenceJson) as {
    evidenceFileIds?: string[]
    canonicalPersonIds?: string[]
  }
  const createdAt = new Date().toISOString()
  const eventClusterId = crypto.randomUUID()
  const memberRows = (supportingEvidence.canonicalPersonIds ?? []).map((canonicalPersonId) => ({
    id: crypto.randomUUID(),
    canonicalPersonId
  }))
  const evidenceRows = (supportingEvidence.evidenceFileIds ?? []).map((fileId) => ({
    id: crypto.randomUUID(),
    fileId
  }))

  db.prepare(
    `insert into event_clusters (
      id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(eventClusterId, candidate.proposedTitle, candidate.timeStart, candidate.timeEnd, null, 'approved', candidate.id, createdAt, createdAt)

  for (const member of memberRows) {
    db.prepare(
      'insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)'
    ).run(member.id, eventClusterId, member.canonicalPersonId, createdAt)
  }

  for (const evidence of evidenceRows) {
    db.prepare(
      'insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)'
    ).run(evidence.id, eventClusterId, evidence.fileId, createdAt)
  }

  db.prepare('update event_cluster_candidates set status = ?, reviewed_at = ? where id = ?').run('approved', createdAt, candidate.id)
  db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('approved', createdAt, queueItem.id)

  const journal = appendDecisionJournal(db, {
    decisionType: 'approve_event_cluster_candidate',
    targetType: 'event_cluster_candidate',
    targetId: candidate.id,
    operationPayload: {
      queueItemId: queueItem.id,
      eventClusterId
    },
    undoPayload: {
      queueItemId: queueItem.id,
      candidateId: candidate.id,
      eventClusterId,
      memberRowIds: memberRows.map((member) => member.id),
      evidenceRowIds: evidenceRows.map((evidence) => evidence.id)
    },
    actor
  })

  db.prepare('update event_cluster_candidates set approved_journal_id = ? where id = ?').run(journal.journalId, candidate.id)

  return { status: 'approved' as const, journalId: journal.journalId, queueItemId: queueItem.id, candidateId: candidate.id }
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
    return undoProfileAttributeDecision(db, input)
  }

  return inTransaction(db, () => {
    const undoPayload = JSON.parse(journal.undoPayloadJson) as {
      queueItemId?: string
      candidateId?: string
      rightCanonicalPersonId?: string
      previousRightStatus?: string
      reactivatedMembershipIds?: string[]
      insertedMembershipIds?: string[]
      eventClusterId?: string
      memberRowIds?: string[]
      evidenceRowIds?: string[]
    }

    if (journal.targetType === 'person_merge_candidate') {
      for (const membershipId of undoPayload.insertedMembershipIds ?? []) {
        db.prepare('delete from person_memberships where id = ?').run(membershipId)
      }

      if ((undoPayload.reactivatedMembershipIds ?? []).length > 0) {
        const placeholders = (undoPayload.reactivatedMembershipIds ?? []).map(() => '?').join(', ')
        db.prepare(
          `update person_memberships set status = ?, updated_at = ? where id in (${placeholders})`
        ).run('active', new Date().toISOString(), ...(undoPayload.reactivatedMembershipIds ?? []))
      }

      if (undoPayload.rightCanonicalPersonId) {
        db.prepare('update canonical_people set status = ?, updated_at = ? where id = ?').run(
          undoPayload.previousRightStatus ?? 'approved',
          new Date().toISOString(),
          undoPayload.rightCanonicalPersonId
        )
      }

      if (undoPayload.candidateId) {
        db.prepare('update person_merge_candidates set status = ? where id = ?').run('undone', undoPayload.candidateId)
      }
    } else if (journal.targetType === 'event_cluster_candidate') {
      for (const rowId of undoPayload.memberRowIds ?? []) {
        db.prepare('delete from event_cluster_members where id = ?').run(rowId)
      }
      for (const rowId of undoPayload.evidenceRowIds ?? []) {
        db.prepare('delete from event_cluster_evidence where id = ?').run(rowId)
      }
      if (undoPayload.eventClusterId) {
        db.prepare('delete from event_clusters where id = ?').run(undoPayload.eventClusterId)
      }
      if (undoPayload.candidateId) {
        db.prepare('update event_cluster_candidates set status = ? where id = ?').run('undone', undoPayload.candidateId)
      }
    } else {
      throw new Error(`Unsupported journal target type: ${journal.targetType}`)
    }

    if (undoPayload.queueItemId) {
      db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('undone', new Date().toISOString(), undoPayload.queueItemId)
    }

    markDecisionUndone(db, { journalId: input.journalId, actor: input.actor })

    return { status: 'undone' as const, journalId: input.journalId }
  })
}

export { listDecisionJournal }
