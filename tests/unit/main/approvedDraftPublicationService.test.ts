import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import {
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory
} from '../../../src/main/services/approvedDraftPublicationService'
import { createPersonaDraftReviewFromTurn } from '../../../src/main/services/memoryWorkspaceDraftReviewService'
import {
  seedApprovedPersonaDraftHandoffScenario,
  seedPersonaDraftReviewScenario
} from './helpers/memoryWorkspaceScenario'

afterEach(() => {
  vi.useRealTimers()
})

describe('approvedDraftPublicationService', () => {
  it('returns null when the review is missing', () => {
    const { db } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))

    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: 'missing-review',
      destinationRoot
    })

    expect(published).toBeNull()

    db.close()
  })

  it('returns null when the review is not approved', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, {
      turnId: sandboxTurn.turnId
    })
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))

    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: review!.draftReviewId,
      destinationRoot
    })

    expect(review?.status).toBe('draft')
    expect(published).toBeNull()

    db.close()
  })

  it('publishes an approved review as a local share package with journal history', () => {
    const { db, approvedReview, sandboxTurn } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))

    const published = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })

    expect(published?.status).toBe('published')
    expect(published?.draftReviewId).toBe(approvedReview.draftReviewId)
    expect(published?.sourceTurnId).toBe(sandboxTurn.turnId)
    expect(published?.publicationKind).toBe('local_share_package')
    expect(published?.packageRoot).toBe(path.join(destinationRoot, `approved-draft-publication-${published!.publicationId}`))
    expect(published?.publicArtifactPath).toBe(path.join(published!.packageRoot, 'publication.json'))
    expect(published?.manifestPath).toBe(path.join(published!.packageRoot, 'manifest.json'))
    expect(published?.publicArtifactFileName).toBe('publication.json')
    expect(fs.existsSync(published!.publicArtifactPath)).toBe(true)
    expect(fs.existsSync(published!.manifestPath)).toBe(true)

    const publicPayload = JSON.parse(fs.readFileSync(published!.publicArtifactPath, 'utf8'))
    expect(publicPayload).toMatchObject({
      formatVersion: 'phase10k1',
      publicationKind: 'local_share_package',
      publicationId: published!.publicationId,
      publishedAt: published!.publishedAt,
      question: sandboxTurn.question
    })
    expect(publicPayload.approvedDraft).toContain('归档')
    expect(publicPayload).not.toHaveProperty('reviewNotes')
    expect(publicPayload).not.toHaveProperty('trace')

    const publicArtifactSha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(published!.publicArtifactPath, 'utf8'))
      .digest('hex')

    const manifestPayload = JSON.parse(fs.readFileSync(published!.manifestPath, 'utf8'))
    expect(manifestPayload).toMatchObject({
      formatVersion: 'phase10k1',
      publicationId: published!.publicationId,
      publicationKind: 'local_share_package',
      draftReviewId: approvedReview.draftReviewId,
      sourceTurnId: sandboxTurn.turnId,
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256,
      sourceArtifact: 'approved_persona_draft_handoff'
    })

    const journalEntries = listDecisionJournal(db, {
      decisionType: 'publish_approved_persona_draft',
      targetType: 'persona_draft_review'
    })

    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]).toMatchObject({
      decisionType: 'publish_approved_persona_draft',
      targetId: approvedReview.draftReviewId
    })
    expect(journalEntries[0]?.operationPayload).toMatchObject({
      publicationId: published!.publicationId,
      packageRoot: published!.packageRoot,
      publicArtifactPath: published!.publicArtifactPath
    })

    db.close()
  })

  it('lists approved draft publications newest first for one review', () => {
    vi.useFakeTimers()

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))

    vi.setSystemTime(new Date('2026-03-16T04:00:00.000Z'))
    const firstPublication = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })

    vi.setSystemTime(new Date('2026-03-16T04:05:00.000Z'))
    const secondPublication = publishApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot
    })

    const history = listApprovedPersonaDraftPublications(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(firstPublication?.status).toBe('published')
    expect(secondPublication?.status).toBe('published')
    expect(history).toHaveLength(2)
    expect(history[0]?.publishedAt).toBe('2026-03-16T04:05:00.000Z')
    expect(history[1]?.publishedAt).toBe('2026-03-16T04:00:00.000Z')
    expect(history[0]?.journalId).not.toBe(history[1]?.journalId)
  })
})
