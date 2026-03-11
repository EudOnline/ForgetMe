import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArchiveApi } from '../../../src/renderer/archiveApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('archiveApi workbench methods', () => {
  it('exposes review workbench read methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.listReviewWorkbenchItems({ itemType: 'structured_field_candidate' })).resolves.toEqual([])
    await expect(archiveApi.getReviewWorkbenchItem('rq-1')).resolves.toBeNull()
  })
})

describe('archiveApi preservation methods', () => {
  it('exposes export and restore methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.createBackupExport({ destinationRoot: '/tmp/export-root' })).resolves.toEqual(null)
    await expect(archiveApi.restoreBackupExport({ exportRoot: '/tmp/export-1', targetRoot: '/tmp/restore-root' })).resolves.toEqual(null)
  })
})
