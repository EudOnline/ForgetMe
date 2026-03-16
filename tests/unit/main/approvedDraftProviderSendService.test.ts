import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import * as modelGatewayService from '../../../src/main/services/modelGatewayService'
import {
  buildApprovedPersonaDraftProviderSendRequest,
  listApprovedPersonaDraftProviderSends,
  sendApprovedPersonaDraftToProvider
} from '../../../src/main/services/approvedDraftProviderSendService'
import { createPersonaDraftReviewFromTurn } from '../../../src/main/services/memoryWorkspaceDraftReviewService'
import {
  seedApprovedPersonaDraftHandoffScenario,
  seedPersonaDraftReviewScenario
} from './helpers/memoryWorkspaceScenario'

afterEach(() => {
  vi.useRealTimers()
  delete process.env.FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE
  vi.restoreAllMocks()
})

describe('approvedDraftProviderSendService', () => {
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
    expect(callModel).toHaveBeenCalledTimes(1)
    expect(history).toHaveLength(1)
    expect(history[0]?.policyKey).toBe('persona_draft.remote_send_approved')
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
        requestHash: sent?.requestHash,
        sentAt: '2026-03-16T08:00:00.000Z'
      }
    })

    db.close()
  })

  it('persists an error event when the provider send fails', async () => {
    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const callModel = vi.fn().mockRejectedValue(new Error('provider offline'))

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      callModel
    })).rejects.toThrow('provider offline')

    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider'
    })

    expect(history).toHaveLength(1)
    expect(history[0]?.events.map((event) => event.eventType)).toEqual(['request', 'error'])
    expect(journalEntries).toHaveLength(0)

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
    expect(history[0]?.events.map((event) => event.eventType)).toEqual(['request', 'response'])

    db.close()
  })
})
