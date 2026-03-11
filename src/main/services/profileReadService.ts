import type { ArchiveDatabase } from './db'

function parseJson<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function displayValueFromValueJson(valueJson: string) {
  const payload = parseJson<Record<string, unknown>>(valueJson, {})
  if (typeof payload.value === 'string' && payload.value.trim().length > 0) {
    return payload.value.trim()
  }

  return valueJson
}

export function listEnrichmentAttempts(db: ArchiveDatabase, input?: {
  jobId?: string
  status?: 'processing' | 'completed' | 'failed' | 'cancelled'
}) {
  const filters = ['1 = 1']
  const params = [] as Array<string>

  if (input?.jobId) {
    filters.push('ea.job_id = ?')
    params.push(input.jobId)
  }
  if (input?.status) {
    filters.push('ea.status = ?')
    params.push(input.status)
  }

  return db.prepare(
    `select
      ea.id as id,
      ea.job_id as jobId,
      ej.file_id as fileId,
      vf.file_name as fileName,
      ea.attempt_index as attemptIndex,
      ea.provider as provider,
      ea.model as model,
      ea.status as status,
      ea.started_at as startedAt,
      ea.finished_at as finishedAt,
      ea.error_kind as errorKind,
      ea.error_message as errorMessage,
      ea.usage_json as usageJson,
      ea.created_at as createdAt
     from enrichment_attempts ea
     join enrichment_jobs ej on ej.id = ea.job_id
     join vault_files vf on vf.id = ej.file_id
     where ${filters.join(' and ')}
     order by ea.created_at desc, ea.id desc`
  ).all(...params).map((row) => {
    const typedRow = row as {
      id: string
      jobId: string
      fileId: string
      fileName: string
      attemptIndex: number
      provider: string
      model: string
      status: string
      startedAt: string
      finishedAt: string | null
      errorKind: string | null
      errorMessage: string | null
      usageJson: string
      createdAt: string
    }

    return {
      id: typedRow.id,
      jobId: typedRow.jobId,
      fileId: typedRow.fileId,
      fileName: typedRow.fileName,
      attemptIndex: typedRow.attemptIndex,
      provider: typedRow.provider,
      model: typedRow.model,
      status: typedRow.status,
      startedAt: typedRow.startedAt,
      finishedAt: typedRow.finishedAt,
      errorKind: typedRow.errorKind,
      errorMessage: typedRow.errorMessage,
      usage: parseJson<Record<string, unknown>>(typedRow.usageJson, {}),
      createdAt: typedRow.createdAt
    }
  })
}

export function listPersonProfileAttributes(db: ArchiveDatabase, input?: {
  canonicalPersonId?: string
  status?: 'active' | 'superseded' | 'undone'
}) {
  const filters = ['1 = 1']
  const params = [] as Array<string>

  if (input?.canonicalPersonId) {
    filters.push('ppa.canonical_person_id = ?')
    params.push(input.canonicalPersonId)
  }
  if (input?.status) {
    filters.push('ppa.status = ?')
    params.push(input.status)
  }

  return db.prepare(
    `select
      ppa.id as id,
      ppa.canonical_person_id as canonicalPersonId,
      ppa.attribute_group as attributeGroup,
      ppa.attribute_key as attributeKey,
      ppa.value_json as valueJson,
      ppa.display_value as displayValue,
      ppa.source_file_id as sourceFileId,
      ppa.source_evidence_id as sourceEvidenceId,
      ppa.source_candidate_id as sourceCandidateId,
      ppa.provenance_json as provenanceJson,
      ppa.confidence as confidence,
      ppa.status as status,
      ppa.approved_journal_id as approvedJournalId,
      ppa.created_at as createdAt,
      ppa.updated_at as updatedAt
     from person_profile_attributes ppa
     where ${filters.join(' and ')}
     order by ppa.attribute_group asc, ppa.attribute_key asc, ppa.created_at desc`
  ).all(...params).map((row) => {
    const typedRow = row as {
      id: string
      canonicalPersonId: string
      attributeGroup: string
      attributeKey: string
      valueJson: string
      displayValue: string
      sourceFileId: string | null
      sourceEvidenceId: string | null
      sourceCandidateId: string | null
      provenanceJson: string
      confidence: number
      status: string
      approvedJournalId: string | null
      createdAt: string
      updatedAt: string
    }

    return {
      id: typedRow.id,
      canonicalPersonId: typedRow.canonicalPersonId,
      attributeGroup: typedRow.attributeGroup,
      attributeKey: typedRow.attributeKey,
      valueJson: typedRow.valueJson,
      displayValue: typedRow.displayValue,
      sourceFileId: typedRow.sourceFileId,
      sourceEvidenceId: typedRow.sourceEvidenceId,
      sourceCandidateId: typedRow.sourceCandidateId,
      provenance: parseJson<Record<string, unknown>>(typedRow.provenanceJson, {}),
      confidence: typedRow.confidence,
      status: typedRow.status,
      approvedJournalId: typedRow.approvedJournalId,
      createdAt: typedRow.createdAt,
      updatedAt: typedRow.updatedAt
    }
  })
}

