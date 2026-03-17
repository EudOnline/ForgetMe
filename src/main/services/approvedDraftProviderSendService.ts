import crypto from 'node:crypto'
import type {
  ApprovedDraftProviderSendAttemptKind,
  ApprovedDraftProviderSendBackgroundRetry,
  ApprovedDraftProviderSendBackgroundRetryStatus,
  ApprovedPersonaDraftProviderSendArtifact,
  RetryApprovedPersonaDraftProviderSendInput,
  SendApprovedPersonaDraftToProviderInput,
  SendApprovedPersonaDraftToProviderResult
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getApprovedDraftSendDestination } from './approvedDraftSendDestinationService'
import { appendDecisionJournal } from './journalService'
import type { ModelRoute } from './modelGatewayService'
import { callLiteLLM, resolveModelRoute } from './modelGatewayService'
import { buildApprovedPersonaDraftHandoffArtifact } from './personaDraftHandoffService'

const POLICY_ID = 'rp-persona-draft-remote-send-approved'
const POLICY_KEY = 'persona_draft.remote_send_approved'
const LOCAL_ACTOR = 'local-user'
const DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS = 30_000
const DEFAULT_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS = 3
let approvedDraftProviderSendFixtureFailureConsumed = false

type ApprovedDraftProviderSendRequest = {
  draftReviewId: string
  sourceTurnId: string
  route: ModelRoute
  destinationId: string
  destinationLabel: string
  policyKey: typeof POLICY_KEY
  requestEnvelope: {
    requestShape: 'approved_persona_draft_handoff_artifact'
    policyKey: typeof POLICY_KEY
    handoffArtifact: NonNullable<ReturnType<typeof buildApprovedPersonaDraftHandoffArtifact>>
  }
  redactionSummary: {
    requestShape: 'approved_persona_draft_handoff_artifact'
    sourceArtifact: 'approved_persona_draft_handoff'
    removedFields: []
  }
}

type ProviderSendResult = {
  provider: string
  model: string
  usage: Record<string, unknown> | null
  receivedAt: string
  payload: Record<string, unknown>
}

type ApprovedDraftProviderSendAttemptMetadata = {
  attemptKind: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId: string | null
}

type ApprovedDraftProviderSendRetryJobStatus = Exclude<ApprovedDraftProviderSendBackgroundRetryStatus, 'exhausted'>

