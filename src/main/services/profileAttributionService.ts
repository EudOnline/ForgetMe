import type { ArchiveDatabase } from './db'
import { normalizePersonName } from './canonicalPeopleService'

type ApprovedFieldEvidence = {
  evidenceId: string
  fileId: string
  evidenceType: string
  payloadJson: string
}

type ApprovedFieldPayload = {
  candidateId?: string
  fieldType?: string
  fieldKey?: string
  fieldValue?: unknown
  documentType?: string
}

type AutoProjectAttribution = {
  mode: 'auto_project'
  canonicalPersonId: string
  matchedRule: 'single_file_person' | 'unique_alias_match'
  attributeGroup: string
  attributeKey: string
  displayValue: string
  valueJson: string
  sourceFileId: string
  sourceEvidenceId: string
  sourceCandidateId: string | null
  proposalBasis: Record<string, unknown>
}

type QueuedCandidateAttribution = {
  mode: 'queue_candidate'
  reasonCode: 'ambiguous_person_match'
  attributeGroup: string
  attributeKey: string
  displayValue: string
  valueJson: string
  sourceFileId: string
  sourceEvidenceId: string
  sourceCandidateId: string | null
  proposedCanonicalPersonId: string | null
  proposalBasis: Record<string, unknown>
}

export type ApprovedFieldAttribution = AutoProjectAttribution | QueuedCandidateAttribution

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

function getApprovedFieldEvidence(db: ArchiveDatabase, evidenceId: string) {
  const evidence = db.prepare(
    `select
      id as evidenceId,
      file_id as fileId,
      evidence_type as evidenceType,
      payload_json as payloadJson
     from enriched_evidence
     where id = ? and status = 'approved'`
  ).get(evidenceId) as ApprovedFieldEvidence | undefined

  if (!evidence) {
    throw new Error(`Approved evidence not found: ${evidenceId}`)
  }

  return evidence
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

export function resolveApprovedFieldAttribution(db: ArchiveDatabase, input: { evidenceId: string }): ApprovedFieldAttribution {
  const evidence = getApprovedFieldEvidence(db, input.evidenceId)
  const payload = JSON.parse(evidence.payloadJson) as ApprovedFieldPayload
  const attributeGroup = typeof payload.fieldType === 'string' ? payload.fieldType : 'document'
  const attributeKey = typeof payload.fieldKey === 'string' ? payload.fieldKey : 'unknown'
  const displayValue = collectStringLeaves(payload.fieldValue)[0] ?? ''
  const valueJson = JSON.stringify(payload.fieldValue ?? { value: displayValue })
  const sourceCandidateId = typeof payload.candidateId === 'string' ? payload.candidateId : null

  const linkedCanonicalPeople = loadCanonicalPeopleForFile(db, evidence.fileId)
  if (linkedCanonicalPeople.length === 1) {
    return {
      mode: 'auto_project',
      canonicalPersonId: linkedCanonicalPeople[0],
      matchedRule: 'single_file_person',
      attributeGroup,
      attributeKey,
      displayValue,
      valueJson,
      sourceFileId: evidence.fileId,
      sourceEvidenceId: evidence.evidenceId,
      sourceCandidateId,
      proposalBasis: {
        matchedRule: 'single_file_person',
        linkedCanonicalPersonIds: linkedCanonicalPeople
      }
    }
  }

  if (NAME_LIKE_FIELD_KEYS.has(attributeKey) && displayValue) {
    const aliasMatches = loadAliasMatches(db, normalizePersonName(displayValue))
    if (aliasMatches.length === 1) {
      return {
        mode: 'auto_project',
        canonicalPersonId: aliasMatches[0],
        matchedRule: 'unique_alias_match',
        attributeGroup,
        attributeKey,
        displayValue,
        valueJson,
        sourceFileId: evidence.fileId,
        sourceEvidenceId: evidence.evidenceId,
        sourceCandidateId,
        proposalBasis: {
          matchedRule: 'unique_alias_match',
          matchedValue: displayValue,
          matchedCanonicalPersonIds: aliasMatches
        }
      }
    }
  }

  return {
    mode: 'queue_candidate',
    reasonCode: 'ambiguous_person_match',
    attributeGroup,
    attributeKey,
    displayValue,
    valueJson,
    sourceFileId: evidence.fileId,
    sourceEvidenceId: evidence.evidenceId,
    sourceCandidateId,
    proposedCanonicalPersonId: linkedCanonicalPeople.length === 1 ? linkedCanonicalPeople[0] : null,
    proposalBasis: {
      linkedCanonicalPersonIds: linkedCanonicalPeople,
      matchedValue: displayValue,
      fieldKey: attributeKey
    }
  }
}
