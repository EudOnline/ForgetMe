import { afterEach, describe, expect, it, vi } from 'vitest'
import { listApprovedDraftSendDestinations } from '../../../src/main/services/approvedDraftSendDestinationService'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import * as modelGatewayService from '../../../src/main/services/modelGatewayService'
import {
  buildApprovedPersonaDraftProviderSendRequest,
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
} from '../../../src/main/services/approvedDraftProviderSendService'
import { createPersonaDraftReviewFromTurn } from '../../../src/main/services/memoryWorkspaceDraftReviewService'
import {
  seedApprovedPersonaDraftHandoffScenario,
  seedPersonaDraftReviewScenario
} from './helpers/memoryWorkspaceScenario'
import type { ArchiveDatabase } from '../../../src/main/services/db'

function listRetryJobs(db: ArchiveDatabase) {
  return db.prepare(
    `select
      failed_artifact_id as failedArtifactId,
      status,
      auto_retry_attempt_index as autoRetryAttemptIndex,
      next_retry_at as nextRetryAt,
      claimed_at as claimedAt,
      retry_artifact_id as retryArtifactId,
      last_error_message as lastErrorMessage
     from persona_draft_provider_send_retry_jobs
     order by created_at asc, rowid asc`
  ).all() as Array<{
    failedArtifactId: string
    status: string
    autoRetryAttemptIndex: number
    nextRetryAt: string
    claimedAt: string | null
    retryArtifactId: string | null
    lastErrorMessage: string | null
  }>
}

afterEach(() => {
  vi.useRealTimers()
  delete process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE
  delete process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE
  delete process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS
  delete process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS
  vi.restoreAllMocks()
})

