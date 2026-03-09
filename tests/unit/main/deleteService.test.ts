import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { logicalDeleteBatch } from '../../../src/main/services/deleteService'

describe('logicalDeleteBatch', () => {
  it('marks a batch deleted and writes an audit row', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-delete-'))
    const appPaths = ensureAppPaths(root)
    const file = path.resolve('tests/fixtures/imports/sample-chat.txt')
    const batch = await createImportBatch({ appPaths, sourcePaths: [file], sourceLabel: 'delete-seed' })

    const result = await logicalDeleteBatch({ appPaths, batchId: batch.batchId, actor: 'local-user' })

    expect(result.status).toBe('deleted')
  })
})
