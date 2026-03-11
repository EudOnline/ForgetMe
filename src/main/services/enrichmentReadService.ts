import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { loadApprovedEnrichmentIndex } from './enrichedSearchService'

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

export function listEnrichmentJobs(db: ArchiveDatabase, input?: {
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  fileId?: string
}) {
  const filters = ['1 = 1']
  const params = [] as Array<string>

  if (input?.status) {
    filters.push('ej.status = ?')
    params.push(input.status)
  }
  if (input?.fileId) {
    filters.push('ej.file_id = ?')
    params.push(input.fileId)
  }

  return db.prepare(
    `select
      ej.id as id,
      ej.file_id as fileId,
      vf.file_name as fileName,
      ej.enhancer_type as enhancerType,
      ej.provider as provider,
      ej.model as model,
      ej.status as status,
      ej.attempt_count as attemptCount,
      ej.error_message as errorMessage,
      ej.started_at as startedAt,
      ej.finished_at as finishedAt,
      ej.created_at as createdAt,
      ej.updated_at as updatedAt
     from enrichment_jobs ej
     join vault_files vf on vf.id = ej.file_id
     where ${filters.join(' and ')}
     order by ej.created_at desc, ej.id desc`
  ).all(...params) as Array<{
    id: string
    fileId: string
    fileName: string
    enhancerType: string
    provider: string
    model: string
    status: string
    attemptCount: number
    errorMessage: string | null
    startedAt: string | null
    finishedAt: string | null
    createdAt: string
    updatedAt: string
  }>
}

export function listStructuredFieldCandidates(db: ArchiveDatabase, input?: {
  fileId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'undone'
}) {
  const filters = ['1 = 1']
  const params = [] as Array<string>

  if (input?.fileId) {
    filters.push('sfc.file_id = ?')
    params.push(input.fileId)
  }
  if (input?.status) {
    filters.push('sfc.status = ?')
    params.push(input.status)
  }

  const rows = db.prepare(
    `select
      sfc.id as id,
      sfc.file_id as fileId,
      sfc.job_id as jobId,
      sfc.field_type as fieldType,
      sfc.field_key as fieldKey,
      sfc.field_value_json as fieldValueJson,
      sfc.document_type as documentType,
      sfc.confidence as confidence,
      sfc.risk_level as riskLevel,
      sfc.source_page as sourcePage,
      sfc.status as status,
      sfc.created_at as createdAt,
      sfc.reviewed_at as reviewedAt,
      sfc.review_note as reviewNote,
      rq.id as queueItemId
     from structured_field_candidates sfc
     left join review_queue rq
       on rq.candidate_id = sfc.id
      and rq.item_type = 'structured_field_candidate'
     where ${filters.join(' and ')}
     order by sfc.created_at desc, sfc.id desc`
  ).all(...params) as Array<{
    id: string
    fileId: string
    jobId: string
    fieldType: string
    fieldKey: string
    fieldValueJson: string
    documentType: string
    confidence: number
    riskLevel: string
    sourcePage: number | null
    status: string
    createdAt: string
    reviewedAt: string | null
    reviewNote: string | null
    queueItemId: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    fileId: row.fileId,
    jobId: row.jobId,
    fieldType: row.fieldType,
    fieldKey: row.fieldKey,
    fieldValue: parseJson<{ value?: string }>(row.fieldValueJson).value ?? '',
    documentType: row.documentType,
    confidence: row.confidence,
    riskLevel: row.riskLevel,
    sourcePage: row.sourcePage,
    status: row.status,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    queueItemId: row.queueItemId
  }))
}

export function listProviderEgressArtifacts(db: ArchiveDatabase, input: { jobId: string }) {
  const artifactRows = db.prepare(
    `select
      pea.id as artifactId,
      pea.job_id as jobId,
      pea.file_id as fileId,
      vf.file_name as fileName,
      pea.provider as provider,
      pea.model as model,
      pea.enhancer_type as enhancerType,
      pea.policy_key as policyKey,
      pea.request_hash as requestHash,
      pea.redaction_summary_json as redactionSummaryJson,
      pea.created_at as createdAt
     from provider_egress_artifacts pea
     join vault_files vf on vf.id = pea.file_id
     where pea.job_id = ?
     order by pea.created_at desc, pea.id desc`
  ).all(input.jobId) as Array<{
    artifactId: string
    jobId: string
    fileId: string
    fileName: string
    provider: string
    model: string
    enhancerType: string
    policyKey: string
    requestHash: string
    redactionSummaryJson: string
    createdAt: string
  }>

  return artifactRows.map((row) => ({
    artifactId: row.artifactId,
    jobId: row.jobId,
    fileId: row.fileId,
    fileName: row.fileName,
    provider: row.provider,
    model: row.model,
    enhancerType: row.enhancerType,
    policyKey: row.policyKey,
    requestHash: row.requestHash,
    redactionSummary: parseJson<Record<string, unknown>>(row.redactionSummaryJson),
    createdAt: row.createdAt,
    events: (db.prepare(
      `select
        id,
        event_type as eventType,
        payload_json as payloadJson,
        created_at as createdAt
       from provider_egress_events
       where artifact_id = ?
       order by created_at asc, id asc`
    ).all(row.artifactId) as Array<{
      id: string
      eventType: 'request' | 'response' | 'error'
      payloadJson: string
      createdAt: string
    }>).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      payload: parseJson<Record<string, unknown>>(event.payloadJson),
      createdAt: event.createdAt
    }))
  }))
}

