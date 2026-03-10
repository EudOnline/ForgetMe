import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { buildPersonMergeCandidates } from '../../../src/main/services/candidateService'

describe('buildPersonMergeCandidates', () => {
  it('creates a pending merge candidate when two canonical people share a normalized name', () => {
    const candidates = buildPersonMergeCandidates({
      people: [
        { canonicalPersonId: 'cp-1', displayName: 'Alice Chen' },
        { canonicalPersonId: 'cp-2', displayName: 'alice chen' }
      ]
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe('pending')
    expect(candidates[0].matchedRules).toContain('normalized_name_exact')
    expect(candidates[0].leftCanonicalPersonId).toBe('cp-1')
    expect(candidates[0].rightCanonicalPersonId).toBe('cp-2')
  })
})

describe('createImportBatch phase-two candidates', () => {
  it('creates canonical people and review candidates for matching participants', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase2-import-'))
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
      sourceLabel: 'phase-two-candidates'
    })

    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const canonicalPeople = db.prepare(
      'select primary_display_name as displayName from canonical_people order by primary_display_name'
    ).all() as Array<{ displayName: string }>
    const mergeCandidates = db.prepare(
      `select status, matched_rules_json as matchedRulesJson
       from person_merge_candidates`
    ).all() as Array<{ status: string; matchedRulesJson: string }>
    const reviewQueue = db.prepare(
      'select item_type as itemType, status from review_queue order by item_type'
    ).all() as Array<{ itemType: string; status: string }>

    expect(canonicalPeople.map((row) => row.displayName)).toEqual([
      'Alice Chen',
      'Bob',
      'Carol',
      'alice chen'
    ])
    expect(mergeCandidates).toHaveLength(1)
    expect(mergeCandidates[0].status).toBe('pending')
    expect(JSON.parse(mergeCandidates[0].matchedRulesJson)).toContain('normalized_name_exact')
    expect(reviewQueue).toEqual([
      expect.objectContaining({
        itemType: 'person_merge_candidate',
        status: 'pending'
      })
    ])

    db.close()
  })
})
