import type { ArchiveDatabase } from './db'
import {
  buildProviderBoundaryRequest,
  persistProviderEgressRequest,
  persistProviderEgressResponse
} from './providerBoundaryService'

export type FixtureFileRow = {
  id: string
  batchId: string | null
  fileName: string
  frozenPath: string
  fileSha256: string
  extension: string | null
  mimeType: string | null
}

export function loadFixtureFile(db: ArchiveDatabase, fileId: string) {
  return db.prepare(
    `select
      id,
      batch_id as batchId,
      file_name as fileName,
      frozen_path as frozenPath,
      sha256 as fileSha256,
      extension,
      mime_type as mimeType
     from vault_files
     where id = ?
     limit 1`
  ).get(fileId) as FixtureFileRow | undefined
}

export function loadLinkedCanonicalPersonId(db: ArchiveDatabase, fileId: string) {
  const row = db.prepare(
    `select pm.canonical_person_id as canonicalPersonId
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
     order by pm.canonical_person_id asc
     limit 1`
  ).get(fileId) as { canonicalPersonId: string } | undefined

  return row?.canonicalPersonId ?? null
}

export function insertFixtureEnrichmentJob(input: {
  db: ArchiveDatabase
  jobId: string
  fileId: string
  enhancerType: string
  provider: string
  model: string
  status: string
  attemptCount: number
  inputHash: string
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
  errorMessage?: string | null
  usage?: Record<string, unknown>
}) {
  input.db.prepare(
    `insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count,
      input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.jobId,
    input.fileId,
    input.enhancerType,
    input.provider,
    input.model,
    input.status,
    input.attemptCount,
    input.inputHash,
    input.startedAt ?? input.createdAt,
    input.finishedAt ?? input.createdAt,
    input.errorMessage ?? null,
    JSON.stringify(input.usage ?? { fixture: true }),
    input.createdAt,
    input.createdAt
  )
}

export function persistFixtureProviderBoundary(input: {
  db: ArchiveDatabase
  file: FixtureFileRow
  jobId: string
  enhancerType: 'document_ocr' | 'image_understanding' | 'chat_screenshot'
  provider: string
  model: string
  createdAt: string
  responsePayload?: Record<string, unknown>
}) {
  const boundaryRequest = buildProviderBoundaryRequest({
    job: {
      id: input.jobId,
      fileId: input.file.id,
      fileName: input.file.fileName,
      frozenPath: input.file.frozenPath,
      fileSha256: input.file.fileSha256,
      extension: input.file.extension,
      mimeType: input.file.mimeType,
      enhancerType: input.enhancerType,
      provider: input.provider,
      model: input.model
    }
  })

  const artifactId = persistProviderEgressRequest(input.db, {
    job: boundaryRequest.job,
    policyKey: boundaryRequest.policyKey,
    requestEnvelope: boundaryRequest.requestEnvelope,
    redactionSummary: boundaryRequest.redactionSummary,
    createdAt: input.createdAt
  })

  persistProviderEgressResponse(input.db, {
    artifactId,
    payload: input.responsePayload ?? {
      fixture: true,
      status: 'ok'
    },
    createdAt: input.createdAt
  })
}

export function insertEnrichmentArtifact(input: {
  db: ArchiveDatabase
  jobId: string
  artifactId: string
  artifactType: string
  payload: Record<string, unknown>
  createdAt: string
}) {
  input.db.prepare(
    'insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)'
  ).run(
    input.artifactId,
    input.jobId,
    input.artifactType,
    JSON.stringify(input.payload),
    input.createdAt
  )
}

export function insertStructuredFieldCandidate(input: {
  db: ArchiveDatabase
  candidateId: string
  fileId: string
  jobId: string
  fieldType: string
  fieldKey: string
  fieldValue: Record<string, unknown>
  documentType: string
  confidence: number
  riskLevel: string
  sourcePage: number | null
  sourceSpanJson?: string | null
  status: string
  createdAt: string
}) {
  input.db.prepare(
    `insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.candidateId,
    input.fileId,
    input.jobId,
    input.fieldType,
    input.fieldKey,
    JSON.stringify(input.fieldValue),
    input.documentType,
    input.confidence,
    input.riskLevel,
    input.sourcePage,
    input.sourceSpanJson ?? null,
    input.status,
    input.createdAt
  )
}