type ApprovedDraftProviderSendRetryJobRow = {
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

function notBefore(base: string, candidate?: string) {
  if (!candidate || candidate.localeCompare(base) < 0) {
    return new Date().toISOString()
  }

  return candidate
}

function plusDelay(base: string, delayMs: number) {
  const parsed = Date.parse(base)
  if (Number.isNaN(parsed)) {
    return new Date(Date.now() + delayMs).toISOString()
  }

  return new Date(parsed + delayMs).toISOString()
}

function resolveApprovedDraftSendRoute(destinationId?: string) {
  const destination = getApprovedDraftSendDestination(destinationId)

  if (destination.resolutionMode === 'memory_dialogue_default') {
    return {
      destination,
      route: resolveModelRoute({
        taskType: 'memory_dialogue'
      })
    }
  }

  const route = resolveModelRoute({
    taskType: 'memory_dialogue',
    preferredProvider: destination.provider
  })

  return {
    destination,
    route: {
      ...route,
      model: destination.model
    }
  }
}

function resolveAttemptMetadata(input: {
  attemptKind?: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId?: string | null
}): ApprovedDraftProviderSendAttemptMetadata {
  return {
    attemptKind: input.attemptKind ?? 'initial_send',
    retryOfArtifactId: input.retryOfArtifactId ?? null
  }
}

function ensureApprovedDraftSendPolicy(db: ArchiveDatabase, createdAt: string) {
  db.prepare(`insert or ignore into redaction_policies (
    id, policy_key, enhancer_type, status, rules_json, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?)`).run(
    POLICY_ID,
    POLICY_KEY,
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

async function defaultCallModel(input: {
  route: ModelRoute
  requestEnvelope: ApprovedDraftProviderSendRequest['requestEnvelope']
}): Promise<ProviderSendResult> {
  const shouldUseFixture = process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE === '1'
  const shouldFailOnce = process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE === '1'

  if (!shouldUseFixture || !shouldFailOnce) {
    approvedDraftProviderSendFixtureFailureConsumed = false
  }

  if (shouldUseFixture) {
    if (shouldFailOnce && !approvedDraftProviderSendFixtureFailureConsumed) {
      approvedDraftProviderSendFixtureFailureConsumed = true
      throw new Error('provider fixture offline')
    }

    return {
      provider: input.route.provider,
      model: input.route.model,
      usage: { fixture: true },
      receivedAt: new Date().toISOString(),
      payload: {
        choices: [{
          message: {
            content: JSON.stringify({
              acknowledgement: 'received',
              summary: 'approved draft recorded'
            })
          }
        }]
      }
    }
  }

  return callLiteLLM({
    route: input.route,
    messages: [
      {
        role: 'system',
        content: 'Return JSON only. Acknowledge receipt of the approved persona draft handoff artifact without claiming to be the archived person.'
      },
      {
        role: 'user',
        content: JSON.stringify(input.requestEnvelope)
      }
    ],
    responseFormat: { type: 'json_object' }
  })
}

function persistApprovedDraftProviderSendRequest(db: ArchiveDatabase, input: {
  draftReviewId: string
  sourceTurnId: string
  provider: string
  model: string
  destinationId: string
  destinationLabel: string
  attemptKind: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId: string | null
  policyKey: typeof POLICY_KEY
  requestEnvelope: ApprovedDraftProviderSendRequest['requestEnvelope']
  redactionSummary: ApprovedDraftProviderSendRequest['redactionSummary']
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

function persistApprovedDraftProviderSendEvent(db: ArchiveDatabase, input: {
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

function getLatestApprovedDraftProviderSendEventType(db: ArchiveDatabase, artifactId: string) {
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

function readApprovedDraftProviderSendRetryJob(
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

function countAutomaticRetryAttemptsInLineage(db: ArchiveDatabase, artifactId: string) {
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

function enqueueApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, input: {
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

function cancelPendingApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, failedArtifactId: string) {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update persona_draft_provider_send_retry_jobs
     set status = ?,
         updated_at = ?
     where failed_artifact_id = ?
       and status = 'pending'`
  ).run('cancelled', updatedAt, failedArtifactId)
}

function deriveBackgroundRetryState(
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

export function buildApprovedPersonaDraftProviderSendRequest(
  db: ArchiveDatabase,
  input: SendApprovedPersonaDraftToProviderInput
): ApprovedDraftProviderSendRequest | null {
  const handoffArtifact = buildApprovedPersonaDraftHandoffArtifact(db, {
    draftReviewId: input.draftReviewId
  })

  if (!handoffArtifact) {
    return null
  }

  const { destination, route } = resolveApprovedDraftSendRoute(input.destinationId)

  return {
    draftReviewId: input.draftReviewId,
    sourceTurnId: handoffArtifact.sourceTurnId,
    route,
    destinationId: destination.destinationId,
    destinationLabel: destination.label,
    policyKey: POLICY_KEY,
    requestEnvelope: {
      requestShape: 'approved_persona_draft_handoff_artifact',
      policyKey: POLICY_KEY,
      handoffArtifact
    },
    redactionSummary: {
      requestShape: 'approved_persona_draft_handoff_artifact',
      sourceArtifact: 'approved_persona_draft_handoff',
      removedFields: []
    }
  }
}

export async function sendApprovedPersonaDraftToProvider(
  db: ArchiveDatabase,
  input: SendApprovedPersonaDraftToProviderInput & {
    attemptKind?: ApprovedDraftProviderSendAttemptKind
    retryOfArtifactId?: string | null
    callModel?: (input: {
      route: ModelRoute
      requestEnvelope: ApprovedDraftProviderSendRequest['requestEnvelope']
    }) => Promise<ProviderSendResult>
  }
): Promise<SendApprovedPersonaDraftToProviderResult | null> {
  const request = buildApprovedPersonaDraftProviderSendRequest(db, input)
  if (!request) {
    return null
  }

  const attempt = resolveAttemptMetadata(input)
  const callModel = input.callModel ?? defaultCallModel
  const persisted = persistApprovedDraftProviderSendRequest(db, {
    draftReviewId: request.draftReviewId,
    sourceTurnId: request.sourceTurnId,
    provider: request.route.provider,
    model: request.route.model,
    destinationId: request.destinationId,
    destinationLabel: request.destinationLabel,
    attemptKind: attempt.attemptKind,
    retryOfArtifactId: attempt.retryOfArtifactId,
    policyKey: request.policyKey,
    requestEnvelope: request.requestEnvelope,
    redactionSummary: request.redactionSummary
  })

  try {
    const result = await callModel({
      route: request.route,
      requestEnvelope: request.requestEnvelope
    })

    persistApprovedDraftProviderSendEvent(db, {
      artifactId: persisted.artifactId,
      eventType: 'response',
      payload: result.payload,
      createdAt: notBefore(persisted.createdAt, result.receivedAt)
    })

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      targetId: request.draftReviewId,
      operationPayload: {
        draftReviewId: request.draftReviewId,
        sourceTurnId: request.sourceTurnId,
        providerSendArtifactId: persisted.artifactId,
        provider: request.route.provider,
        model: request.route.model,
        policyKey: request.policyKey,
        destinationId: request.destinationId,
        destinationLabel: request.destinationLabel,
        attemptKind: attempt.attemptKind,
        retryOfArtifactId: attempt.retryOfArtifactId,
        requestHash: persisted.requestHash,
        handoffKind: 'provider_boundary_send',
        sentAt: persisted.createdAt
      },
      undoPayload: {},
      actor: LOCAL_ACTOR
    })

    return {
      status: 'responded',
      artifactId: persisted.artifactId,
      draftReviewId: request.draftReviewId,
      sourceTurnId: request.sourceTurnId,
      provider: request.route.provider,
      model: request.route.model,
      policyKey: request.policyKey,
      requestHash: persisted.requestHash,
      destinationId: request.destinationId,
      destinationLabel: request.destinationLabel,
      attemptKind: attempt.attemptKind,
      retryOfArtifactId: attempt.retryOfArtifactId,
      createdAt: persisted.createdAt
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failedAt = notBefore(persisted.createdAt)

    persistApprovedDraftProviderSendEvent(db, {
      artifactId: persisted.artifactId,
      eventType: 'error',
      payload: {
        message: errorMessage
      },
      createdAt: failedAt
    })

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      targetId: request.draftReviewId,
      operationPayload: {
        draftReviewId: request.draftReviewId,
        sourceTurnId: request.sourceTurnId,
        providerSendArtifactId: persisted.artifactId,
        provider: request.route.provider,
        model: request.route.model,
        policyKey: request.policyKey,
        destinationId: request.destinationId,
        destinationLabel: request.destinationLabel,
        attemptKind: attempt.attemptKind,
        retryOfArtifactId: attempt.retryOfArtifactId,
        requestHash: persisted.requestHash,
        handoffKind: 'provider_boundary_send',
        errorMessage,
        failedAt
      },
      undoPayload: {},
      actor: LOCAL_ACTOR
    })

    enqueueApprovedDraftProviderSendRetryJob(db, {
      failedArtifactId: persisted.artifactId,
      draftReviewId: request.draftReviewId,
      sourceTurnId: request.sourceTurnId,
      destinationId: request.destinationId,
      destinationLabel: request.destinationLabel,
      failedAt
    })

    throw error
  }
}

export async function retryApprovedPersonaDraftProviderSend(
  db: ArchiveDatabase,
  input: RetryApprovedPersonaDraftProviderSendInput & {
    attemptKind?: ApprovedDraftProviderSendAttemptKind
    callModel?: (input: {
      route: ModelRoute
      requestEnvelope: ApprovedDraftProviderSendRequest['requestEnvelope']
    }) => Promise<ProviderSendResult>
  }
): Promise<SendApprovedPersonaDraftToProviderResult | null> {
  const artifact = db.prepare(
    `select
      id as artifactId,
      draft_review_id as draftReviewId,
      destination_id as destinationId
     from persona_draft_provider_egress_artifacts
     where id = ?`
  ).get(input.artifactId) as {
    artifactId: string
    draftReviewId: string
    destinationId: string | null
  } | undefined

  if (!artifact) {
    return null
  }

  const latestEvent = getLatestApprovedDraftProviderSendEventType(db, input.artifactId)

  if (latestEvent?.eventType !== 'error') {
    return null
  }

  cancelPendingApprovedDraftProviderSendRetryJob(db, artifact.artifactId)

  return sendApprovedPersonaDraftToProvider(db, {
    draftReviewId: artifact.draftReviewId,
    destinationId: artifact.destinationId ?? undefined,
    attemptKind: input.attemptKind ?? 'manual_retry',
    retryOfArtifactId: artifact.artifactId,
    callModel: input.callModel
  })
}

export function listApprovedPersonaDraftProviderSends(
  db: ArchiveDatabase,
  input: { draftReviewId: string }
): ApprovedPersonaDraftProviderSendArtifact[] {
  const artifactRows = db.prepare(
    `select
      id as artifactId,
      draft_review_id as draftReviewId,
      source_turn_id as sourceTurnId,
      provider,
      model,
      policy_key as policyKey,
      request_hash as requestHash,
      destination_id as destinationId,
      destination_label as destinationLabel,
      attempt_kind as attemptKind,
      retry_of_artifact_id as retryOfArtifactId,
      redaction_summary_json as redactionSummaryJson,
      created_at as createdAt
     from persona_draft_provider_egress_artifacts
     where draft_review_id = ?
     order by created_at desc, rowid desc`
  ).all(input.draftReviewId) as Array<{
    artifactId: string
    draftReviewId: string
    sourceTurnId: string
    provider: string
    model: string
    policyKey: string
    requestHash: string
    destinationId: string | null
    destinationLabel: string | null
    attemptKind: ApprovedDraftProviderSendAttemptKind | null
    retryOfArtifactId: string | null
    redactionSummaryJson: string
    createdAt: string
  }>

  return artifactRows.map((row) => {
    const destination = row.destinationId
      ? getApprovedDraftSendDestination(row.destinationId)
      : getApprovedDraftSendDestination()
    const events = (db.prepare(
      `select
        id,
        event_type as eventType,
        payload_json as payloadJson,
        created_at as createdAt
       from persona_draft_provider_egress_events
       where artifact_id = ?
       order by created_at asc, rowid asc`
    ).all(row.artifactId) as Array<{
      id: string
      eventType: 'request' | 'response' | 'error'
      payloadJson: string
      createdAt: string
    }>).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      payload: JSON.parse(event.payloadJson) as Record<string, unknown>,
      createdAt: event.createdAt
    }))
    const latestEventType = events[events.length - 1]?.eventType ?? null

    return {
      artifactId: row.artifactId,
      draftReviewId: row.draftReviewId,
      sourceTurnId: row.sourceTurnId,
      provider: row.provider,
      model: row.model,
      policyKey: row.policyKey,
      requestHash: row.requestHash,
      destinationId: row.destinationId ?? destination.destinationId,
      destinationLabel: row.destinationLabel ?? destination.label,
      attemptKind: row.attemptKind ?? 'initial_send',
      retryOfArtifactId: row.retryOfArtifactId ?? null,
      backgroundRetry: deriveBackgroundRetryState(db, row.artifactId, latestEventType),
      redactionSummary: JSON.parse(row.redactionSummaryJson) as Record<string, unknown>,
      createdAt: row.createdAt,
      events
    }
  })
}
