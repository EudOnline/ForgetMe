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

  it('finds failed approved draft sends and retry-aware resend summaries', async () => {
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
        attemptKind: 'manual_retry',
        retryOfArtifactId: 'artifact-failed-1',
        requestHash: 'hash-2',
        sentAt: '2026-03-16T08:05:00.000Z'
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
      replaySummary: 'Approved draft resent to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct'
    }))
    db.close()
  })
})
