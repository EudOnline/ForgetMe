import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('createImportBatch', () => {
  it('copies originals into the vault and creates a batch manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-'))
    const appPaths = ensureAppPaths(root)
    const sourceFile = path.resolve('tests/fixtures/imports/sample-chat.txt')

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [sourceFile],
      sourceLabel: 'manual-test'
    })

    expect(batch.files).toHaveLength(1)
    expect(fs.existsSync(batch.files[0].frozenAbsolutePath)).toBe(true)
    expect(fs.readFileSync(batch.manifestPath, 'utf8')).toContain('manual-test')
  })
})
