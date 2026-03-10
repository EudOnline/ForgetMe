import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { approveReviewItem, listReviewQueue } from '../../../src/main/services/reviewQueueService'
import { getPeopleList } from '../../../src/main/services/timelineService'

describe('phase-two review flow integration', () => {
  it('keeps only the preferred canonical display name after approving a merge', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-review-flow-'))
    const appPaths = ensureAppPaths(root)
    const chatA = path.join(root, 'chat-a.json')
    const chatB = path.join(root, 'chat-b.json')

    fs.writeFileSync(chatA, JSON.stringify({
      messages: [
        { sender: 'Alice Chen', text: 'hello' },
        { sender: 'Bob', text: 'hi' }
      ]
    }))
    fs.writeFileSync(chatB, JSON.stringify({
      messages: [
        { sender: 'alice chen', text: 'hey' },
        { sender: 'Carol', text: 'yo' }
      ]
    }))

    await createImportBatch({
      appPaths,
      sourcePaths: [chatA, chatB],
      sourceLabel: 'review-flow'
    })

    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)
    const pendingItems = listReviewQueue(db, { status: 'pending' })

    approveReviewItem(db, { queueItemId: pendingItems[0].id, actor: 'local-user' })

    const people = getPeopleList(db)

    expect(people.map((person) => person.primaryDisplayName)).toContain('Alice Chen')
    expect(people.map((person) => person.primaryDisplayName)).not.toContain('alice chen')
    db.close()
  })
})
