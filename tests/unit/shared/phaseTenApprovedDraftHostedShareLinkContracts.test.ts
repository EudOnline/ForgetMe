import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  ApprovedDraftHostedShareHostStatus,
  ApprovedPersonaDraftHostedShareLinkRecord,
  CreateApprovedPersonaDraftHostedShareLinkInput,
  CreateApprovedPersonaDraftHostedShareLinkResult,
  ListApprovedPersonaDraftHostedShareLinksInput,
  OpenApprovedDraftHostedShareLinkInput,
  OpenApprovedDraftHostedShareLinkResult,
  RevokeApprovedPersonaDraftHostedShareLinkInput,
  RevokeApprovedPersonaDraftHostedShareLinkResult
} from '../../../src/shared/archiveContracts'
import {
  listApprovedPersonaDraftHostedShareLinksInputSchema,
  openApprovedDraftHostedShareLinkInputSchema,
  revokeApprovedPersonaDraftHostedShareLinkInputSchema
} from '../../../src/shared/schemas/workspace'

describe('phase-ten approved draft hosted share link contracts', () => {
  it('exports host status and hosted link shapes', () => {
    const hostStatus: ApprovedDraftHostedShareHostStatus = {
      availability: 'configured',
      hostKind: 'configured_remote_host',
      hostLabel: 'share.example.test'
    }

    // @ts-expect-error configured status should always include host metadata
    const invalidHostStatus: ApprovedDraftHostedShareHostStatus = {
      availability: 'configured',
      hostKind: null,
      hostLabel: null
    }

    const record: ApprovedPersonaDraftHostedShareLinkRecord = {
      shareLinkId: 'share-link-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'share.example.test',
      remoteShareId: 'remote-share-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'artifact-hash-1',
      status: 'active',
      createdAt: '2026-03-18T10:00:00.000Z',
      revokedAt: null
    }

    // @ts-expect-error active links must keep revokedAt null
    const invalidActiveRecord: ApprovedPersonaDraftHostedShareLinkRecord = {
      ...record,
      status: 'active',
      revokedAt: '2026-03-18T11:00:00.000Z'
    }

    const createInput: CreateApprovedPersonaDraftHostedShareLinkInput = {
      draftReviewId: 'review-1'
    }

    const revokeInput: RevokeApprovedPersonaDraftHostedShareLinkInput = {
      shareLinkId: 'share-link-1'
    }

    const createResult: CreateApprovedPersonaDraftHostedShareLinkResult = {
      ...record
    }

    const revokeResult: RevokeApprovedPersonaDraftHostedShareLinkResult = {
      ...record,
      status: 'revoked',
      revokedAt: '2026-03-18T11:00:00.000Z'
    }

    const openInput: OpenApprovedDraftHostedShareLinkInput = {
      shareUrl: 'https://share.example.test/s/abc123'
    }

    const openSuccess: OpenApprovedDraftHostedShareLinkResult = {
      status: 'opened',
      shareUrl: openInput.shareUrl,
      errorMessage: null
    }

    const openFailure: OpenApprovedDraftHostedShareLinkResult = {
      status: 'failed',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: 'missing host config'
    }

    expect(hostStatus.availability).toBe('configured')
    expect(record.status).toBe('active')
    expect(createInput.draftReviewId).toBe('review-1')
    expect(revokeInput.shareLinkId).toBe('share-link-1')
    expect(createResult.shareUrl).toBe(record.shareUrl)
    expect(revokeResult.status).toBe('revoked')
    expect(openSuccess.status).toBe('opened')
    expect(openFailure.errorMessage).toBe('missing host config')
  })

  it('exports hosted share link input schemas and API contracts', () => {
    const listInput: ListApprovedPersonaDraftHostedShareLinksInput = {
      draftReviewId: 'review-1'
    }

    expect(listApprovedPersonaDraftHostedShareLinksInputSchema.parse(listInput)).toEqual(listInput)
    expect(revokeApprovedPersonaDraftHostedShareLinkInputSchema.parse({ shareLinkId: 'share-link-1' })).toEqual({
      shareLinkId: 'share-link-1'
    })
    expect(openApprovedDraftHostedShareLinkInputSchema.parse({ shareUrl: 'https://share.example.test/s/abc123' })).toEqual({
      shareUrl: 'https://share.example.test/s/abc123'
    })

    expectTypeOf<ArchiveApi['getApprovedDraftHostedShareHostStatus']>().toEqualTypeOf<
      () => Promise<ApprovedDraftHostedShareHostStatus>
    >()
    expectTypeOf<ArchiveApi['listApprovedPersonaDraftHostedShareLinks']>().toEqualTypeOf<
      (input: ListApprovedPersonaDraftHostedShareLinksInput) => Promise<ApprovedPersonaDraftHostedShareLinkRecord[]>
    >()
    expectTypeOf<ArchiveApi['createApprovedPersonaDraftHostedShareLink']>().toEqualTypeOf<
      (input: CreateApprovedPersonaDraftHostedShareLinkInput) => Promise<CreateApprovedPersonaDraftHostedShareLinkResult | null>
    >()
    expectTypeOf<ArchiveApi['revokeApprovedPersonaDraftHostedShareLink']>().toEqualTypeOf<
      (input: RevokeApprovedPersonaDraftHostedShareLinkInput) => Promise<RevokeApprovedPersonaDraftHostedShareLinkResult | null>
    >()
    expectTypeOf<ArchiveApi['openApprovedDraftHostedShareLink']>().toEqualTypeOf<
      (input: OpenApprovedDraftHostedShareLinkInput) => Promise<OpenApprovedDraftHostedShareLinkResult>
    >()
  })

  it('ensures the open link schema enforces http(s) protocols via URL parsing', () => {
    const successResult = openApprovedDraftHostedShareLinkInputSchema.parse({
      shareUrl: 'HTTPS://share.example.test/s/abc123'
    })

    expect(successResult.shareUrl).toBe('HTTPS://share.example.test/s/abc123')

    const failure = openApprovedDraftHostedShareLinkInputSchema.safeParse({
      shareUrl: 'ftp://share.example.test/s/abc123'
    })

    expect(failure.success).toBe(false)
    expect(failure.error?.errors).toEqual([
      {
        code: 'custom',
        message: 'shareUrl must use http or https protocol',
        path: ['shareUrl']
      }
    ])
  })
})
