import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { enqueuePersonAgentRefreshForCanonicalPeople } from './personAgentRefreshService'
import { resolveApprovedFieldAttribution } from './profileAttributionService'

function findExistingQueueItem(db: ArchiveDatabase, candidateId: string) {
  return db.prepare(
    `select id, status
     from review_queue
     where item_type = 'profile_attribute_candidate' and candidate_id = ?
     limit 1`
  ).get(candidateId) as { id: string; status: string } | undefined
}

function valueJsonToDisplayValue(valueJson: string) {
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

export function queueProfileAttributeCandidate(db: ArchiveDatabase, input: {
  proposedCanonicalPersonId?: string | null
  sourceFileId?: string | null
  sourceEvidenceId?: string | null
  sourceCandidateId?: string | null
  attributeGroup: string
  attributeKey: string
  valueJson: string
  proposalBasis: Record<string, unknown>
  reasonCode: string
  confidence: number
}) {
  const existing = db.prepare(
    `select id
     from profile_attribute_candidates
     where coalesce(source_evidence_id, '') = coalesce(?, '')
       and attribute_key = ?
       and status in ('pending', 'approved')
     limit 1`
  ).get(input.sourceEvidenceId ?? null, input.attributeKey) as { id: string } | undefined

  if (existing) {
    const existingQueueItem = findExistingQueueItem(db, existing.id)
    return {
      status: 'queued' as const,
      candidateId: existing.id,
      queueItemId: existingQueueItem?.id ?? null,
      reasonCode: input.reasonCode
    }
  }

  const createdAt = new Date().toISOString()
  const candidateId = crypto.randomUUID()
  const queueItemId = crypto.randomUUID()
  const displayValue = valueJsonToDisplayValue(input.valueJson)

  db.prepare(
    `insert into profile_attribute_candidates (
      id, proposed_canonical_person_id, source_file_id, source_evidence_id, source_candidate_id,
      attribute_group, attribute_key, value_json, proposal_basis_json, reason_code,
      confidence, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    candidateId,
    input.proposedCanonicalPersonId ?? null,
    input.sourceFileId ?? null,
    input.sourceEvidenceId ?? null,
    input.sourceCandidateId ?? null,
    input.attributeGroup,
    input.attributeKey,
    input.valueJson,
    JSON.stringify(input.proposalBasis),
    input.reasonCode,
    input.confidence,
    'pending',
    createdAt
  )

  db.prepare(
    `insert into review_queue (
      id, item_type, candidate_id, status, priority, confidence, summary_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    queueItemId,
    'profile_attribute_candidate',
    candidateId,
    'pending',
    0,
    input.confidence,
    JSON.stringify({
      attributeKey: input.attributeKey,
      displayValue,
      reasonCode: input.reasonCode
    }),
    createdAt
  )

  return {
    status: 'queued' as const,
    candidateId,
    queueItemId,
    reasonCode: input.reasonCode
  }
}

export function projectApprovedFieldToProfile(db: ArchiveDatabase, input: {
  evidenceId: string
  approvedJournalId?: string | null
}) {
  const attribution = resolveApprovedFieldAttribution(db, { evidenceId: input.evidenceId })
  const confidence = 1

  if (attribution.mode === 'queue_candidate') {
    return queueProfileAttributeCandidate(db, {
      proposedCanonicalPersonId: attribution.proposedCanonicalPersonId,
      sourceFileId: attribution.sourceFileId,
      sourceEvidenceId: attribution.sourceEvidenceId,
      sourceCandidateId: attribution.sourceCandidateId,
      attributeGroup: attribution.attributeGroup,
      attributeKey: attribution.attributeKey,
      valueJson: attribution.valueJson,
      proposalBasis: attribution.proposalBasis,
      reasonCode: attribution.reasonCode,
      confidence
    })
  }

  const existingRows = db.prepare(
    `select id, display_value as displayValue
     from person_profile_attributes
     where canonical_person_id = ?
       and attribute_key = ?
       and status = 'active'
     order by created_at asc`
  ).all(attribution.canonicalPersonId, attribution.attributeKey) as Array<{
    id: string
    displayValue: string
  }>

  if (existingRows.some((row) => row.displayValue === attribution.displayValue)) {
    return {
      status: 'projected' as const,
      attributeId: existingRows.find((row) => row.displayValue === attribution.displayValue)?.id ?? null,
      canonicalPersonId: attribution.canonicalPersonId
    }
  }

  if (existingRows.length > 0) {
    return queueProfileAttributeCandidate(db, {
      proposedCanonicalPersonId: attribution.canonicalPersonId,
      sourceFileId: attribution.sourceFileId,
      sourceEvidenceId: attribution.sourceEvidenceId,
      sourceCandidateId: attribution.sourceCandidateId,
      attributeGroup: attribution.attributeGroup,
      attributeKey: attribution.attributeKey,
      valueJson: attribution.valueJson,
      proposalBasis: {
        ...attribution.proposalBasis,
        conflictingAttributeIds: existingRows.map((row) => row.id),
        conflictingDisplayValues: existingRows.map((row) => row.displayValue)
      },
      reasonCode: 'singleton_conflict',
      confidence
    })
  }

  const createdAt = new Date().toISOString()
  const attributeId = crypto.randomUUID()
  db.prepare(
    `insert into person_profile_attributes (
      id, canonical_person_id, attribute_group, attribute_key, value_json, display_value,
      source_file_id, source_evidence_id, source_candidate_id, provenance_json,
      confidence, status, approved_journal_id, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attributeId,
    attribution.canonicalPersonId,
    attribution.attributeGroup,
    attribution.attributeKey,
    attribution.valueJson,
    attribution.displayValue,
    attribution.sourceFileId,
    attribution.sourceEvidenceId,
    attribution.sourceCandidateId,
    JSON.stringify(attribution.proposalBasis),
    confidence,
    'active',
    input.approvedJournalId ?? null,
    createdAt,
    createdAt
  )
  enqueuePersonAgentRefreshForCanonicalPeople(db, {
    canonicalPersonIds: [attribution.canonicalPersonId],
    reason: 'profile_projection',
    requestedAt: createdAt
  })

  return {
    status: 'projected' as const,
    attributeId,
    canonicalPersonId: attribution.canonicalPersonId
  }
}
