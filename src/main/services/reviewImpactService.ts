import type { ReviewImpactPreview } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  activeAttributeIdsByEvidence,
  activeAttributeIdsByJournal,
  displayValueFromValueJson,
  loadActiveAttributes,
  loadCanonicalPerson,
  loadProfileCandidate,
  loadQueueItem,
  loadRelevantJournal,
  loadStructuredCandidate,
  parseJson,
  predictStructuredAttribution
} from './reviewImpactQueryService'
import type {
  ActiveAttributeRow,
  ProfileAttributeCandidateRow,
  StructuredFieldCandidateRow
} from './reviewImpactQueryService'

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
