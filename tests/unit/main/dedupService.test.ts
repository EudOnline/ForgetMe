import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('exact duplicate detection', () => {
  it('marks the second identical file as duplicate_exact', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-dedup-'))
    const appPaths = ensureAppPaths(root)
    const file = path.resolve('tests/fixtures/imports/sample-chat.txt')

    const first = await createImportBatch({ appPaths, sourcePaths: [file], sourceLabel: 'first' })
    const second = await createImportBatch({ appPaths, sourcePaths: [file], sourceLabel: 'second' })

    expect(first.files[0].duplicateClass).toBe('unique')
    expect(second.files[0].duplicateClass).toBe('duplicate_exact')
  })

  it('marks same-content files with different filenames as duplicate_exact in a deterministic order', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-dedup-dirty-data-'))
    const appPaths = ensureAppPaths(root)

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [
        path.resolve('tests/fixtures/imports/duplicate-chat-a.json'),
        path.resolve('tests/fixtures/imports/duplicate-chat-b.json')
      ],
      sourceLabel: 'dirty-data-dedup'
    })

    expect(batch.files.map((file) => ({
      fileName: file.fileName,
      duplicateClass: file.duplicateClass
    }))).toEqual([
      { fileName: 'duplicate-chat-a.json', duplicateClass: 'unique' },
      { fileName: 'duplicate-chat-b.json', duplicateClass: 'duplicate_exact' }
    ])
    expect(batch.summary?.duplicateCount).toBe(1)
  })
})
