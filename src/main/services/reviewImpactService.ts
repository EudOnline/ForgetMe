import type { ReviewImpactPreview } from '../../shared/archiveContracts'
import { normalizePersonName } from './canonicalPeopleService'
import type { ArchiveDatabase } from './db'

type ReviewQueueItemRow = {
  id: string
  itemType: 'structured_field_candidate' | 'profile_attribute_candidate'
  candidateId: string
  status: string
}

type StructuredFieldCandidateRow = {
  id: string
  fileId: string
  fieldType: string
  fieldKey: string
  fieldValueJson: string
  status: string
  approvedJournalId: string | null
}

type ProfileAttributeCandidateRow = {
  id: string
  proposedCanonicalPersonId: string | null
  sourceEvidenceId: string | null
  sourceCandidateId: string | null
  attributeGroup: string
  attributeKey: string
  valueJson: string
  status: string
  approvedJournalId: string | null
}

type CanonicalPersonRow = {
  id: string
  primaryDisplayName: string
}

type ActiveAttributeRow = {
  id: string
  displayValue: string
}

type DecisionJournalRow = {
  id: string
  undoPayloadJson: string
  undoneAt: string | null
}

type PredictedStructuredAttribution = {
  mode: 'auto_project' | 'queue_candidate'
  canonicalPersonId: string | null
  attributeGroup: string
  attributeKey: string
  displayValue: string
  sourceCandidateId: string
}

const NAME_LIKE_FIELD_KEYS = new Set(['full_name', 'student_name', 'participant_fragment'])

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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function displayValueFromValueJson(valueJson: string) {
  const parsed = parseJson(valueJson)
  const leaves = collectStringLeaves(parsed)
  return leaves[0] ?? valueJson
}

function loadQueueItem(db: ArchiveDatabase, queueItemId: string) {
  const queueItem = db.prepare(
    `select
      id,
      item_type as itemType,
      candidate_id as candidateId,
      status
     from review_queue
     where id = ?`
  ).get(queueItemId) as ReviewQueueItemRow | undefined

  if (!queueItem) {
    throw new Error(`Review queue item not found: ${queueItemId}`)
  }

  if (queueItem.itemType !== 'structured_field_candidate' && queueItem.itemType !== 'profile_attribute_candidate') {
    throw new Error(`Unsupported review item type: ${queueItem.itemType}`)
  }

  return queueItem
}

function loadStructuredCandidate(db: ArchiveDatabase, candidateId: string) {
  const candidate = db.prepare(
    `select
      id,
      file_id as fileId,
      field_type as fieldType,
      field_key as fieldKey,
      field_value_json as fieldValueJson,
      status,
      approved_journal_id as approvedJournalId
     from structured_field_candidates
     where id = ?`
  ).get(candidateId) as StructuredFieldCandidateRow | undefined

  if (!candidate) {
    throw new Error(`Structured field candidate not found: ${candidateId}`)
  }

  return candidate
}

function loadProfileCandidate(db: ArchiveDatabase, candidateId: string) {
  const candidate = db.prepare(
    `select
      id,
      proposed_canonical_person_id as proposedCanonicalPersonId,
      source_evidence_id as sourceEvidenceId,
      source_candidate_id as sourceCandidateId,
      attribute_group as attributeGroup,
      attribute_key as attributeKey,
      value_json as valueJson,
      status,
      approved_journal_id as approvedJournalId
     from profile_attribute_candidates
     where id = ?`
  ).get(candidateId) as ProfileAttributeCandidateRow | undefined

  if (!candidate) {
    throw new Error(`Profile attribute candidate not found: ${candidateId}`)
  }

  return candidate
}

function loadCanonicalPerson(db: ArchiveDatabase, canonicalPersonId: string | null) {
  if (!canonicalPersonId) {
    return null
  }

  const person = db.prepare(
    `select id, primary_display_name as primaryDisplayName
     from canonical_people
     where id = ?`
  ).get(canonicalPersonId) as CanonicalPersonRow | undefined

  return person ?? null
}

function loadActiveAttributes(db: ArchiveDatabase, canonicalPersonId: string | null, attributeKey: string) {
  if (!canonicalPersonId) {
    return []
  }

  return db.prepare(
    `select id, display_value as displayValue
     from person_profile_attributes
     where canonical_person_id = ?
       and attribute_key = ?
       and status = 'active'
     order by created_at asc`
  ).all(canonicalPersonId, attributeKey) as ActiveAttributeRow[]
}

