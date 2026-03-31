import type {
  ApprovedDraftProviderSendAttemptKind,
  ApprovedPersonaDraftProviderSendArtifact,
  RetryApprovedPersonaDraftProviderSendInput,
  SendApprovedPersonaDraftToProviderInput,
  SendApprovedPersonaDraftToProviderResult
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getApprovedDraftSendDestination } from './approvedDraftSendDestinationService'
import {
  APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY,
  cancelPendingApprovedDraftProviderSendRetryJob,
  deriveBackgroundRetryState,
  enqueueApprovedDraftProviderSendRetryJob,
  getLatestApprovedDraftProviderSendEventType,
  persistApprovedDraftProviderSendEvent,
  persistApprovedDraftProviderSendRequest
} from './approvedDraftProviderSendPersistenceService'
import { appendDecisionJournal } from './journalService'
import type { ModelRoute } from './modelGatewayService'
import { callLiteLLM, resolveModelRoute } from './modelGatewayService'
import { buildApprovedPersonaDraftHandoffArtifact } from './personaDraftHandoffService'

const LOCAL_ACTOR = 'local-user'
let approvedDraftProviderSendFixtureFailureConsumed = false

type ApprovedDraftProviderSendRequest = {
  draftReviewId: string
  sourceTurnId: string
  route: ModelRoute
  destinationId: string
  destinationLabel: string
  policyKey: typeof APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY
  requestEnvelope: {
    requestShape: 'approved_persona_draft_handoff_artifact'
    policyKey: typeof APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY
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

function notBefore(base: string, candidate?: string) {
  if (!candidate || candidate.localeCompare(base) < 0) {
    return new Date().toISOString()
  }

  return candidate
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
    policyKey: APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY,
    requestEnvelope: {
      requestShape: 'approved_persona_draft_handoff_artifact',
      policyKey: APPROVED_DRAFT_PROVIDER_SEND_POLICY_KEY,
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