export function listProfileAttributeCandidates(db: ArchiveDatabase, input?: {
  canonicalPersonId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'undone'
}) {
  const filters = ['1 = 1']
  const params = [] as Array<string>

  if (input?.canonicalPersonId) {
    filters.push('pac.proposed_canonical_person_id = ?')
    params.push(input.canonicalPersonId)
  }
  if (input?.status) {
    filters.push('pac.status = ?')
    params.push(input.status)
  }

  return db.prepare(
    `select
      pac.id as id,
      pac.proposed_canonical_person_id as proposedCanonicalPersonId,
      pac.source_file_id as sourceFileId,
      pac.source_evidence_id as sourceEvidenceId,
      pac.source_candidate_id as sourceCandidateId,
      pac.attribute_group as attributeGroup,
      pac.attribute_key as attributeKey,
      pac.value_json as valueJson,
      pac.proposal_basis_json as proposalBasisJson,
      pac.reason_code as reasonCode,
      pac.confidence as confidence,
      pac.status as status,
      pac.created_at as createdAt,
      pac.reviewed_at as reviewedAt,
      pac.review_note as reviewNote,
      pac.approved_journal_id as approvedJournalId,
      rq.id as queueItemId
     from profile_attribute_candidates pac
     left join review_queue rq
       on rq.candidate_id = pac.id
      and rq.item_type = 'profile_attribute_candidate'
     where ${filters.join(' and ')}
     order by pac.created_at desc, pac.id desc`
  ).all(...params).map((row) => {
    const typedRow = row as {
      id: string
      proposedCanonicalPersonId: string | null
      sourceFileId: string | null
      sourceEvidenceId: string | null
      sourceCandidateId: string | null
      attributeGroup: string
      attributeKey: string
      valueJson: string
      proposalBasisJson: string
      reasonCode: string
      confidence: number
      status: string
      createdAt: string
      reviewedAt: string | null
      reviewNote: string | null
      approvedJournalId: string | null
      queueItemId: string | null
    }

    return {
      id: typedRow.id,
      proposedCanonicalPersonId: typedRow.proposedCanonicalPersonId,
      sourceFileId: typedRow.sourceFileId,
      sourceEvidenceId: typedRow.sourceEvidenceId,
      sourceCandidateId: typedRow.sourceCandidateId,
      attributeGroup: typedRow.attributeGroup,
      attributeKey: typedRow.attributeKey,
      valueJson: typedRow.valueJson,
      displayValue: displayValueFromValueJson(typedRow.valueJson),
      proposalBasis: parseJson<Record<string, unknown>>(typedRow.proposalBasisJson, {}),
      reasonCode: typedRow.reasonCode,
      confidence: typedRow.confidence,
      status: typedRow.status,
      createdAt: typedRow.createdAt,
      reviewedAt: typedRow.reviewedAt,
      reviewNote: typedRow.reviewNote,
      approvedJournalId: typedRow.approvedJournalId,
      queueItemId: typedRow.queueItemId
    }
  })
}

export function getApprovedProfileByCanonicalPerson(db: ArchiveDatabase, input: { canonicalPersonId: string }) {
  const attributes = listPersonProfileAttributes(db, {
    canonicalPersonId: input.canonicalPersonId,
    status: 'active'
  })

  return attributes.reduce<Record<string, typeof attributes>>((groups, attribute) => {
    const groupKey = attribute.attributeGroup
    groups[groupKey] = [...(groups[groupKey] ?? []), attribute]
    return groups
  }, {})
}
