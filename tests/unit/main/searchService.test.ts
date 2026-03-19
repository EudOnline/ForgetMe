import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { appendDecisionJournal } from '../../../src/main/services/journalService'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { searchArchive, searchDecisionJournal } from '../../../src/main/services/searchService'

describe('archive search', () => {
  it('filters by keyword and file kind', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-search-'))
    const appPaths = ensureAppPaths(root)
    const chatFile = path.resolve('tests/fixtures/imports/sample-chat.txt')

    await createImportBatch({ appPaths, sourcePaths: [chatFile], sourceLabel: 'search-seed' })
    const results = await searchArchive({ appPaths, query: 'Alice', fileKinds: ['chat'] })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((item) => item.fileKind === 'chat')).toBe(true)
  })

  it('finds decision journal hits by replay summary text', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-decision-search-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    appendDecisionJournal(db, {
      decisionType: 'approve_safe_review_group',
      targetType: 'decision_batch',
      targetId: 'batch-1',
      operationPayload: {
        canonicalPersonName: 'Alice Chen',
        fieldKey: 'school_name',
        itemCount: 2
      },
      undoPayload: {
        memberJournalIds: ['journal-1', 'journal-2']
      },
      actor: 'reviewer'
    })

    const results = await searchDecisionJournal({ appPaths, query: 'Alice Chen' })

    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'approve_safe_review_group',
      targetType: 'decision_batch',
      replaySummary: 'Safe batch approve · Alice Chen · school_name · 2 items'
    }))
    db.close()
  })

  it('finds approved draft provider sends by the new replay summary', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-provider-send-search-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-1',
        providerSendArtifactId: 'artifact-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        policyKey: 'persona_draft.remote_send_approved',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        requestHash: 'hash-1',
        sentAt: '2026-03-16T08:00:00.000Z'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    const results = await searchDecisionJournal({ appPaths, query: 'OpenRouter / qwen-2.5-72b-instruct' })

    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      replaySummary: 'Approved draft sent to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
    }))
    db.close()
  })

  it('finds failed approved draft sends and automatic retry-aware summaries', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-provider-send-retry-search-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-1',
        providerSendArtifactId: 'artifact-failed-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        attemptKind: 'initial_send',
        retryOfArtifactId: null,
        errorMessage: 'provider offline'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-1',
        providerSendArtifactId: 'artifact-retry-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        attemptKind: 'automatic_retry',
        retryOfArtifactId: 'artifact-failed-1',
        requestHash: 'hash-2',
        sentAt: '2026-03-16T08:05:00.000Z'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    appendDecisionJournal(db, {
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-1',
        providerSendArtifactId: 'artifact-auto-failed-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        attemptKind: 'automatic_retry',
        retryOfArtifactId: 'artifact-failed-1',
        errorMessage: 'provider still offline'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    const results = await searchDecisionJournal({ appPaths, query: 'OpenRouter / qwen-2.5-72b-instruct' })

    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      replaySummary: 'Approved draft send failed · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
    }))
    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'send_approved_persona_draft_to_provider',
      targetType: 'persona_draft_review',
      replaySummary: 'Approved draft auto-retried to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
    }))
    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'send_approved_persona_draft_to_provider_failed',
      targetType: 'persona_draft_review',
      replaySummary: 'Approved draft auto-retry failed · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
    }))
    db.close()
  })

  it('finds approved draft publication history by the publish replay summary', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-search-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    appendDecisionJournal(db, {
      decisionType: 'publish_approved_persona_draft',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        publicationId: 'publication-1',
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-1',
        publicationKind: 'local_share_package',
        packageRoot: '/tmp/approved-draft-publication-publication-1',
        manifestPath: '/tmp/approved-draft-publication-publication-1/manifest.json',
        publicArtifactPath: '/tmp/approved-draft-publication-publication-1/publication.json',
        publicArtifactFileName: 'publication.json',
        publicArtifactSha256: 'hash-1',
        publishedAt: '2026-03-16T09:00:00.000Z',
        sourceArtifact: 'approved_persona_draft_handoff'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    const results = await searchDecisionJournal({ appPaths, query: 'local share package' })

    expect(results).toContainEqual(expect.objectContaining({
      decisionType: 'publish_approved_persona_draft',
      targetType: 'persona_draft_review',
      replaySummary: 'Approved draft published for sharing · Persona draft review · turn-1 · local share package'
    }))
    db.close()
  })

  it('finds hosted share link creation by share url and revoke by decision label', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-hosted-share-search-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    appendDecisionJournal(db, {
      decisionType: 'create_approved_persona_draft_share_link',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        shareLinkId: 'share-1',
        draftReviewId: 'review-1',
        publicationId: 'pub-1',
        sourceTurnId: 'turn-1',
        hostKind: 'configured_remote_host',
        hostLabel: 'https://host.example.com',
        requestHash: 'hash-1',
        remoteShareId: 'remote-1',
        shareUrl: 'https://host.example.com/share/1'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    appendDecisionJournal(db, {
      decisionType: 'revoke_approved_persona_draft_share_link',
      targetType: 'persona_draft_review',
      targetId: 'review-1',
      operationPayload: {
        shareLinkId: 'share-1',
        draftReviewId: 'review-1',
        publicationId: 'pub-1',
        sourceTurnId: 'turn-1',
        hostKind: 'configured_remote_host',
        hostLabel: 'https://host.example.com',
        requestHash: 'hash-2',
        remoteShareId: 'remote-1',
        shareUrl: 'https://host.example.com/share/1'
      },
      undoPayload: {},
      actor: 'local-user'
    })

    const createdResults = await searchDecisionJournal({ appPaths, query: 'https://host.example.com/share/1' })
    const revokedResults = await searchDecisionJournal({ appPaths, query: 'Hosted share link revoked' })

    expect(createdResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionType: 'create_approved_persona_draft_share_link',
          replaySummary: 'Hosted share link created for approved draft · Persona draft review · turn-1 · hosted share link'
        })
      ])
    )
    expect(revokedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionType: 'revoke_approved_persona_draft_share_link',
          replaySummary: 'Hosted share link revoked · Persona draft review · turn-1 · hosted share link'
        })
      ])
    )
    db.close()
  })
})
