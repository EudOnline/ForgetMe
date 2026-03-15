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
    await expect(archiveApi.listDecisionJournal({ query: 'Alice Chen' })).resolves.toEqual([])
    await expect(archiveApi.searchDecisionJournal({ query: 'Alice Chen' })).resolves.toEqual([])
    await expect(archiveApi.approveSafeReviewGroup({ groupKey: 'cp-1::profile_attribute_candidate::school_name' })).resolves.toEqual({
      status: 'approved',
      batchId: '',
      journalId: '',
      groupKey: 'cp-1::profile_attribute_candidate::school_name',
      itemCount: 0,
      canonicalPersonId: null,
      canonicalPersonName: null,
      itemType: 'profile_attribute_candidate',
      fieldKey: null,
      queueItemIds: []
    })
  })
})

describe('archiveApi preservation methods', () => {
  it('exposes export and restore methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.createBackupExport({
      destinationRoot: '/tmp/export-root',
      encryptionPassword: 'correct horse battery staple'
    })).resolves.toEqual(null)
    await expect(archiveApi.restoreBackupExport({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      encryptionPassword: 'correct horse battery staple'
    })).resolves.toEqual(null)
    await expect(archiveApi.runRecoveryDrill({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root'
    })).resolves.toEqual(null)
  })
})

describe('archiveApi dossier methods', () => {
  it('exposes person dossier reads in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.listGroupPortraits()).resolves.toEqual([])
    await expect(archiveApi.getPersonDossier('cp-1')).resolves.toBeNull()
    await expect(archiveApi.askMemoryWorkspace({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceSessions()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceSession('session-1')).resolves.toBeNull()
    await expect(archiveApi.askMemoryWorkspacePersisted({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.runMemoryWorkspaceCompare({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.runMemoryWorkspaceCompareMatrix({
      expressionMode: 'advice',
      rows: [{
        scope: { kind: 'global' },
        question: '现在最值得关注什么？'
      }]
    })).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceCompareSessions()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceCompareSession('compare-session-1')).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceCompareMatrices()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceCompareMatrix('matrix-session-1')).resolves.toBeNull()
    await expect(archiveApi.getGroupPortrait('cp-1')).resolves.toBeNull()
    await expect(archiveApi.selectContextPackExportDestination()).resolves.toBeNull()
    await expect(archiveApi.getPersonContextPack({
      canonicalPersonId: 'cp-1',
      mode: 'approved_plus_derived'
    })).resolves.toBeNull()
    await expect(archiveApi.getGroupContextPack({
      anchorPersonId: 'cp-1'
    })).resolves.toBeNull()
    await expect(archiveApi.exportPersonContextPack({
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs'
    })).resolves.toBeNull()
    await expect(archiveApi.exportGroupContextPack({
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs',
      mode: 'approved_only'
    })).resolves.toBeNull()
  })
})
