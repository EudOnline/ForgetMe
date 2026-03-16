import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ApprovedPersonaDraftHandoffArtifact,
  ApprovedPersonaDraftHandoffKind,
  ApprovedPersonaDraftHandoffRecord,
  ArchiveApi,
  ExportApprovedPersonaDraftResult,
  ListApprovedPersonaDraftHandoffsInput,
  ExportApprovedPersonaDraftInput,
  MemoryWorkspaceCommunicationExcerpt,
  MemoryWorkspacePersonaDraftTrace,
  MemoryWorkspaceScope
} from '../../../src/shared/archiveContracts'
import {
  approvedPersonaDraftReviewIdSchema,
  exportApprovedPersonaDraftInputSchema,
  listApprovedPersonaDraftHandoffsInputSchema
} from '../../../src/shared/ipcSchemas'

describe('phase-ten approved draft handoff contracts', () => {
  it('exports approved persona draft handoff shapes', () => {
    const handoffKind: ApprovedPersonaDraftHandoffKind = 'local_json_export'
    const scope: MemoryWorkspaceScope = {
      kind: 'person',
      canonicalPersonId: 'cp-1'
    }
    const communicationExcerpt: MemoryWorkspaceCommunicationExcerpt = {
      excerptId: 'ce-1',
      fileId: 'f-1',
      fileName: 'chat-1.json',
      ordinal: 1,
      speakerDisplayName: 'Alice Chen',
      text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
    }
    const trace: MemoryWorkspacePersonaDraftTrace = {
      traceId: 'trace-1',
      excerptIds: ['ce-1'],
      explanation: 'Draft stays grounded in excerpt ce-1.'
    }

    const artifact: ApprovedPersonaDraftHandoffArtifact = {
      formatVersion: 'phase10e1',
      handoffKind,
      exportedAt: '2026-03-16T03:00:00.000Z',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      scope,
      workflowKind: 'persona_draft_sandbox',
      reviewStatus: 'approved',
      question: '如果她本人会怎么建议我？',
      approvedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Approved for internal handoff.',
      supportingExcerptIds: ['ce-1'],
      communicationExcerpts: [communicationExcerpt],
      trace: [trace],
      shareEnvelope: {
        requestShape: 'local_json_persona_draft_handoff',
        policyKey: 'persona_draft.local_export_approved'
      }
    }

    const handoffInput: ListApprovedPersonaDraftHandoffsInput = {
      draftReviewId: 'review-1'
    }

    const exportInput: ExportApprovedPersonaDraftInput = {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    }

    const handoffRecord: ApprovedPersonaDraftHandoffRecord = {
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      handoffKind,
      status: 'exported',
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    }

    const exportResult: ExportApprovedPersonaDraftResult = {
      status: 'exported',
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      handoffKind,
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    }

    expect(artifact.reviewStatus).toBe('approved')
    expect(artifact.communicationExcerpts[0]?.fileName).toBe('chat-1.json')
    expect(handoffInput.draftReviewId).toBe('review-1')
    expect(exportInput.destinationRoot).toBe('/tmp/persona-draft-exports')
    expect(handoffRecord.status).toBe('exported')
    expect(exportResult.handoffKind).toBe('local_json_export')

    expectTypeOf<ArchiveApi['selectPersonaDraftHandoffDestination']>().toEqualTypeOf<
      () => Promise<string | null>
    >()
    expectTypeOf<ArchiveApi['listApprovedPersonaDraftHandoffs']>().toEqualTypeOf<
      (input: ListApprovedPersonaDraftHandoffsInput) => Promise<ApprovedPersonaDraftHandoffRecord[]>
    >()
    expectTypeOf<ArchiveApi['exportApprovedPersonaDraft']>().toEqualTypeOf<
      (input: ExportApprovedPersonaDraftInput) => Promise<ExportApprovedPersonaDraftResult | null>
    >()
  })

  it('exports approved draft handoff input schemas', () => {
    expect(approvedPersonaDraftReviewIdSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })

    expect(listApprovedPersonaDraftHandoffsInputSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })

    expect(exportApprovedPersonaDraftInputSchema.parse({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })).toEqual({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })
  })
})
