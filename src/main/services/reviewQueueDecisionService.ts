import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { chooseCanonicalPersonName } from './canonicalPeopleService'
import { appendDecisionJournal, markDecisionUndone } from './journalService'
import {
  approveProfileAttributeCandidateInTransaction,
  undoProfileAttributeDecisionInTransaction
} from './profileCandidateReviewService'
import { listReviewConflictGroups, listReviewWorkbenchItems } from './reviewWorkbenchReadService'

export type ReviewQueueItemRow = {
  id: string
  itemType: string
  candidateId: string
  status: string
  confidence: number
  summaryJson: string
}

export type DecisionJournalRow = {
  id: string
  targetType: string
  targetId: string
  undoPayloadJson: string
  undoneAt: string | null
}

function toPersonKey(canonicalPersonId: string | null) {
  return canonicalPersonId ?? '__unassigned__'
}

function toConflictGroupKey(item: { canonicalPersonId: string | null; itemType: string; fieldKey: string | null }) {
  return `${toPersonKey(item.canonicalPersonId)}::${item.itemType}::${item.fieldKey ?? '__unkeyed__'}`
}

function updateDecisionBatchStatus(db: ArchiveDatabase, batchId: string, actor: string) {
  const memberRows = db.prepare(
    `select decision_journal_id as decisionJournalId
     from decision_batch_items
     where batch_id = ?
     order by ordinal asc`
  ).all(batchId) as Array<{
    decisionJournalId: string
  }>

  const unresolvedCount = memberRows.reduce((count, memberRow) => {
    const memberJournal = db.prepare(
      'select undone_at as undoneAt from decision_journal where id = ?'
    ).get(memberRow.decisionJournalId) as { undoneAt: string | null } | undefined

    return count + (memberJournal?.undoneAt ? 0 : 1)
  }, 0)

  const nextStatus = unresolvedCount === 0 ? 'undone' : 'partially_undone'
  db.prepare(
    `update decision_batches
     set status = ?, undone_at = ?, undone_by = ?
     where id = ?`
  ).run(nextStatus, new Date().toISOString(), actor, batchId)
}

export function syncDecisionBatchStatusForMemberJournal(db: ArchiveDatabase, memberJournalId: string, actor: string) {
  const rows = db.prepare(
    `select batch_id as batchId
     from decision_batch_items
     where decision_journal_id = ?`
  ).all(memberJournalId) as Array<{
    batchId: string
  }>

  for (const row of rows) {
    updateDecisionBatchStatus(db, row.batchId, actor)
  }
}

function getSafeProfileBatchGroup(db: ArchiveDatabase, groupKey: string) {
  const group = listReviewConflictGroups(db).find((candidateGroup) => candidateGroup.groupKey === groupKey)

  if (!group) {
    throw new Error(`Review conflict group not found: ${groupKey}`)
  }
  if (group.itemType !== 'profile_attribute_candidate') {
    throw new Error('This batch flow only supports profile attribute groups')
  }
  if (group.hasConflict) {
    throw new Error('This group is no longer safe for batch approval')
  }
  if (group.pendingCount < 2) {
    throw new Error('Safe batch approval requires at least 2 pending items')
  }

  const items = listReviewWorkbenchItems(db, { status: 'pending' })
    .filter((item) => toConflictGroupKey(item) === groupKey)

  if (items.length < 2) {
    throw new Error('Safe batch approval requires at least 2 pending items')
  }
  if (items.some((item) => item.itemType !== 'profile_attribute_candidate')) {
    throw new Error('This batch flow only supports profile attribute groups')
  }

  return { group, items }
}

