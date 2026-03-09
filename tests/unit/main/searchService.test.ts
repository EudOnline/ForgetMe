import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { searchArchive } from '../../../src/main/services/searchService'

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
})
