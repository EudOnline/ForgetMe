import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

export type ProviderBoundaryJob = {
  id: string
  fileId: string
  fileName: string
  frozenPath: string
  fileSha256: string
  extension: string | null
  mimeType: string | null
  enhancerType: 'document_ocr' | 'image_understanding' | 'chat_screenshot'
  provider: string
  model: string
}

function policyKeyFor(enhancerType: ProviderBoundaryJob['enhancerType']) {
  if (enhancerType === 'image_understanding') {
    return 'image_understanding.remote_baseline'
  }

  if (enhancerType === 'chat_screenshot') {
    return 'chat_screenshot.remote_baseline'
  }

  return 'document_ocr.remote_baseline'
}

function ensureBaselinePolicies(db: ArchiveDatabase, createdAt: string) {
  const policies = [
    { id: 'rp-document-ocr-remote-baseline', policyKey: 'document_ocr.remote_baseline', enhancerType: 'document_ocr' },
    { id: 'rp-image-understanding-remote-baseline', policyKey: 'image_understanding.remote_baseline', enhancerType: 'image_understanding' },
    { id: 'rp-chat-screenshot-remote-baseline', policyKey: 'chat_screenshot.remote_baseline', enhancerType: 'chat_screenshot' }
  ] as const

  for (const policy of policies) {
    db.prepare(`insert or ignore into redaction_policies (
      id, policy_key, enhancer_type, status, rules_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`).run(
      policy.id,
      policy.policyKey,
      policy.enhancerType,
      'active',
      JSON.stringify({
        removedFields: ['frozenPath'],
        requestShape: 'metadata_reference'
      }),
      createdAt,
      createdAt
    )
  }
}

function sha256Json(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function buildProviderBoundaryRequest(input: { job: ProviderBoundaryJob }) {
  const policyKey = policyKeyFor(input.job.enhancerType)
  const requestEnvelope = {
    enhancerType: input.job.enhancerType,
    fileRef: `vault://file/${input.job.fileId}`,
    fileId: input.job.fileId,
    fileName: input.job.fileName,
    sha256: input.job.fileSha256,
    extension: input.job.extension,
    mimeType: input.job.mimeType,
    provider: input.job.provider,
    model: input.job.model
  }

  return {
    job: input.job,
    policyKey,
    requestEnvelope,
    redactionSummary: {
      removedFields: ['frozenPath'],
      requestShape: 'metadata_reference'
    }
  }
}

export function persistProviderEgressRequest(db: ArchiveDatabase, input: {
  job: ProviderBoundaryJob
  policyKey: string
  requestEnvelope: Record<string, unknown>
  redactionSummary: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  ensureBaselinePolicies(db, createdAt)

  const artifactId = crypto.randomUUID()
  const requestHash = sha256Json(input.requestEnvelope)

  db.prepare(`insert into provider_egress_artifacts (
    id, job_id, file_id, provider, model, enhancer_type, policy_key, request_hash, redaction_summary_json, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    artifactId,
    input.job.id,
    input.job.fileId,
    input.job.provider,
    input.job.model,
    input.job.enhancerType,
    input.policyKey,
    requestHash,
    JSON.stringify(input.redactionSummary),
    createdAt
  )

  db.prepare('insert into provider_egress_events (id, artifact_id, event_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    artifactId,
    'request',
    JSON.stringify(input.requestEnvelope),
    createdAt
  )

  return artifactId
}

export function persistProviderEgressResponse(db: ArchiveDatabase, input: {
  artifactId: string
  payload: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  db.prepare('insert into provider_egress_events (id, artifact_id, event_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    input.artifactId,
    'response',
    JSON.stringify(input.payload),
    createdAt
  )
}

export function persistProviderEgressError(db: ArchiveDatabase, input: {
  artifactId: string
  payload: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  db.prepare('insert into provider_egress_events (id, artifact_id, event_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    input.artifactId,
    'error',
    JSON.stringify(input.payload),
    createdAt
  )
}
