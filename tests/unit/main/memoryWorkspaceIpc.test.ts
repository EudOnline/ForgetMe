import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  showOpenDialog,
  shellOpenPath,
  shellOpenExternal,
  openDatabase,
  runMigrations,
  listApprovedDraftSendDestinations,
  listApprovedPersonaDraftHandoffs,
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory,
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  createApprovedPersonaDraftHostedShareLink,
  revokeApprovedPersonaDraftHostedShareLink,
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  showOpenDialog: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listApprovedDraftSendDestinations: vi.fn(),
  listApprovedPersonaDraftHandoffs: vi.fn(),
  exportApprovedPersonaDraftToDirectory: vi.fn(),
  listApprovedPersonaDraftPublications: vi.fn(),
  publishApprovedPersonaDraftToDirectory: vi.fn(),
  getApprovedDraftHostedShareHostStatus: vi.fn(),
  listApprovedPersonaDraftHostedShareLinks: vi.fn(),
  createApprovedPersonaDraftHostedShareLink: vi.fn(),
  revokeApprovedPersonaDraftHostedShareLink: vi.fn(),
  listApprovedPersonaDraftProviderSends: vi.fn(),
  retryApprovedPersonaDraftProviderSend: vi.fn(),
  sendApprovedPersonaDraftToProvider: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog
  },
  shell: {
    openPath: shellOpenPath,
    openExternal: shellOpenExternal
  },
  ipcMain: {
    removeHandler: vi.fn((channel: string) => {
      handlerMap.delete(channel)
    }),
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlerMap.set(channel, handler)
    })
  }
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/personaDraftHandoffService', () => ({
  listApprovedPersonaDraftHandoffs,
  exportApprovedPersonaDraftToDirectory
}))

vi.mock('../../../src/main/services/approvedDraftPublicationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/approvedDraftPublicationService')>()
  return {
    ...actual,
    listApprovedPersonaDraftPublications,
    publishApprovedPersonaDraftToDirectory
  }
})

vi.mock('../../../src/main/services/approvedDraftHostedShareLinkService', () => ({
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  createApprovedPersonaDraftHostedShareLink,
  revokeApprovedPersonaDraftHostedShareLink
}))

vi.mock('../../../src/main/services/approvedDraftSendDestinationService', () => ({
  listApprovedDraftSendDestinations
}))

vi.mock('../../../src/main/services/approvedDraftProviderSendService', () => ({
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
}))

import { registerMemoryWorkspaceIpc } from '../../../src/main/ipc/memoryWorkspaceIpc'

function appPathsFixture(): AppPaths {
  return {
    root: '/tmp/forgetme',
    sqliteDir: '/tmp/forgetme/sqlite',
    vaultDir: '/tmp/forgetme/vault',
    vaultOriginalsDir: '/tmp/forgetme/vault/originals',
    importReportsDir: '/tmp/forgetme/reports',
    preservationReportsDir: '/tmp/forgetme/preservation-reports'
  }
}

function writeApprovedDraftPublicationPackage(
  packageRoot: string,
  options?: {
    includeManifest?: boolean
    includePublication?: boolean
    manifestPayload?: Record<string, unknown> | string
  }
) {
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(path.join(packageRoot, 'index.html'), '<html><body>share page</body></html>', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'styles.css'), 'body { color: black; }', 'utf8')

  if (options?.includePublication !== false) {
    fs.writeFileSync(path.join(packageRoot, 'publication.json'), '{"publicationId":"publication-1"}', 'utf8')
  }

  if (options?.includeManifest !== false) {
    const manifestPayload = options?.manifestPayload ?? {
      formatVersion: 'phase10k1',
      sourceArtifact: 'approved_persona_draft_handoff',
      publicArtifactFileName: 'publication.json',
      displayEntryFileName: 'index.html',
      displayStylesFileName: 'styles.css'
    }
    fs.writeFileSync(
      path.join(packageRoot, 'manifest.json'),
      typeof manifestPayload === 'string' ? manifestPayload : JSON.stringify(manifestPayload),
      'utf8'
    )
  }
}