function loadCanonicalPeopleForFile(db: ArchiveDatabase, fileId: string) {
  const rows = db.prepare(
    `select distinct pm.canonical_person_id as canonicalPersonId
     from relations r
     join person_memberships pm
       on pm.anchor_person_id = r.source_id
      and pm.status = 'active'
     join canonical_people cp
       on cp.id = pm.canonical_person_id
      and cp.status = 'approved'
     where r.source_type = 'person'
       and r.target_type = 'file'
       and r.target_id = ?
     order by pm.canonical_person_id asc`
  ).all(fileId) as Array<{ canonicalPersonId: string }>

  return rows.map((row) => row.canonicalPersonId)
}

function loadAliasMatches(db: ArchiveDatabase, normalizedName: string) {
  const rows = db.prepare(
    `select distinct cp.id as canonicalPersonId
     from canonical_people cp
     left join person_aliases pa
       on pa.canonical_person_id = cp.id
     where cp.status = 'approved'
       and (
         cp.normalized_name = ?
         or pa.normalized_name = ?
       )
     order by cp.id asc`
  ).all(normalizedName, normalizedName) as Array<{ canonicalPersonId: string }>

  return rows.map((row) => row.canonicalPersonId)
}

function predictStructuredAttribution(db: ArchiveDatabase, candidate: StructuredFieldCandidateRow): PredictedStructuredAttribution {
  const displayValue = displayValueFromValueJson(candidate.fieldValueJson)
  const linkedCanonicalPeople = loadCanonicalPeopleForFile(db, candidate.fileId)

  if (linkedCanonicalPeople.length === 1) {
    return {
      mode: 'auto_project',
      canonicalPersonId: linkedCanonicalPeople[0],
      attributeGroup: candidate.fieldType,
      attributeKey: candidate.fieldKey,
      displayValue,
      sourceCandidateId: candidate.id
    }
  }

  if (NAME_LIKE_FIELD_KEYS.has(candidate.fieldKey) && displayValue) {
    const aliasMatches = loadAliasMatches(db, normalizePersonName(displayValue))
    if (aliasMatches.length === 1) {
      return {
        mode: 'auto_project',
        canonicalPersonId: aliasMatches[0],
        attributeGroup: candidate.fieldType,
        attributeKey: candidate.fieldKey,
        displayValue,
        sourceCandidateId: candidate.id
      }
    }
  }

  return {
    mode: 'queue_candidate',
    canonicalPersonId: linkedCanonicalPeople.length === 1 ? linkedCanonicalPeople[0] : null,
    attributeGroup: candidate.fieldType,
    attributeKey: candidate.fieldKey,
    displayValue,
    sourceCandidateId: candidate.id
  }
}

function joinCurrentValues(rows: ActiveAttributeRow[]) {
  return rows.length > 0 ? rows.map((row) => row.displayValue).join(' / ') : null
}

function buildRejectImpact(input: {
  canonicalPersonId: string | null
  sourceEvidenceId: string | null
  sourceCandidateId: string | null
  summary: string
}): ReviewImpactPreview['rejectImpact'] {
  return {
    kind: 'reject_review_item',
    summary: input.summary,
    canonicalPersonId: input.canonicalPersonId,
    sourceEvidenceId: input.sourceEvidenceId,
    sourceCandidateId: input.sourceCandidateId
  }
}

function buildNoApprovedUndoImpact(canonicalPersonId: string | null): ReviewImpactPreview['undoImpact'] {
  return {
    kind: 'no_approved_decision',
    summary: 'No applied review decision exists yet, so undo has nothing to roll back.',
    canonicalPersonId,
    affectedJournalId: null,
    affectedAttributeIds: []
  }
}

function loadDecisionJournalById(db: ArchiveDatabase, journalId: string | null) {
  if (!journalId) {
    return null
  }

  const row = db.prepare(
    `select id, undo_payload_json as undoPayloadJson, undone_at as undoneAt
     from decision_journal
     where id = ?`
  ).get(journalId) as DecisionJournalRow | undefined

  if (!row || row.undoneAt) {
    return null
  }

  return row
}

function loadLatestActiveJournal(db: ArchiveDatabase, targetType: string, targetId: string) {
  const row = db.prepare(
    `select id, undo_payload_json as undoPayloadJson, undone_at as undoneAt
     from decision_journal
     where target_type = ?
       and target_id = ?
       and undone_at is null
     order by created_at desc
     limit 1`
  ).get(targetType, targetId) as DecisionJournalRow | undefined

  return row ?? null
}

function loadRelevantJournal(db: ArchiveDatabase, targetType: string, targetId: string, preferredJournalId: string | null) {
  return loadDecisionJournalById(db, preferredJournalId) ?? loadLatestActiveJournal(db, targetType, targetId)
}