describe('approvedDraftProviderSendService', () => {
  it('lists the built-in approved draft send destinations', () => {
    const destinations = listApprovedDraftSendDestinations()

    expect(destinations).toHaveLength(3)
    expect(destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        destinationId: 'memory-dialogue-default',
        label: 'Memory Dialogue Default',
        resolutionMode: 'memory_dialogue_default',
        isDefault: true
      }),
      expect.objectContaining({
        destinationId: 'siliconflow-qwen25-72b',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct'
      }),
      expect.objectContaining({
        destinationId: 'openrouter-qwen25-72b',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct'
      })
    ]))
  })

  it('returns null when the review is not approved', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, {
      turnId: sandboxTurn.turnId
    })

    const request = buildApprovedPersonaDraftProviderSendRequest(db, {
      draftReviewId: review!.draftReviewId
    })

    expect(review?.status).toBe('draft')
    expect(request).toBeNull()

    db.close()
  })

  it('builds a boundary request envelope from the approved handoff artifact', () => {
    const { db, approvedReview, sandboxTurn } = seedApprovedPersonaDraftHandoffScenario()

    const request = buildApprovedPersonaDraftProviderSendRequest(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(request?.policyKey).toBe('persona_draft.remote_send_approved')
    expect(request?.route.provider).toBe('siliconflow')
    expect(request?.requestEnvelope.requestShape).toBe('approved_persona_draft_handoff_artifact')
    expect(request?.requestEnvelope.handoffArtifact.reviewStatus).toBe('approved')
    expect(request?.requestEnvelope.handoffArtifact.sourceTurnId).toBe(sandboxTurn.turnId)
    expect(request?.requestEnvelope.handoffArtifact.shareEnvelope).toEqual({
      requestShape: 'local_json_persona_draft_handoff',
      policyKey: 'persona_draft.local_export_approved'
    })
    expect(request?.redactionSummary).toEqual({
      requestShape: 'approved_persona_draft_handoff_artifact',
      sourceArtifact: 'approved_persona_draft_handoff',
      removedFields: []
    })

    db.close()
  })

  it('persists request and response events for a successful approved draft send', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T08:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const callModel = vi.fn().mockResolvedValue({
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      receivedAt: '2026-03-16T08:01:00.000Z',
      usage: { total_tokens: 12 },
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
    })

    const sent = await sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      callModel
    })
    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider'
    })

    expect(sent?.status).toBe('responded')
    expect(sent?.provider).toBe('siliconflow')
    expect(sent?.destinationId).toBe('memory-dialogue-default')
    expect(sent?.destinationLabel).toBe('Memory Dialogue Default')
    expect(sent?.attemptKind).toBe('initial_send')
    expect(sent?.retryOfArtifactId).toBeNull()
    expect(callModel).toHaveBeenCalledTimes(1)
    expect(history).toHaveLength(1)
    expect(history[0]?.policyKey).toBe('persona_draft.remote_send_approved')
    expect(history[0]?.destinationId).toBe('memory-dialogue-default')
    expect(history[0]?.destinationLabel).toBe('Memory Dialogue Default')
    expect(history[0]?.attemptKind).toBe('initial_send')
    expect(history[0]?.retryOfArtifactId).toBeNull()
    expect(history[0]?.events.map((event) => event.eventType)).toEqual(['request', 'response'])
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]).toMatchObject({
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      targetId: approvedReview.draftReviewId,
      operationPayload: {
        draftReviewId: approvedReview.draftReviewId,
        sourceTurnId: sent?.sourceTurnId,
        providerSendArtifactId: sent?.artifactId,
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        policyKey: 'persona_draft.remote_send_approved',
        destinationId: 'memory-dialogue-default',
        destinationLabel: 'Memory Dialogue Default',
        attemptKind: 'initial_send',
        retryOfArtifactId: null,
        requestHash: sent?.requestHash,
        sentAt: '2026-03-16T08:00:00.000Z'
      }
    })

    db.close()
  })

  it('persists an error event when the provider send fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T08:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const callModel = vi.fn().mockRejectedValue(new Error('provider offline'))

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      callModel
    })).rejects.toThrow('provider offline')

    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    const retryJobs = listRetryJobs(db)
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider_failed'
    })

    expect(history).toHaveLength(1)
    expect(history[0]?.attemptKind).toBe('initial_send')
    expect(history[0]?.retryOfArtifactId).toBeNull()
    expect(history[0]?.backgroundRetry).toMatchObject({
      status: 'pending',
      autoRetryAttemptIndex: 1,
      maxAutoRetryAttempts: 3,
      nextRetryAt: '2026-03-16T08:00:30.000Z',
      claimedAt: null
    })
    expect(history[0]?.events.map((event) => event.eventType)).toEqual(['request', 'error'])
    expect(retryJobs).toEqual([
      expect.objectContaining({
        failedArtifactId: history[0]?.artifactId,
        status: 'pending',
        autoRetryAttemptIndex: 1,
        nextRetryAt: '2026-03-16T08:00:30.000Z',
        claimedAt: null,
        retryArtifactId: null
      })
    ])
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]).toMatchObject({
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      targetId: approvedReview.draftReviewId,
      operationPayload: {
        draftReviewId: approvedReview.draftReviewId,
        sourceTurnId: history[0]?.sourceTurnId,
        providerSendArtifactId: history[0]?.artifactId,
        destinationId: 'memory-dialogue-default',
        destinationLabel: 'Memory Dialogue Default',
        attemptKind: 'initial_send',
        retryOfArtifactId: null,
        errorMessage: 'provider offline'
      }
    })

    db.close()
  })

  it('resolves an explicit OpenRouter destination and persists destination metadata', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T09:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const callModel = vi.fn().mockResolvedValue({
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      receivedAt: '2026-03-16T09:00:01.000Z',
      usage: { total_tokens: 18 },
      payload: {
        acknowledgement: 'received'
      }
    })

    const sent = await sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel
    })
    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      route: expect.objectContaining({
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct'
      })
    }))
    expect(sent).toMatchObject({
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct'
    })
    expect(history[0]).toMatchObject({
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct'
    })

    db.close()
  })

  it('retries a failed approved draft send by creating a new retry artifact with the same destination', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const initialFailure = vi.fn().mockRejectedValue(new Error('provider offline'))

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel: initialFailure
    })).rejects.toThrow('provider offline')

    const failedArtifact = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })[0]

    vi.setSystemTime(new Date('2026-03-16T10:05:00.000Z'))

    const retryCall = vi.fn().mockResolvedValue({
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      receivedAt: '2026-03-16T10:05:03.000Z',
      usage: { total_tokens: 15 },
      payload: {
        acknowledgement: 'received'
      }
    })

    const retried = await retryApprovedPersonaDraftProviderSend(db, {
      artifactId: failedArtifact!.artifactId,
      callModel: retryCall
    })
    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(retried).toMatchObject({
      artifactId: expect.any(String),
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      attemptKind: 'manual_retry',
      retryOfArtifactId: failedArtifact!.artifactId
    })
    expect(retryCall).toHaveBeenCalledTimes(1)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      artifactId: retried?.artifactId,
      destinationId: 'openrouter-qwen25-72b',
      attemptKind: 'manual_retry',
      retryOfArtifactId: failedArtifact!.artifactId,
      backgroundRetry: null,
      events: [
        expect.objectContaining({ eventType: 'request' }),
        expect.objectContaining({ eventType: 'response' })
      ]
    })
    expect(history[1]).toMatchObject({
      artifactId: failedArtifact!.artifactId,
      destinationId: 'openrouter-qwen25-72b',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      events: [
        expect.objectContaining({ eventType: 'request' }),
        expect.objectContaining({ eventType: 'error' })
      ]
    })
    expect(listRetryJobs(db)).toEqual([
      expect.objectContaining({
        failedArtifactId: failedArtifact!.artifactId,
        status: 'cancelled'
      })
    ])

    db.close()
  })

  it('enqueues the next automatic retry after an automatic retry failure', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS = '2'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel: vi.fn().mockRejectedValue(new Error('initial failure'))
    })).rejects.toThrow('initial failure')

    const firstFailedArtifact = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })[0]

    vi.setSystemTime(new Date('2026-03-16T12:05:00.000Z'))

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      attemptKind: 'automatic_retry',
      retryOfArtifactId: firstFailedArtifact!.artifactId,
      callModel: vi.fn().mockRejectedValue(new Error('automatic failure'))
    })).rejects.toThrow('automatic failure')

    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    const retryJobs = listRetryJobs(db)

    expect(history[0]).toMatchObject({
      attemptKind: 'automatic_retry',
      retryOfArtifactId: firstFailedArtifact!.artifactId,
      backgroundRetry: {
        status: 'pending',
        autoRetryAttemptIndex: 2,
        maxAutoRetryAttempts: 2,
        nextRetryAt: '2026-03-16T12:05:30.000Z',
        claimedAt: null
      }
    })
    expect(retryJobs).toEqual([
      expect.objectContaining({
        failedArtifactId: firstFailedArtifact!.artifactId,
        status: 'pending',
        autoRetryAttemptIndex: 1
      }),
      expect.objectContaining({
        failedArtifactId: history[0]?.artifactId,
        status: 'pending',
        autoRetryAttemptIndex: 2
      })
    ])

    db.close()
  })

  it('surfaces exhausted background retry state after the last automatic retry fails', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS = '1'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T13:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel: vi.fn().mockRejectedValue(new Error('initial failure'))
    })).rejects.toThrow('initial failure')

    const firstFailedArtifact = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })[0]

    vi.setSystemTime(new Date('2026-03-16T13:05:00.000Z'))

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      attemptKind: 'automatic_retry',
      retryOfArtifactId: firstFailedArtifact!.artifactId,
      callModel: vi.fn().mockRejectedValue(new Error('automatic failure'))
    })).rejects.toThrow('automatic failure')

    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(history[0]).toMatchObject({
      attemptKind: 'automatic_retry',
      retryOfArtifactId: firstFailedArtifact!.artifactId,
      backgroundRetry: {
        status: 'exhausted',
        autoRetryAttemptIndex: 1,
        maxAutoRetryAttempts: 1,
        nextRetryAt: null,
        claimedAt: null
      }
    })

    db.close()
  })

  it('returns null when retrying a missing or non-failed approved draft send', async () => {
    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const successCall = vi.fn().mockResolvedValue({
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      receivedAt: '2026-03-16T11:00:01.000Z',
      usage: { total_tokens: 10 },
      payload: {
        acknowledgement: 'received'
      }
    })

    const sent = await sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      callModel: successCall
    })

    await expect(retryApprovedPersonaDraftProviderSend(db, {
      artifactId: 'missing-artifact',
      callModel: vi.fn()
    })).resolves.toBeNull()

    const retryCall = vi.fn()
    await expect(retryApprovedPersonaDraftProviderSend(db, {
      artifactId: sent!.artifactId,
      callModel: retryCall
    })).resolves.toBeNull()
    expect(retryCall).not.toHaveBeenCalled()

    db.close()
  })

  it('uses the deterministic fixture path instead of the network in e2e fixture mode', async () => {
    process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE = '1'

    const callLiteLLM = vi.spyOn(modelGatewayService, 'callLiteLLM')
    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

    const sent = await sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(sent?.status).toBe('responded')
    expect(callLiteLLM).not.toHaveBeenCalled()

    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(history).toHaveLength(1)
    expect(history[0]?.attemptKind).toBe('initial_send')
    expect(history[0]?.retryOfArtifactId).toBeNull()
    expect(history[0]?.events.map((event) => event.eventType)).toEqual(['request', 'response'])

    db.close()
  })
})
