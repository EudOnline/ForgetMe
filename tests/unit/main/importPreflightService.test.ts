import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { buildImportPreflight } from '../../../src/main/services/importPreflightService'

describe('buildImportPreflight', () => {
  it('classifies supported, unsupported, and duplicate candidates before import', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-preflight-'))
    const appPaths = ensureAppPaths(root)

    const existingSource = path.resolve('tests/fixtures/imports/sample-chat.txt')
    await createImportBatch({
      appPaths,
      sourcePaths: [existingSource],
      sourceLabel: 'already-imported'
    })

    const unsupportedFile = path.join(root, 'file.exe')
    fs.writeFileSync(unsupportedFile, 'unsupported fixture')

    const result = await buildImportPreflight({
      appPaths,
      sourcePaths: [existingSource, unsupportedFile]
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      fileName: 'sample-chat.txt',
      extension: '.txt',
      importKindHint: 'chat',
      status: 'duplicate_candidate',
      isSupported: true
    })
    expect(result.items[1].status).toBe('unsupported')
    expect(result.summary).toMatchObject({
      totalCount: 2,
      supportedCount: 1,
      unsupportedCount: 1
    })
  })
})