function activeAttributeIdsByJournal(db: ArchiveDatabase, journalId: string) {
  const rows = db.prepare(
    `select id
     from person_profile_attributes
     where approved_journal_id = ?
       and status = 'active'
     order by created_at asc`
  ).all(journalId) as Array<{ id: string }>

  return rows.map((row) => row.id)
}

function activeAttributeIdsByEvidence(db: ArchiveDatabase, evidenceId: string) {
  const rows = db.prepare(
    `select id
     from person_profile_attributes
     where source_evidence_id = ?
       and status = 'active'
     order by created_at asc`
  ).all(evidenceId) as Array<{ id: string }>

  return rows.map((row) => row.id)
}

function buildStructuredApproveImpact(db: ArchiveDatabase, candidate: StructuredFieldCandidateRow): ReviewImpactPreview['approveImpact'] {
  const predicted = predictStructuredAttribution(db, candidate)
  const canonicalPerson = loadCanonicalPerson(db, predicted.canonicalPersonId)
  const activeAttributes = loadActiveAttributes(db, predicted.canonicalPersonId, predicted.attributeKey)
  const currentValue = joinCurrentValues(activeAttributes)
  const duplicateExists = activeAttributes.some((attribute) => attribute.displayValue === predicted.displayValue)

  if (predicted.mode === 'auto_project' && !duplicateExists && activeAttributes.length === 0) {
    return {
      kind: 'project_formal_attribute',
      summary: 'Approving this field will create a formal profile attribute directly.',
      canonicalPersonId: canonicalPerson?.id ?? null,
      canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
      fieldKey: predicted.attributeKey,
      nextValue: predicted.displayValue,
      currentValue,
      sourceEvidenceId: null,
      sourceCandidateId: predicted.sourceCandidateId,
      relatedJournalId: candidate.approvedJournalId
    }
  }

  if (predicted.mode === 'auto_project' && duplicateExists) {
    return {
      kind: 'no_formal_change',
      summary: 'Approving this field keeps the formal profile unchanged because the same value already exists.',
      canonicalPersonId: canonicalPerson?.id ?? null,
      canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
      fieldKey: predicted.attributeKey,
      nextValue: predicted.displayValue,
      currentValue,
      sourceEvidenceId: null,
      sourceCandidateId: predicted.sourceCandidateId,
      relatedJournalId: candidate.approvedJournalId
    }
  }

  return {
    kind: 'queue_profile_attribute_candidate',
    summary: 'Approving this field keeps the evidence and queues formal-profile review instead of writing directly.',
    canonicalPersonId: canonicalPerson?.id ?? null,
    canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
    fieldKey: predicted.attributeKey,
    nextValue: predicted.displayValue,
    currentValue,
    sourceEvidenceId: null,
    sourceCandidateId: predicted.sourceCandidateId,
    relatedJournalId: candidate.approvedJournalId
  }
}

function buildProfileApproveImpact(db: ArchiveDatabase, candidate: ProfileAttributeCandidateRow): ReviewImpactPreview['approveImpact'] {
  const canonicalPerson = loadCanonicalPerson(db, candidate.proposedCanonicalPersonId)
  const nextValue = displayValueFromValueJson(candidate.valueJson)
  const activeAttributes = loadActiveAttributes(db, candidate.proposedCanonicalPersonId, candidate.attributeKey)
  const currentValue = joinCurrentValues(activeAttributes)
  const duplicateExists = activeAttributes.some((attribute) => attribute.displayValue === nextValue)

  if (!candidate.proposedCanonicalPersonId) {
    return {
      kind: 'missing_canonical_person',
      summary: 'Approving this candidate is blocked until a canonical person is resolved.',
      canonicalPersonId: null,
      canonicalPersonName: null,
      fieldKey: candidate.attributeKey,
      nextValue,
      currentValue,
      sourceEvidenceId: candidate.sourceEvidenceId,
      sourceCandidateId: candidate.sourceCandidateId,
      relatedJournalId: candidate.approvedJournalId
    }
  }

  if (activeAttributes.length === 0) {
    return {
      kind: 'create_formal_attribute',
      summary: 'Approving this candidate will create a new formal profile attribute.',
      canonicalPersonId: canonicalPerson?.id ?? null,
      canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
      fieldKey: candidate.attributeKey,
      nextValue,
      currentValue,
      sourceEvidenceId: candidate.sourceEvidenceId,
      sourceCandidateId: candidate.sourceCandidateId,
      relatedJournalId: candidate.approvedJournalId
    }
  }

  if (duplicateExists) {
    return {
      kind: 'duplicate_formal_attribute',
      summary: 'Approving this candidate will add another active attribute with the same value.',
      canonicalPersonId: canonicalPerson?.id ?? null,
      canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
      fieldKey: candidate.attributeKey,
      nextValue,
      currentValue,
      sourceEvidenceId: candidate.sourceEvidenceId,
      sourceCandidateId: candidate.sourceCandidateId,
      relatedJournalId: candidate.approvedJournalId
    }
  }

  return {
    kind: 'conflict_formal_attribute',
    summary: 'Approving this candidate will create a conflicting formal profile attribute value.',
    canonicalPersonId: canonicalPerson?.id ?? null,
    canonicalPersonName: canonicalPerson?.primaryDisplayName ?? null,
    fieldKey: candidate.attributeKey,
    nextValue,
    currentValue,
    sourceEvidenceId: candidate.sourceEvidenceId,
    sourceCandidateId: candidate.sourceCandidateId,
    relatedJournalId: candidate.approvedJournalId
  }
}

