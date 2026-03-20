import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createApprovedPersonaDraftHostedShareLink,
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  revokeApprovedPersonaDraftHostedShareLink
} from '../../../src/main/services/approvedDraftHostedShareLinkService'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import { publishApprovedPersonaDraftToDirectory } from '../../../src/main/services/approvedDraftPublicationService'
import {
  seedApprovedPersonaDraftHandoffScenario,
  seedPersonaDraftReviewScenario
} from './helpers/memoryWorkspaceScenario'
import { createPersonaDraftReviewFromTurn } from '../../../src/main/services/memoryWorkspaceDraftReviewService'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL
  delete process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN
})

describe('approvedDraftHostedShareLinkService', () => {
  it('reports unconfigured host status when env is absent', () => {
    const status = getApprovedDraftHostedShareHostStatus()
    expect(status).toEqual({
      availability: 'unconfigured',
      hostKind: null,
      hostLabel: null
    })
  })

  it('returns null when the review is missing, not approved, or has no publication history', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL = 'https://host.example.com'
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN = 'token-123'
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response('{}', { status: 200 })
    )

    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const missing = await createApprovedPersonaDraftHostedShareLink(db, { draftReviewId: 'missing' })
    const draftReview = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })
    const draftResult = await createApprovedPersonaDraftHostedShareLink(db, { draftReviewId: draftReview!.draftReviewId })

    const { db: dbApproved, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const noPublication = await createApprovedPersonaDraftHostedShareLink(dbApproved, { draftReviewId: approvedReview.draftReviewId })

    expect(missing).toBeNull()
    expect(draftResult).toBeNull()
    expect(noPublication).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()

    db.close()
    dbApproved.close()
  })

  it('creates a hosted share link from the latest publication, validates package, persists audit, and journals creation', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL = 'https://host.example.com/api'
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN = 'token-123'

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const [url, init] = args
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(init?.method).toBe('POST')
      expect(String(url)).toBe('https://host.example.com/api/approved-draft-share-links')
      expect(body.requestShape).toBe('approved_draft_hosted_share_link_create')
      expect(body).not.toHaveProperty('requestEnvelope')
      expect(body).not.toHaveProperty('packageRoot')
      expect(body).not.toHaveProperty('manifestPath')
      expect(body).not.toHaveProperty('publicArtifactPath')
      expect(body).not.toHaveProperty('displayEntryPath')
      expect(body).not.toHaveProperty('displayStylesPath')
      const files = body
      expect(Object.keys(files)).toEqual(expect.arrayContaining([
        'shareLinkId',
        'publicationId',
        'draftReviewId',
        'sourceTurnId',
        'publicArtifactSha256',
        'manifest',
        'publication',
        'displayEntry',
        'displayStyles'
      ]))
      expect(files.displayEntry.fileName).toBe('index.html')
      expect(files.displayStyles.fileName).toBe('styles.css')
      expect(files.manifest.publicArtifactFileName).toBe('publication.json')
      return new Response(JSON.stringify({
        remoteShareId: 'remote-1',
        shareUrl: 'https://host.example.com/share/1'
      }), { status: 200 })
    })

    const { db, approvedReview, sandboxTurn } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-hosted-share-'))
    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })
    expect(published).not.toBeNull()

    const created = await createApprovedPersonaDraftHostedShareLink(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(created).toMatchObject({
      status: 'active',
      draftReviewId: approvedReview.draftReviewId,
      publicationId: published?.publicationId,
      shareUrl: 'https://host.example.com/share/1',
      remoteShareId: 'remote-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://host.example.com',
      publicArtifactSha256: published?.publicArtifactSha256,
      revokedAt: null
    })
    expect(created?.createdAt).toEqual(expect.any(String))
    expect(created).not.toHaveProperty('events')

    const artifacts = db.prepare('select * from persona_draft_share_host_artifacts').all() as Array<{ request_hash: string } & Record<string, unknown>>
    const requestBody = JSON.parse((((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body) as string) ?? '{}')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].request_hash).toBe(crypto.createHash('sha256').update(
      JSON.stringify(requestBody)
    ).digest('hex'))

    const events = db.prepare(
      'select event_type as eventType, payload_json as payloadJson from persona_draft_share_host_events order by created_at asc, rowid asc'
    ).all() as Array<{ eventType: string; payloadJson: string }>
    expect(events.map((row) => row.eventType)).toEqual(['request', 'response'])
    expect(JSON.parse(events[0]!.payloadJson)).toMatchObject({
      requestShape: 'approved_draft_hosted_share_link_create',
      shareLinkId: created?.shareLinkId,
      publicationId: published?.publicationId
    })
    expect(JSON.parse(events[0]!.payloadJson)).not.toHaveProperty('requestEnvelope')

    const journal = listDecisionJournal(db, { decisionType: 'create_approved_persona_draft_share_link' })
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({
      targetId: approvedReview.draftReviewId,
      operationPayload: expect.objectContaining({
        shareUrl: 'https://host.example.com/share/1',
        remoteShareId: 'remote-1',
        publicationId: published?.publicationId,
        sourceTurnId: sandboxTurn.turnId,
        publicArtifactSha256: published?.publicArtifactSha256
      })
    })

    // package should remain on disk after create
    expect(fs.existsSync(published!.packageRoot)).toBe(true)

    db.close()
  })

  it('returns null when the latest publication package fails boundary validation', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL = 'https://host.example.com'
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN = 'token-123'

    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response('{}', { status: 200 })
    )

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-hosted-share-invalid-package-'))
    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })
    const manifestPayload = JSON.parse(fs.readFileSync(published!.manifestPath, 'utf8')) as Record<string, unknown>
    fs.writeFileSync(
      published!.manifestPath,
      `${JSON.stringify({
        ...manifestPayload,
        displayEntryFileName: 'wrong.html'
      }, null, 2)}\n`,
      'utf8'
    )

    const created = await createApprovedPersonaDraftHostedShareLink(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(created).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(listDecisionJournal(db, { decisionType: 'create_approved_persona_draft_share_link' })).toHaveLength(0)
    expect(db.prepare('select count(*) as count from persona_draft_share_host_artifacts').get() as { count: number }).toEqual({
      count: 0
    })

    db.close()
  })

  it('persists error event and throws when host create fails', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL = 'https://host.example.com'
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN = 'token-123'

    vi.spyOn(global, 'fetch' as any).mockResolvedValue(new Response('fail', { status: 500 }))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-hosted-share-fail-'))
    publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })

    await expect(createApprovedPersonaDraftHostedShareLink(db, {
      draftReviewId: approvedReview.draftReviewId
    })).rejects.toThrow()

    const events = db.prepare('select event_type as eventType from persona_draft_share_host_events order by created_at asc, rowid asc').all() as Array<{ eventType: string }>
    expect(events.map((row) => row.eventType)).toEqual(['request', 'error'])

    const journal = listDecisionJournal(db, { decisionType: 'create_approved_persona_draft_share_link' })
    expect(journal).toHaveLength(0)

    db.close()
  })

  it('lists hosted share links folding create and revoke newest-first and marks revoked links', async () => {
    vi.useFakeTimers()
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL = 'https://host.example.com'
    process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN = 'token-123'

    let createCount = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const [url] = args
      if (String(url).endsWith('/approved-draft-share-links')) {
        createCount += 1
        return new Response(JSON.stringify({
          remoteShareId: `remote-${createCount}`,
          shareUrl: `https://host.example.com/share/${createCount}`
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ status: 'revoked' }), { status: 200 })
    })

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-hosted-share-list-'))
    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })

    vi.setSystemTime(new Date('2026-03-16T04:00:00.000Z'))
    const created = await createApprovedPersonaDraftHostedShareLink(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    vi.setSystemTime(new Date('2026-03-16T04:05:00.000Z'))
    const revoked = await revokeApprovedPersonaDraftHostedShareLink(db, {
      shareLinkId: created!.shareLinkId
    })
    vi.setSystemTime(new Date('2026-03-16T04:10:00.000Z'))
    const secondCreated = await createApprovedPersonaDraftHostedShareLink(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    const history = listApprovedPersonaDraftHostedShareLinks(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      status: 'active',
      shareLinkId: secondCreated?.shareLinkId,
      shareUrl: secondCreated?.shareUrl,
      remoteShareId: secondCreated?.remoteShareId,
      createdAt: '2026-03-16T04:10:00.000Z',
      revokedAt: null,
      publicArtifactSha256: published?.publicArtifactSha256
    })
    expect(history[1]).toMatchObject({
      status: 'revoked',
      shareLinkId: created?.shareLinkId,
      shareUrl: created?.shareUrl,
      remoteShareId: created?.remoteShareId,
      createdAt: '2026-03-16T04:00:00.000Z',
      revokedAt: '2026-03-16T04:05:00.000Z',
      publicArtifactSha256: published?.publicArtifactSha256
    })
    expect(revoked).toMatchObject({
      status: 'revoked',
      shareLinkId: created?.shareLinkId,
      createdAt: '2026-03-16T04:00:00.000Z',
      revokedAt: '2026-03-16T04:05:00.000Z',
      publicArtifactSha256: published?.publicArtifactSha256
    })
    expect(revoked).not.toHaveProperty('events')

    const journalCreate = listDecisionJournal(db, { decisionType: 'create_approved_persona_draft_share_link' })
    const journalRevoke = listDecisionJournal(db, { decisionType: 'revoke_approved_persona_draft_share_link' })
    expect(journalCreate).toHaveLength(2)
    expect(journalRevoke).toHaveLength(1)
    expect(journalRevoke[0]?.operationPayload).toMatchObject({
      publicArtifactSha256: published?.publicArtifactSha256
    })

    // local package untouched
    expect(fs.existsSync(published!.packageRoot)).toBe(true)

    db.close()
  })
})