export function getDocumentEvidence(db: ArchiveDatabase, input: { fileId: string }) {
  const file = db.prepare(
    `select id, file_name as fileName
     from vault_files
     where id = ?`
  ).get(input.fileId) as {
    id: string
    fileName: string
  } | undefined

  if (!file) {
    return null
  }

  const artifactRows = db.prepare(
    `select
      ea.artifact_type as artifactType,
      ea.payload_json as payloadJson
     from enrichment_artifacts ea
     join enrichment_jobs ej on ej.id = ea.job_id
     where ej.file_id = ?
     order by ea.created_at desc, ea.id desc`
  ).all(input.fileId) as Array<{
    artifactType: string
    payloadJson: string
  }>

  const approvedFields = loadApprovedEnrichmentIndex(db, { fileIds: [input.fileId] }).get(input.fileId)?.approvedFields ?? []
  const fieldCandidates = listStructuredFieldCandidates(db, { fileId: input.fileId })

  const rawTextArtifact = artifactRows.find((row) => row.artifactType === 'ocr_raw_text')
  const layoutArtifact = artifactRows.find((row) => row.artifactType === 'ocr_layout_blocks')

  const fallbackRawText = db.prepare(
    `select payload_json as payloadJson
     from enriched_evidence
     where file_id = ? and evidence_type = ? and status = 'approved'
     order by created_at desc limit 1`
  ).get(input.fileId, 'document_raw_text') as { payloadJson: string } | undefined
  const fallbackLayout = db.prepare(
    `select payload_json as payloadJson
     from enriched_evidence
     where file_id = ? and evidence_type = ? and status = 'approved'
     order by created_at desc limit 1`
  ).get(input.fileId, 'document_layout_blocks') as { payloadJson: string } | undefined

  const rawText = rawTextArtifact
    ? parseJson<{ rawText?: string }>(rawTextArtifact.payloadJson).rawText ?? ''
    : parseJson<{ rawText?: string }>(fallbackRawText?.payloadJson ?? '{}').rawText ?? ''
  const layoutBlocks = layoutArtifact
    ? parseJson<{ layoutBlocks?: Array<{ page: number; text: string; bbox?: number[] }> }>(layoutArtifact.payloadJson).layoutBlocks ?? []
    : parseJson<{ layoutBlocks?: Array<{ page: number; text: string; bbox?: number[] }> }>(fallbackLayout?.payloadJson ?? '{}').layoutBlocks ?? []

  return {
    fileId: file.id,
    fileName: file.fileName,
    rawText,
    layoutBlocks,
    approvedFields,
    fieldCandidates
  }
}

export function rerunEnrichmentJob(db: ArchiveDatabase, input: { jobId: string }) {
  const existing = db.prepare(
    `select
      id,
      file_id as fileId,
      enhancer_type as enhancerType,
      provider,
      model,
      input_hash as inputHash
     from enrichment_jobs
     where id = ?`
  ).get(input.jobId) as {
    id: string
    fileId: string
    enhancerType: string
    provider: string
    model: string
    inputHash: string | null
  } | undefined

  if (!existing) {
    throw new Error(`Enrichment job not found: ${input.jobId}`)
  }

  const createdAt = new Date().toISOString()
  const jobId = crypto.randomUUID()

  db.prepare(
    `insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count,
      input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jobId,
    existing.fileId,
    existing.enhancerType,
    existing.provider,
    existing.model,
    'pending',
    0,
    existing.inputHash,
    null,
    null,
    null,
    '{}',
    createdAt,
    createdAt
  )

  return listEnrichmentJobs(db, { fileId: existing.fileId }).find((job) => job.id === jobId) ?? null
}
