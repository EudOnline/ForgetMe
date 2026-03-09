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
})
