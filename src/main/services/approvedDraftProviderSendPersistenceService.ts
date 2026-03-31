import crypto from 'node:crypto'
import type {
  ApprovedDraftProviderSendAttemptKind,
  ApprovedDraftProviderSendBackgroundRetry,
  ApprovedDraftProviderSendBackgroundRetryStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

const POLICY_ID = 'rp-persona-draft-remote-send-approved'
export const APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY = 'persona_draft.remote_send_approved'
const DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS = 30_000
const DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS = 3

type ApprovedDraftProviderSendRetryJobStatus = Exclude<ApprovedDraftProviderSendBackgroundRetryStatus, 'exhausted'>

export type ApprovedDraftProviderSendRetryJobRow = {
  failedArtifactId: string
  status: ApprovedDraftProviderSendRetryJobStatus
  autoRetryAttemptIndex: number
  nextRetryAt: string
  claimedAt: string | null
  retryArtifactId: string | null
  lastErrorMessage: string | null
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function approvedDraftSendAutoRetryDelayMs() {
  return parsePositiveInteger(
    process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS,
    DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS
  )
}

function approvedDraftSendAutoRetryMaxAttempts() {
  return parsePositiveInteger(
    process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS,
    DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS
  )
}

function sha256Json(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function plusDelay(base: string, delayMs: number) {
  const parsed = Date.parse(base)
  if (Number.isNaN(parsed)) {
    return new Date(Date.now() + delayMs).toISOString()
  }

  return new Date(parsed + delayMs).toISOString()
}

function ensureApprovedDraftSendPolicy(db: ArchiveDatabase, createdAt: string) {
  db.prepare(`insert or ignore into redaction_policies (
    id, policy_key, enhancer_type, status, rules_json, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?)`).run(
    POLICY_ID,
    APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY,
    'persona_draft_send',
    'active',
    JSON.stringify({
      requestShape: 'approved_persona_draft_handoff_artifact',
      sourceArtifact: 'approved_persona_draft_handoff',
      removedFields: []
    }),
    createdAt,
    createdAt
  )
}

export function persistApprovedDraftProviderSendRequest(db: ArchiveDatabase, input: {
  draftReviewId: string
  sourceTurnId: string
  provider: string
  model: string
  destinationId: string
  destinationLabel: string
  attemptKind: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId: string | null
  policyKey: string
  requestEnvelope: Record<string, unknown>
  redactionSummary: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  ensureApprovedDraftSendPolicy(db, createdAt)

  const artifactId = crypto.randomUUID()
  const requestHash = sha256Json(input.requestEnvelope)

  db.prepare(`insert into persona_draft_provider_egress_artifacts (
    id, draft_review_id, source_turn_id, provider, model, policy_key, request_hash, destination_id, destination_label, attempt_kind, retry_of_artifact_id, redaction_summary_json, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    artifactId,
    input.draftReviewId,
    input.sourceTurnId,
    input.provider,
    input.model,
    input.policyKey,
    requestHash,
    input.destinationId,
    input.destinationLabel,
    input.attemptKind,
    input.retryOfArtifactId,
    JSON.stringify(input.redactionSummary),
    createdAt
  )

  db.prepare(`insert into persona_draft_provider_egress_events (
    id, artifact_id, event_type, payload_json, created_at
  ) values (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(),
    artifactId,
    'request',
    JSON.stringify(input.requestEnvelope),
    createdAt
  )

  return {
    artifactId,
    requestHash,
    createdAt
  }
}

export function persistApprovedDraftProviderSendEvent(db: ArchiveDatabase, input: {
  artifactId: string
  eventType: 'response' | 'error'
  payload: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  db.prepare(`insert into persona_draft_provider_egress_events (
    id, artifact_id, event_type, payload_json, created_at
  ) values (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(),
    input.artifactId,
    input.eventType,
    JSON.stringify(input.payload),
    createdAt
  )
}

export function getLatestApprovedDraftProviderSendEventType(db: ArchiveDatabase, artifactId: string) {
  return db.prepare(
    `select event_type as eventType
     from persona_draft_provider_egress_events
     where artifact_id = ?
     order by created_at desc, rowid desc
     limit 1`
  ).get(artifactId) as {
    eventType: 'request' | 'response' | 'error'
  } | undefined
}

export function readApprovedDraftProviderSendRetryJob(
  db: ArchiveDatabase,
  failedArtifactId: string
): ApprovedDraftProviderSendRetryJobRow | null {
  const row = db.prepare(
    `select
      failed_artifact_id as failedArtifactId,
      status,
      auto_retry_attempt_index as autoRetryAttemptIndex,
      next_retry_at as nextRetryAt,
      claimed_at as claimedAt,
      retry_artifact_id as retryArtifactId,
      last_error_message as lastErrorMessage
     from persona_draft_provider_send_retry_jobs
     where failed_artifact_id = ?`
  ).get(failedArtifactId) as ApprovedDraftProviderSendRetryJobRow | undefined

  return row ?? null
}

export function countAutomaticRetryAttemptsInLineage(db: ArchiveDatabase, artifactId: string) {
  let count = 0
  let currentArtifactId: string | null = artifactId

  while (currentArtifactId) {
    const row = db.prepare(
      `select
        attempt_kind as attemptKind,
        retry_of_artifact_id as retryOfArtifactId
       from persona_draft_provider_egress_artifacts
       where id = ?`
    ).get(currentArtifactId) as {
      attemptKind: ApprovedDraftProviderSendAttemptKind | null
      retryOfArtifactId: string | null
    } | undefined

    if (!row) {
      break
    }

    if (row.attemptKind === 'automatic_retry') {
      count += 1
    }

    currentArtifactId = row.retryOfArtifactId
  }

  return count
}

function hasRetryChildArtifact(db: ArchiveDatabase, artifactId: string) {
  const row = db.prepare(
    `select id
     from persona_draft_provider_egress_artifacts
     where retry_of_artifact_id = ?
     limit 1`
  ).get(artifactId) as {
    id: string
  } | undefined

  return Boolean(row)
}

export function enqueueApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, input: {
  failedArtifactId: string
  draftReviewId: string
  sourceTurnId: string
  destinationId: string
  destinationLabel: string
  failedAt: string
}) {
  if (hasRetryChildArtifact(db, input.failedArtifactId)) {
    return null
  }

  const existingJob = readApprovedDraftProviderSendRetryJob(db, input.failedArtifactId)
  if (existingJob) {
    return existingJob
  }

  const automaticRetryCount = countAutomaticRetryAttemptsInLineage(db, input.failedArtifactId)
  const maxAutoRetryAttempts = approvedDraftSendAutoRetryMaxAttempts()
  if (automaticRetryCount >= maxAutoRetryAttempts) {
    return null
  }

  const createdAt = new Date().toISOString()
  db.prepare(
    `insert into persona_draft_provider_send_retry_jobs (
      id,
      failed_artifact_id,
      draft_review_id,
      source_turn_id,
      destination_id,
      destination_label,
      status,
      auto_retry_attempt_index,
      next_retry_at,
      claimed_at,
      retry_artifact_id,
      last_error_message,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    input.failedArtifactId,
    input.draftReviewId,
    input.sourceTurnId,
    input.destinationId,
    input.destinationLabel,
    'pending',
    automaticRetryCount + 1,
    plusDelay(input.failedAt, approvedDraftSendAutoRetryDelayMs()),
    null,
    null,
    null,
    createdAt,
    createdAt
  )

  return readApprovedDraftProviderSendRetryJob(db, input.failedArtifactId)
}

export function cancelPendingApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, failedArtifactId: string) {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update persona_draft_provider_send_retry_jobs
     set status = ?,
         updated_at = ?
     where failed_artifact_id = ?
       and status = 'pending'`
  ).run('cancelled', updatedAt, failedArtifactId)
}

export function deriveBackgroundRetryState(
  db: ArchiveDatabase,
  artifactId: string,
  latestEventType: 'request' | 'response' | 'error' | null
): ApprovedDraftProviderSendBackgroundRetry | null {
  const retryJob = readApprovedDraftProviderSendRetryJob(db, artifactId)
  const maxAutoRetryAttempts = approvedDraftSendAutoRetryMaxAttempts()

  if (retryJob) {
    return {
      status: retryJob.status,
      autoRetryAttemptIndex: retryJob.autoRetryAttemptIndex,
      maxAutoRetryAttempts,
      nextRetryAt: retryJob.nextRetryAt,
      claimedAt: retryJob.claimedAt
    }
  }

  if (latestEventType !== 'error') {
    return null
  }

  const automaticRetryCount = countAutomaticRetryAttemptsInLineage(db, artifactId)
  if (automaticRetryCount < maxAutoRetryAttempts) {
    return null
  }

  return {
    status: 'exhausted',
    autoRetryAttemptIndex: automaticRetryCount,
    maxAutoRetryAttempts,
    nextRetryAt: null,
    claimedAt: null
  }
}
