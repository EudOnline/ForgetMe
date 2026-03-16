import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  showOpenDialog,
  openDatabase,
  runMigrations,
  listApprovedPersonaDraftHandoffs,
  exportApprovedPersonaDraftToDirectory
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  showOpenDialog: vi.fn(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listApprovedPersonaDraftHandoffs: vi.fn(),
  exportApprovedPersonaDraftToDirectory: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog
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

describe('registerMemoryWorkspaceIpc approved handoff handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    showOpenDialog.mockReset()
    openDatabase.mockReset()
    runMigrations.mockReset()
    listApprovedPersonaDraftHandoffs.mockReset()
    exportApprovedPersonaDraftToDirectory.mockReset()
    delete process.env.FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR
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
})
