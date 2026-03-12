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
})