describe('registerMemoryWorkspaceIpc approved handoff handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    showOpenDialog.mockReset()
    openDatabase.mockReset()
    runMigrations.mockReset()
    shellOpenPath.mockReset()
    shellOpenExternal.mockReset()
    listApprovedDraftSendDestinations.mockReset()
    listApprovedPersonaDraftHandoffs.mockReset()
    exportApprovedPersonaDraftToDirectory.mockReset()
    listApprovedPersonaDraftPublications.mockReset()
    publishApprovedPersonaDraftToDirectory.mockReset()
    getApprovedDraftHostedShareHostStatus.mockReset()
    listApprovedPersonaDraftHostedShareLinks.mockReset()
    createApprovedPersonaDraftHostedShareLink.mockReset()
    revokeApprovedPersonaDraftHostedShareLink.mockReset()
    listApprovedPersonaDraftProviderSends.mockReset()
    retryApprovedPersonaDraftProviderSend.mockReset()
    sendApprovedPersonaDraftToProvider.mockReset()
    delete process.env.FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR
    delete process.env.FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR
  })

  it('returns the e2e handoff destination override without opening a dialog', async () => {
    process.env.FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR = '/tmp/persona-draft-exports'

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:selectPersonaDraftHandoffDestination')

    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, undefined)).resolves.toBe('/tmp/persona-draft-exports')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('lists approved draft handoffs through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftHandoffs.mockReturnValue([{
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      handoffKind: 'local_json_export',
      status: 'exported',
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    }])

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftHandoffs')
    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftHandoffs).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      handoffKind: 'local_json_export'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('exports approved drafts through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    exportApprovedPersonaDraftToDirectory.mockReturnValue({
      status: 'exported',
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      handoffKind: 'local_json_export',
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:exportApprovedPersonaDraft')
    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })

    expect(exportApprovedPersonaDraftToDirectory).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      fileName: 'persona-draft-review-review-1-approved.json'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('returns the e2e publication destination override without opening a dialog', async () => {
    process.env.FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR = '/tmp/approved-draft-publications'

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:selectApprovedDraftPublicationDestination')

    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, undefined)).resolves.toBe('/tmp/approved-draft-publications')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('validates and lists approved draft publications through the ipc handler', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftPublications.mockReturnValue([{
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      status: 'published',
      packageRoot: '/tmp/approved-draft-publication-publication-1',
      manifestPath: '/tmp/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-16T09:00:00.000Z'
    }])

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftPublications')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(listApprovedPersonaDraftPublications).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftPublications).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      publicationKind: 'local_share_package'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('validates and publishes approved drafts through the ipc handler', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    publishApprovedPersonaDraftToDirectory.mockReturnValue({
      status: 'published',
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      packageRoot: '/tmp/approved-draft-publication-publication-1',
      manifestPath: '/tmp/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-16T09:00:00.000Z'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:publishApprovedPersonaDraft')

    await expect(handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: ''
    })).rejects.toThrow()
    expect(publishApprovedPersonaDraftToDirectory).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/approved-draft-publications'
    })

    expect(publishApprovedPersonaDraftToDirectory).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/approved-draft-publications'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      publicArtifactFileName: 'publication.json'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('rejects invalid open publication entry payloads', async () => {
    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')

    await expect(handler?.({}, {
      entryPath: '/tmp/approved-draft-publication-publication-1/not-index.html'
    })).rejects.toThrow()
    expect(shellOpenPath).not.toHaveBeenCalled()
  })

  it('opens a normalized publication entry path when shell open succeeds', async () => {
    shellOpenPath.mockResolvedValue('')
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot)

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath: path.join(packageRoot, '.', 'index.html')
    })

    expect(shellOpenPath).toHaveBeenCalledWith(entryPath)
    expect(result).toEqual({
      status: 'opened',
      entryPath,
      errorMessage: null
    })
  })

  it('returns structured failed status when publication entry is missing', async () => {
    registerMemoryWorkspaceIpc(appPathsFixture())

    const missingEntryPath = path.join(
      os.tmpdir(),
      'forgetme-approved-draft-publication-missing',
      'index.html'
    )
    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath: missingEntryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath: missingEntryPath,
      errorMessage: `Publication entry file not found: ${missingEntryPath}`
    })
  })

  it('returns structured failed status when publication package files are missing', async () => {
    registerMemoryWorkspaceIpc(appPathsFixture())

    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot, {
      includePublication: false
    })

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: `Publication package file not found: ${path.join(packageRoot, 'publication.json')}`
    })
  })

  it('returns structured failed status when publication manifest is not a valid ForgetMe package', async () => {
    registerMemoryWorkspaceIpc(appPathsFixture())

    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot, {
      manifestPayload: {
        formatVersion: 'phase10k1',
        sourceArtifact: 'approved_persona_draft_handoff',
        publicArtifactFileName: 'publication.json',
        displayEntryFileName: 'wrong.html',
        displayStylesFileName: 'styles.css'
      }
    })

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: `Publication package manifest is invalid: ${path.join(packageRoot, 'manifest.json')}`
    })
  })

  it('returns structured failed status when shell open returns an error string', async () => {
    shellOpenPath.mockResolvedValue('No application knows how to open this file.')
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot)

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).toHaveBeenCalledWith(entryPath)
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: 'No application knows how to open this file.'
    })
  })

  it('returns hosted share host status through the ipc handler', async () => {
    getApprovedDraftHostedShareHostStatus.mockReturnValue({
      availability: 'configured',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getApprovedDraftHostedShareHostStatus')
    const result = await handler?.({}, undefined)

    expect(getApprovedDraftHostedShareHostStatus).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      availability: 'configured',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test'
    })
  })

  it('lists hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftHostedShareLinks.mockReturnValue([{
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'active',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: null
    }])

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftHostedShareLinks')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(listApprovedPersonaDraftHostedShareLinks).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftHostedShareLinks).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([
      expect.objectContaining({
        shareLinkId: 'share-1',
        status: 'active'
      })
    ])
    expect(close).toHaveBeenCalled()
  })

  it('creates hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    createApprovedPersonaDraftHostedShareLink.mockResolvedValue({
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'active',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: null
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:createApprovedPersonaDraftHostedShareLink')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(createApprovedPersonaDraftHostedShareLink).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(createApprovedPersonaDraftHostedShareLink).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual(expect.objectContaining({
      shareLinkId: 'share-1',
      status: 'active'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('revokes hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    revokeApprovedPersonaDraftHostedShareLink.mockResolvedValue({
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'revoked',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: '2026-03-19T09:05:00.000Z'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:revokeApprovedPersonaDraftHostedShareLink')

    await expect(handler?.({}, {
      shareLinkId: ''
    })).rejects.toThrow()
    expect(revokeApprovedPersonaDraftHostedShareLink).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      shareLinkId: 'share-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(revokeApprovedPersonaDraftHostedShareLink).toHaveBeenCalledWith(expect.anything(), {
      shareLinkId: 'share-1'
    })
    expect(result).toEqual(expect.objectContaining({
      shareLinkId: 'share-1',
      status: 'revoked'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('opens hosted share links externally with a structured success result', async () => {
    shellOpenExternal.mockResolvedValue(undefined)

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')
    const result = await handler?.({}, {
      shareUrl: 'https://share.example.test/s/abc123'
    })

    expect(shellOpenExternal).toHaveBeenCalledWith('https://share.example.test/s/abc123')
    expect(result).toEqual({
      status: 'opened',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: null
    })
  })

  it('rejects invalid hosted share urls before shell.openExternal', async () => {
    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')

    await expect(handler?.({}, {
      shareUrl: 'ftp://share.example.test/s/abc123'
    })).rejects.toThrow()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('returns structured failed status when shell.openExternal throws', async () => {
    shellOpenExternal.mockRejectedValue(new Error('host unavailable'))

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')
    const result = await handler?.({}, {
      shareUrl: 'https://share.example.test/s/abc123'
    })

    expect(shellOpenExternal).toHaveBeenCalledWith('https://share.example.test/s/abc123')
    expect(result).toEqual({
      status: 'failed',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: 'host unavailable'
    })
  })

  it('lists approved draft provider sends through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftProviderSends.mockReturnValue([{
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      destinationId: 'memory-dialogue-default',
      destinationLabel: 'Memory Dialogue Default',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:00.000Z',
      events: []
    }])

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftProviderSends')
    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftProviderSends).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      policyKey: 'persona_draft.remote_send_approved'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('sends approved drafts through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    sendApprovedPersonaDraftToProvider.mockResolvedValue({
      status: 'responded',
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      destinationId: 'memory-dialogue-default',
      destinationLabel: 'Memory Dialogue Default',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      createdAt: '2026-03-16T08:00:00.000Z'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:sendApprovedPersonaDraftToProvider')
    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationId: 'memory-dialogue-default'
    })

    expect(sendApprovedPersonaDraftToProvider).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationId: 'memory-dialogue-default'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      policyKey: 'persona_draft.remote_send_approved'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('retries approved draft provider sends through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    retryApprovedPersonaDraftProviderSend.mockResolvedValue({
      status: 'responded',
      artifactId: 'pdpe-2',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-2',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1',
      createdAt: '2026-03-16T08:05:00.000Z'
    })

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:retryApprovedPersonaDraftProviderSend')
    const result = await handler?.({}, {
      artifactId: 'pdpe-failed-1'
    })

    expect(retryApprovedPersonaDraftProviderSend).toHaveBeenCalledWith(expect.anything(), {
      artifactId: 'pdpe-failed-1'
    })
    expect(result).toEqual(expect.objectContaining({
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('lists built-in approved draft send destinations through the ipc handler', async () => {
    listApprovedDraftSendDestinations.mockReturnValue([
      {
        destinationId: 'memory-dialogue-default',
        label: 'Memory Dialogue Default',
        resolutionMode: 'memory_dialogue_default',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        isDefault: true
      }
    ])

    registerMemoryWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedDraftSendDestinations')

    await expect(handler?.({}, undefined)).resolves.toEqual([
      expect.objectContaining({
        destinationId: 'memory-dialogue-default',
        isDefault: true
      })
    ])
    expect(listApprovedDraftSendDestinations).toHaveBeenCalledTimes(1)
  })
})
