import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftProviderSendArtifact,
  ApprovedPersonaDraftProviderSendEvent,
  ArchiveApi,
  ListApprovedPersonaDraftProviderSendsInput,
  SendApprovedPersonaDraftToProviderInput,
  SendApprovedPersonaDraftToProviderResult
} from '../../../src/shared/archiveContracts'
import {
  approvedDraftSendDestinationIdSchema,
  listApprovedPersonaDraftProviderSendsInputSchema,
  sendApprovedPersonaDraftToProviderInputSchema
} from '../../../src/shared/ipcSchemas'

describe('phase-ten approved draft provider send contracts', () => {
  it('exports approved draft provider send shapes', () => {
    const destination: ApprovedDraftSendDestination = {
      destinationId: 'openrouter-qwen25-72b',
      label: 'OpenRouter / qwen-2.5-72b-instruct',
      resolutionMode: 'provider_model',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      isDefault: false
    }

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
      destinationId: destination.destinationId,
      destinationLabel: destination.label,
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
      draftReviewId: 'review-1',
      destinationId: destination.destinationId
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
      destinationId: destination.destinationId,
      destinationLabel: destination.label,
      createdAt: '2026-03-16T08:00:00.000Z'
    }

    expect(destination.destinationId).toBe('openrouter-qwen25-72b')
    expect(artifact.events[0]?.eventType).toBe('request')
    expect(listInput.draftReviewId).toBe('review-1')
    expect(sendInput.destinationId).toBe('openrouter-qwen25-72b')
    expect(sendResult.status).toBe('responded')
    expect(sendResult.destinationLabel).toBe('OpenRouter / qwen-2.5-72b-instruct')

    expectTypeOf<ArchiveApi['listApprovedDraftSendDestinations']>().toEqualTypeOf<
      () => Promise<ApprovedDraftSendDestination[]>
    >()
    expectTypeOf<ArchiveApi['listApprovedPersonaDraftProviderSends']>().toEqualTypeOf<
      (input: ListApprovedPersonaDraftProviderSendsInput) => Promise<ApprovedPersonaDraftProviderSendArtifact[]>
    >()
    expectTypeOf<ArchiveApi['sendApprovedPersonaDraftToProvider']>().toEqualTypeOf<
      (input: SendApprovedPersonaDraftToProviderInput) => Promise<SendApprovedPersonaDraftToProviderResult | null>
    >()
  })

  it('exports approved draft provider send input schemas', () => {
    expect(approvedDraftSendDestinationIdSchema.parse('openrouter-qwen25-72b')).toBe('openrouter-qwen25-72b')

    expect(listApprovedPersonaDraftProviderSendsInputSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })

    expect(sendApprovedPersonaDraftToProviderInputSchema.parse({
      draftReviewId: 'review-1',
      destinationId: 'openrouter-qwen25-72b'
    })).toEqual({
      draftReviewId: 'review-1',
      destinationId: 'openrouter-qwen25-72b'
    })
  })
})