function buildStructuredUndoImpact(db: ArchiveDatabase, candidate: StructuredFieldCandidateRow): ReviewImpactPreview['undoImpact'] {
  const predicted = predictStructuredAttribution(db, candidate)
  const journal = loadRelevantJournal(db, 'structured_field_candidate', candidate.id, candidate.approvedJournalId)

  if (!journal) {
    return buildNoApprovedUndoImpact(predicted.canonicalPersonId)
  }

  const undoPayload = parseJson(journal.undoPayloadJson) as { evidenceId?: string }
  const affectedAttributeIds = typeof undoPayload.evidenceId === 'string'
    ? activeAttributeIdsByEvidence(db, undoPayload.evidenceId)
    : []

  return {
    kind: typeof undoPayload.evidenceId === 'string' ? 'rollback_structured_field_approval' : 'rollback_review_decision',
    summary: typeof undoPayload.evidenceId === 'string'
      ? 'Undo will remove approved evidence and roll back any projected formal attributes from it.'
      : 'Undo will revert the last review decision for this structured field item.',
    canonicalPersonId: predicted.canonicalPersonId,
    affectedJournalId: journal.id,
    affectedAttributeIds
  }
}

function buildProfileUndoImpact(db: ArchiveDatabase, candidate: ProfileAttributeCandidateRow): ReviewImpactPreview['undoImpact'] {
  const journal = loadRelevantJournal(db, 'profile_attribute_candidate', candidate.id, candidate.approvedJournalId)

  if (!journal) {
    return buildNoApprovedUndoImpact(candidate.proposedCanonicalPersonId)
  }

  const undoPayload = parseJson(journal.undoPayloadJson) as { attributeId?: string }
  const affectedAttributeIds = activeAttributeIdsByJournal(db, journal.id)
  if (affectedAttributeIds.length === 0 && typeof undoPayload.attributeId === 'string') {
    affectedAttributeIds.push(undoPayload.attributeId)
  }

  return {
    kind: affectedAttributeIds.length > 0 ? 'rollback_profile_attribute' : 'rollback_review_decision',
    summary: affectedAttributeIds.length > 0
      ? 'Undo will mark the applied formal profile attribute as undone.'
      : 'Undo will revert the last review decision for this profile candidate.',
    canonicalPersonId: candidate.proposedCanonicalPersonId,
    affectedJournalId: journal.id,
    affectedAttributeIds
  }
}

export function buildReviewImpactPreview(db: ArchiveDatabase, input: { queueItemId: string }): ReviewImpactPreview {
  const queueItem = loadQueueItem(db, input.queueItemId)

  if (queueItem.itemType === 'structured_field_candidate') {
    const candidate = loadStructuredCandidate(db, queueItem.candidateId)
    const predicted = predictStructuredAttribution(db, candidate)

    return {
      approveImpact: buildStructuredApproveImpact(db, candidate),
      rejectImpact: buildRejectImpact({
        canonicalPersonId: predicted.canonicalPersonId,
        sourceEvidenceId: null,
        sourceCandidateId: candidate.id,
        summary: 'Rejecting this item keeps the field out of approved evidence and out of the formal profile.'
      }),
      undoImpact: buildStructuredUndoImpact(db, candidate)
    }
  }

  const candidate = loadProfileCandidate(db, queueItem.candidateId)

  return {
    approveImpact: buildProfileApproveImpact(db, candidate),
    rejectImpact: buildRejectImpact({
      canonicalPersonId: candidate.proposedCanonicalPersonId,
      sourceEvidenceId: candidate.sourceEvidenceId,
      sourceCandidateId: candidate.sourceCandidateId,
      summary: 'Rejecting this item keeps the proposal out of the formal profile.'
    }),
    undoImpact: buildProfileUndoImpact(db, candidate)
  }
}
