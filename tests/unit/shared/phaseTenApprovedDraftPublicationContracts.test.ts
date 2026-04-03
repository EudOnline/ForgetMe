import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ApprovedPersonaDraftPublicationArtifact,
  ApprovedPersonaDraftPublicationRecord,
  ArchiveApi,
  ListApprovedPersonaDraftPublicationsInput,
  OpenApprovedDraftPublicationEntryInput,
  OpenApprovedDraftPublicationEntryResult,
  PublishApprovedPersonaDraftInput,
  PublishApprovedPersonaDraftResult
} from '../../../src/shared/archiveContracts'
import {
  listApprovedPersonaDraftPublicationsInputSchema,
  openApprovedDraftPublicationEntryInputSchema,
  publishApprovedPersonaDraftInputSchema
} from '../../../src/shared/schemas/workspace'

describe('phase-ten approved draft publication contracts', () => {
  it('exports approved draft publication shapes', () => {
    const artifact: ApprovedPersonaDraftPublicationArtifact = {
      formatVersion: 'phase10k1',
      publicationKind: 'local_share_package',
      publishedAt: '2026-03-17T05:00:00.000Z',
      publicationId: 'publication-1',
      title: 'Approved draft publication · Alice Chen',
      question: '如果她来写这段话，会怎么写？',
      approvedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      shareEnvelope: {
        requestShape: 'local_share_persona_draft_publication',
        policyKey: 'persona_draft.local_publish_share'
      }
    }

    const listInput: ListApprovedPersonaDraftPublicationsInput = {
      draftReviewId: 'review-1'
    }

    const publishInput: PublishApprovedPersonaDraftInput = {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-publications'
    }

    const openInput: OpenApprovedDraftPublicationEntryInput = {
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html'
    }

    const record: ApprovedPersonaDraftPublicationRecord = {
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      status: 'published',
      packageRoot: '/tmp/persona-draft-publications/approved-draft-publication-publication-1',
      manifestPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-17T05:00:00.000Z'
    }

    const result: PublishApprovedPersonaDraftResult = {
      status: 'published',
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      packageRoot: '/tmp/persona-draft-publications/approved-draft-publication-publication-1',
      manifestPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-17T05:00:00.000Z'
    }

    const openResult: OpenApprovedDraftPublicationEntryResult = {
      status: 'opened',
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html',
      errorMessage: null
    }

    expect(artifact.publicationKind).toBe('local_share_package')
    expect(artifact.shareEnvelope.requestShape).toBe('local_share_persona_draft_publication')
    expect(listInput.draftReviewId).toBe('review-1')
    expect(publishInput.destinationRoot).toBe('/tmp/persona-draft-publications')
    expect(openInput.entryPath).toContain('/index.html')
    expect(record.status).toBe('published')
    expect(record.publicArtifactFileName).toBe('publication.json')
    expect(record.displayEntryFileName).toBe('index.html')
    expect(result.status).toBe('published')
    expect(result.publicationId).toBe('publication-1')
    expect(result.displayEntryPath).toContain('/index.html')
    expect(openResult.status).toBe('opened')

    expectTypeOf<ArchiveApi['selectApprovedDraftPublicationDestination']>().toEqualTypeOf<
      () => Promise<string | null>
    >()
    expectTypeOf<ArchiveApi['listApprovedPersonaDraftPublications']>().toEqualTypeOf<
      (input: ListApprovedPersonaDraftPublicationsInput) => Promise<ApprovedPersonaDraftPublicationRecord[]>
    >()
    expectTypeOf<ArchiveApi['publishApprovedPersonaDraft']>().toEqualTypeOf<
      (input: PublishApprovedPersonaDraftInput) => Promise<PublishApprovedPersonaDraftResult | null>
    >()
    expectTypeOf<ArchiveApi['openApprovedDraftPublicationEntry']>().toEqualTypeOf<
      (input: OpenApprovedDraftPublicationEntryInput) => Promise<OpenApprovedDraftPublicationEntryResult>
    >()
  })

  it('exports approved draft publication input schemas', () => {
    expect(listApprovedPersonaDraftPublicationsInputSchema.parse({
      draftReviewId: 'review-1'
    })).toEqual({
      draftReviewId: 'review-1'
    })

    expect(publishApprovedPersonaDraftInputSchema.parse({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-publications'
    })).toEqual({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-publications'
    })

    expect(openApprovedDraftPublicationEntryInputSchema.parse({
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html'
    })).toEqual({
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html'
    })

    const uncPath = String.raw`\\server\share\approved-draft-publication-publication-1\index.html`
    expect(openApprovedDraftPublicationEntryInputSchema.parse({
      entryPath: uncPath
    })).toEqual({
      entryPath: uncPath
    })
  })
})
