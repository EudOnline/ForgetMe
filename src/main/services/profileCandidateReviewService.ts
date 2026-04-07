import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, markDecisionUndone } from './journalService'
import { enqueuePersonAgentRefreshForCanonicalPeople } from './personAgentRefreshService'

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
    `select id, item_type as itemType, candidate_id as candidateId, status
     from review_queue where id = ?`
  ).get(queueItemId) as {
    id: string
    itemType: string
    candidateId: string
    status: string
  } | undefined

  if (!item) {
    throw new Error(`Review queue item not found: ${queueItemId}`)
  }

  return item
}

function getProfileCandidate(db: ArchiveDatabase, candidateId: string) {
  const candidate = db.prepare(
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
      confidence,
      status
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
    confidence: number
    status: string
  } | undefined

  if (!candidate) {
    throw new Error(`Profile attribute candidate not found: ${candidateId}`)
  }

  return candidate
}

function displayValueFromValueJson(valueJson: string) {
  try {
    const payload = JSON.parse(valueJson) as Record<string, unknown>
    if (typeof payload.value === 'string' && payload.value.trim().length > 0) {
      return payload.value.trim()
    }
  } catch {
    return valueJson
  }

  return valueJson
}

export function approveProfileAttributeCandidateInTransaction(db: ArchiveDatabase, input: {
  queueItemId: string
  actor: string
}) {
  const queueItem = getQueueItem(db, input.queueItemId)
  if (queueItem.itemType !== 'profile_attribute_candidate') {
    throw new Error(`Unsupported review item type: ${queueItem.itemType}`)
  }

  const candidate = getProfileCandidate(db, queueItem.candidateId)
  if (!candidate.proposedCanonicalPersonId) {
    throw new Error(`Profile attribute candidate is missing canonical person: ${candidate.id}`)
  }

  const reviewedAt = new Date().toISOString()
  const attributeId = crypto.randomUUID()
  db.prepare(
    `insert into person_profile_attributes (
      id, canonical_person_id, attribute_group, attribute_key, value_json, display_value,
      source_file_id, source_evidence_id, source_candidate_id, provenance_json,
      confidence, status, approved_journal_id, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attributeId,
    candidate.proposedCanonicalPersonId,
    candidate.attributeGroup,
    candidate.attributeKey,
    candidate.valueJson,
    displayValueFromValueJson(candidate.valueJson),
    candidate.sourceFileId,
    candidate.sourceEvidenceId,
    candidate.sourceCandidateId,
    candidate.proposalBasisJson,
    candidate.confidence,
    'active',
    null,
    reviewedAt,
    reviewedAt
  )

  db.prepare('update profile_attribute_candidates set status = ?, reviewed_at = ? where id = ?').run('approved', reviewedAt, candidate.id)
  db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('approved', reviewedAt, queueItem.id)

  const journal = appendDecisionJournal(db, {
    decisionType: 'approve_profile_attribute_candidate',
    targetType: 'profile_attribute_candidate',
    targetId: candidate.id,
    operationPayload: {
      queueItemId: queueItem.id,
      attributeId
    },
    undoPayload: {
      queueItemId: queueItem.id,
      candidateId: candidate.id,
      attributeId
    },
    actor: input.actor
  })

  db.prepare('update profile_attribute_candidates set approved_journal_id = ? where id = ?').run(journal.journalId, candidate.id)
  db.prepare('update person_profile_attributes set approved_journal_id = ? where id = ?').run(journal.journalId, attributeId)
  enqueuePersonAgentRefreshForCanonicalPeople(db, {
    canonicalPersonIds: [candidate.proposedCanonicalPersonId],
    reason: 'review_approved',
    requestedAt: reviewedAt
  })

  return {
    status: 'approved' as const,
    journalId: journal.journalId,
    queueItemId: queueItem.id,
    candidateId: candidate.id
  }
}

export function approveProfileAttributeCandidate(db: ArchiveDatabase, input: {
  queueItemId: string
  actor: string
}) {
  return inTransaction(db, () => approveProfileAttributeCandidateInTransaction(db, input))
}

export function rejectProfileAttributeCandidate(db: ArchiveDatabase, input: {
  queueItemId: string
  actor: string
  note?: string
}) {
  return inTransaction(db, () => {
    const queueItem = getQueueItem(db, input.queueItemId)
    if (queueItem.itemType !== 'profile_attribute_candidate') {
      throw new Error(`Unsupported review item type: ${queueItem.itemType}`)
    }

    const candidate = getProfileCandidate(db, queueItem.candidateId)
    const reviewedAt = new Date().toISOString()
    db.prepare('update profile_attribute_candidates set status = ?, reviewed_at = ?, review_note = ? where id = ?').run(
      'rejected',
      reviewedAt,
      input.note ?? null,
      candidate.id
    )
    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('rejected', reviewedAt, queueItem.id)

    const journal = appendDecisionJournal(db, {
      decisionType: 'reject_profile_attribute_candidate',
      targetType: 'profile_attribute_candidate',
      targetId: candidate.id,
      operationPayload: {
        queueItemId: queueItem.id,
        note: input.note ?? null
      },
      undoPayload: {
        queueItemId: queueItem.id,
        candidateId: candidate.id
      },
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

export function undoProfileAttributeDecisionInTransaction(db: ArchiveDatabase, input: {
  journalId: string
  actor: string
}) {
  const journal = db.prepare(
    `select id, target_type as targetType, undo_payload_json as undoPayloadJson, undone_at as undoneAt
     from decision_journal where id = ?`
  ).get(input.journalId) as {
    id: string
    targetType: string
    undoPayloadJson: string
    undoneAt: string | null
  } | undefined

  if (!journal) {
    throw new Error(`Decision journal not found: ${input.journalId}`)
  }
  if (journal.undoneAt) {
    throw new Error(`Decision already undone: ${input.journalId}`)
  }
  if (journal.targetType !== 'profile_attribute_candidate') {
    throw new Error(`Unsupported journal target type: ${journal.targetType}`)
  }

  const undoPayload = JSON.parse(journal.undoPayloadJson) as {
    queueItemId?: string
    candidateId?: string
    attributeId?: string
  }
  const updatedAt = new Date().toISOString()

  if (undoPayload.attributeId) {
    db.prepare('update person_profile_attributes set status = ?, updated_at = ? where id = ?').run('undone', updatedAt, undoPayload.attributeId)
  }
  if (undoPayload.candidateId) {
    db.prepare('update profile_attribute_candidates set status = ? where id = ?').run('undone', undoPayload.candidateId)
  }
  if (undoPayload.queueItemId) {
    db.prepare('update review_queue set status = ?, reviewed_at = ? where id = ?').run('undone', updatedAt, undoPayload.queueItemId)
  }

  markDecisionUndone(db, { journalId: input.journalId, actor: input.actor })

  return {
    status: 'undone' as const,
    journalId: input.journalId
  }
}

export function undoProfileAttributeDecision(db: ArchiveDatabase, input: {
  journalId: string
  actor: string
}) {
  return inTransaction(db, () => undoProfileAttributeDecisionInTransaction(db, input))
}