export function approveMergeCandidate(db: ArchiveDatabase, queueItem: ReviewQueueItemRow, actor: string) {
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

export function approveEventClusterCandidate(db: ArchiveDatabase, queueItem: ReviewQueueItemRow, actor: string) {
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

export function approveSafeReviewGroupInTransaction(db: ArchiveDatabase, input: { groupKey: string; actor: string }) {
  const { group, items } = getSafeProfileBatchGroup(db, input.groupKey)
  const batchId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const memberJournalIds: string[] = []
  const queueItemIds: string[] = []

  db.prepare(
    `insert into decision_batches (
      id, batch_type, status, canonical_person_id, canonical_person_name_snapshot,
      item_type, field_key, item_count, journal_id, created_by, created_at, undone_at, undone_by
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    batchId,
    'safe_group_approve',
    'approved',
    group.canonicalPersonId,
    group.canonicalPersonName,
    group.itemType,
    group.fieldKey,
    items.length,
    null,
    input.actor,
    createdAt,
    null,
    null
  )

  items.forEach((item, index) => {
    const result = approveProfileAttributeCandidateInTransaction(db, {
      queueItemId: item.queueItemId,
      actor: input.actor
    })
    memberJournalIds.push(result.journalId)
    queueItemIds.push(result.queueItemId)

    db.prepare(
      `insert into decision_batch_items (
        id, batch_id, queue_item_id, decision_journal_id, ordinal, created_at
      ) values (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      batchId,
      result.queueItemId,
      result.journalId,
      index,
      createdAt
    )
  })

  const batchJournal = appendDecisionJournal(db, {
    decisionType: 'approve_safe_review_group',
    targetType: 'decision_batch',
    targetId: batchId,
    operationPayload: {
      batchId,
      groupKey: group.groupKey,
      itemCount: items.length,
      canonicalPersonId: group.canonicalPersonId,
      canonicalPersonName: group.canonicalPersonName,
      itemType: group.itemType,
      fieldKey: group.fieldKey,
      queueItemIds,
      memberJournalIds
    },
    undoPayload: {
      batchId,
      memberJournalIds
    },
    actor: input.actor
  })

  db.prepare('update decision_batches set journal_id = ? where id = ?').run(batchJournal.journalId, batchId)

  return {
    status: 'approved' as const,
    batchId,
    journalId: batchJournal.journalId,
    groupKey: group.groupKey,
    itemCount: items.length,
    canonicalPersonId: group.canonicalPersonId,
    canonicalPersonName: group.canonicalPersonName,
    itemType: group.itemType,
    fieldKey: group.fieldKey,
    queueItemIds
  }
}

export function undoReviewDecisionInTransaction(db: ArchiveDatabase, input: {
  journal: DecisionJournalRow
  actor: string
}) {
  const undoPayload = JSON.parse(input.journal.undoPayloadJson) as {
    queueItemId?: string
    candidateId?: string
    rightCanonicalPersonId?: string
    previousRightStatus?: string
    reactivatedMembershipIds?: string[]
    insertedMembershipIds?: string[]
    eventClusterId?: string
    memberRowIds?: string[]
    evidenceRowIds?: string[]
    batchId?: string
    memberJournalIds?: string[]
  }

  if (input.journal.targetType === 'person_merge_candidate') {
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
  } else if (input.journal.targetType === 'event_cluster_candidate') {
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
  } else if (input.journal.targetType === 'decision_batch') {
    const batchId = undoPayload.batchId ?? input.journal.targetId
    if (!batchId) {
      throw new Error(`Decision batch missing from journal: ${input.journal.id}`)
    }

    for (const memberJournalId of undoPayload.memberJournalIds ?? []) {
      const memberJournal = db.prepare(
        `select target_type as targetType, undone_at as undoneAt
         from decision_journal
         where id = ?`
      ).get(memberJournalId) as {
        targetType: string
        undoneAt: string | null
      } | undefined

      if (!memberJournal) {
        throw new Error(`Decision journal not found: ${memberJournalId}`)
      }
      if (memberJournal.undoneAt) {
        continue
      }
      if (memberJournal.targetType !== 'profile_attribute_candidate') {
        throw new Error(`Unsupported batch member target type: ${memberJournal.targetType}`)
      }

      undoProfileAttributeDecisionInTransaction(db, {
        journalId: memberJournalId,
        actor: input.actor
      })
    }

    updateDecisionBatchStatus(db, batchId, input.actor)
  } else {
    throw new Error(`Unsupported journal target type: ${input.journal.targetType}`)
  }

  if (undoPayload.queueItemId) {
    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('undone', new Date().toISOString(), undoPayload.queueItemId)
  }

  markDecisionUndone(db, { journalId: input.journal.id, actor: input.actor })

  return { status: 'undone' as const, journalId: input.journal.id }
}
