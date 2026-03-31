import { normalizePersonName } from './canonicalPeopleService'
import type { ArchiveDatabase } from './db'

export type ReviewQueueItemRow = {
  id: string
  itemType: 'structured_field_candidate' | 'profile_attribute_candidate'
  candidateId: string
  status: string
}

export type StructuredFieldCandidateRow = {
  id: string
  fileId: string
  fieldType: string
  fieldKey: string
  fieldValueJson: string
  status: string
  approvedJournalId: string | null
}

export type ProfileAttributeCandidateRow = {
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

export type CanonicalPersonRow = {
  id: string
  primaryDisplayName: string
}

export type ActiveAttributeRow = {
  id: string
  displayValue: string
}

export type DecisionJournalRow = {
  id: string
  undoPayloadJson: string
  undoneAt: string | null
}

export type PredictedStructuredAttribution = {
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

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function displayValueFromValueJson(valueJson: string) {
  const parsed = parseJson(valueJson)
  const leaves = collectStringLeaves(parsed)
  return leaves[0] ?? valueJson
}

export function loadQueueItem(db: ArchiveDatabase, queueItemId: string) {
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

export function loadStructuredCandidate(db: ArchiveDatabase, candidateId: string) {
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

export function loadProfileCandidate(db: ArchiveDatabase, candidateId: string) {
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

export function loadCanonicalPerson(db: ArchiveDatabase, canonicalPersonId: string | null) {
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

export function loadActiveAttributes(db: ArchiveDatabase, canonicalPersonId: string | null, attributeKey: string) {
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

export function predictStructuredAttribution(db: ArchiveDatabase, candidate: StructuredFieldCandidateRow): PredictedStructuredAttribution {
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

export function loadRelevantJournal(
  db: ArchiveDatabase,
  targetType: string,
  targetId: string,
  preferredJournalId: string | null
) {
  return loadDecisionJournalById(db, preferredJournalId) ?? loadLatestActiveJournal(db, targetType, targetId)
}

export function activeAttributeIdsByJournal(db: ArchiveDatabase, journalId: string) {
  const rows = db.prepare(
    `select id
     from person_profile_attributes
     where approved_journal_id = ?
       and status = 'active'
     order by created_at asc`
  ).all(journalId) as Array<{ id: string }>

  return rows.map((row) => row.id)
}

export function activeAttributeIdsByEvidence(db: ArchiveDatabase, evidenceId: string) {
  const rows = db.prepare(
    `select id
     from person_profile_attributes
     where source_evidence_id = ?
       and status = 'active'
     order by created_at asc`
  ).all(evidenceId) as Array<{ id: string }>

  return rows.map((row) => row.id)
}
