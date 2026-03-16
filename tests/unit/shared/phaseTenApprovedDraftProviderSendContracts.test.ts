import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ApprovedPersonaDraftProviderSendArtifact,
  ApprovedPersonaDraftProviderSendEvent,
  ArchiveApi,
  ListApprovedPersonaDraftProviderSendsInput,
  SendApprovedPersonaDraftToProviderInput,
  SendApprovedPersonaDraftToProviderResult
} from '../../../src/shared/archiveContracts'
import {
  listApprovedPersonaDraftProviderSendsInputSchema,
  sendApprovedPersonaDraftToProviderInputSchema
} from '../../../src/shared/ipcSchemas'

describe('phase-ten approved draft provider send contracts', () => {
  it('exports approved draft provider send shapes', () => {
    const event: ApprovedPersonaDraftProviderSendEvent = {
      id: 'event-1',
      eventType: 'request',
      payload: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        policyKey: 'persona_draft.remote_send_approved'
      },
      createdAt: '2026-03-16T08:00:00.000Z'
    }

    const artifact: ApprovedPersonaDraftProviderSendArtifact = {
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:00.000Z',
      events: [event]
    }

    const listInput: ListApprovedPersonaDraftProviderSendsInput = {
      draftReviewId: 'review-1'
    }

    const sendInput: SendApprovedPersonaDraftToProviderInput = {
      draftReviewId: 'review-1'
    }

    const sendResult: SendApprovedPersonaDraftToProviderResult = {
      status: 'responded',
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      createdAt: '2026-03-16T08:00:00.000Z'
    }

    expect(artifact.events[0]?.eventType).toBe('request')
    expect(listInput.draftReviewId).toBe('review-1')
    expect(sendInput.draftReviewId).toBe('review-1')
    expect(sendResult.status).toBe('responded')

    expectTypeOf<ArchiveApi['listApprovedPersonaDraftProviderSends']>().toEqualTypeOf<
      (input: ListApprovedPersonaDraftProviderSendsInput) => Promise<ApprovedPersonaDraftProviderSendArtifact[]>
    >()
    expectTypeOf<ArchiveApi['sendApprovedPersonaDraftToProvider']>().toEqualTypeOf<
      (input: SendApprovedPersonaDraftToProviderInput) => Promise<SendApprovedPersonaDraftToProviderResult | null>
    >()
  })

  it('exports approved draft provider send input schemas', () => {
    expect(listApprovedPersonaDraftProviderSendsInputSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })

    expect(sendApprovedPersonaDraftToProviderInputSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })
  })
})
