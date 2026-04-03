import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  showOpenDialog,
  openDatabase,
  runMigrations,
  buildPersonContextPack,
  buildGroupContextPack,
  exportContextPackToDirectory
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  showOpenDialog: vi.fn(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  buildPersonContextPack: vi.fn(),
  buildGroupContextPack: vi.fn(),
  exportContextPackToDirectory: vi.fn()
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

vi.mock('../../../src/main/services/contextPackService', () => ({
  buildPersonContextPack,
  buildGroupContextPack,
  exportContextPackToDirectory
}))

import { registerPeopleIpc } from '../../../src/main/modules/people/registerPeopleIpc'

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

function personPackFixture() {
  return {
    formatVersion: 'phase8c1' as const,
    exportedAt: null,
    mode: 'approved_only' as const,
    scope: {
      kind: 'person' as const,
      canonicalPersonId: 'cp-1'
    },
    title: 'Person Context Pack · Alice Chen',
    identity: {
      primaryDisplayName: 'Alice Chen',
      aliases: [],
      manualLabels: [],
      firstSeenAt: null,
      lastSeenAt: null,
      evidenceCount: 1
    },
    sections: [],
    timelineHighlights: [],
    relationships: [],
    ambiguity: [],
    sourceRefs: [],
    shareEnvelope: {
      requestShape: 'local_json_context_pack' as const,
      policyKey: 'context_pack.local_export_baseline' as const
    }
  }
}

function groupPackFixture() {
  return {
    formatVersion: 'phase8c1' as const,
    exportedAt: null,
    mode: 'approved_plus_derived' as const,
    scope: {
      kind: 'group' as const,
      anchorPersonId: 'cp-1'
    },
    title: 'Group Context Pack · Alice Chen Group Portrait',
    members: [],
    timelineWindows: [],
    sharedEvidenceSources: [],
    narrative: [],
    ambiguity: [],
    sourceRefs: [],
    shareEnvelope: {
      requestShape: 'local_json_context_pack' as const,
      policyKey: 'context_pack.local_export_baseline' as const
    }
  }
}

describe('registerPeopleIpc context-pack handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    showOpenDialog.mockReset()
    openDatabase.mockReset()
    runMigrations.mockReset()
    buildPersonContextPack.mockReset()
    buildGroupContextPack.mockReset()
    exportContextPackToDirectory.mockReset()
    delete process.env.FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR
  })

  afterEach(() => {
    delete process.env.FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR
  })

  it('returns the e2e export destination override without opening a dialog', async () => {
    process.env.FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR = '/tmp/context-pack-exports'

    registerPeopleIpc(appPathsFixture())

    const handler = handlerMap.get('archive:selectContextPackExportDestination')
    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, undefined)).resolves.toBe('/tmp/context-pack-exports')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('builds person packs through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    buildPersonContextPack.mockReturnValue(personPackFixture())

    registerPeopleIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getPersonContextPack')
    const result = await handler?.({}, {
      canonicalPersonId: 'cp-1',
      mode: 'approved_only'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(buildPersonContextPack).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1',
      mode: 'approved_only'
    })
    expect(result).toEqual(expect.objectContaining({
      scope: {
        kind: 'person',
        canonicalPersonId: 'cp-1'
      }
    }))
    expect(close).toHaveBeenCalled()
  })

  it('exports person packs to the selected directory', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    buildPersonContextPack.mockReturnValue(personPackFixture())
    exportContextPackToDirectory.mockReturnValue({
      status: 'exported',
      filePath: '/tmp/context-pack-exports/person-cp-1-context-pack.json',
      fileName: 'person-cp-1-context-pack.json',
      sha256: 'hash-person',
      exportedAt: '2026-03-14T00:00:00.000Z',
      mode: 'approved_only',
      scope: {
        kind: 'person',
        canonicalPersonId: 'cp-1'
      }
    })

    registerPeopleIpc(appPathsFixture())

    const handler = handlerMap.get('archive:exportPersonContextPack')
    const result = await handler?.({}, {
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-pack-exports',
      mode: 'approved_only'
    })

    expect(exportContextPackToDirectory).toHaveBeenCalledWith({
      destinationRoot: '/tmp/context-pack-exports',
      pack: expect.objectContaining({
        scope: {
          kind: 'person',
          canonicalPersonId: 'cp-1'
        }
      })
    })
    expect(result).toEqual(expect.objectContaining({
      fileName: 'person-cp-1-context-pack.json'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('exports group packs to the selected directory', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    buildGroupContextPack.mockReturnValue(groupPackFixture())
    exportContextPackToDirectory.mockReturnValue({
      status: 'exported',
      filePath: '/tmp/context-pack-exports/group-cp-1-context-pack.json',
      fileName: 'group-cp-1-context-pack.json',
      sha256: 'hash-group',
      exportedAt: '2026-03-14T00:00:00.000Z',
      mode: 'approved_plus_derived',
      scope: {
        kind: 'group',
        anchorPersonId: 'cp-1'
      }
    })

    registerPeopleIpc(appPathsFixture())

    const handler = handlerMap.get('archive:exportGroupContextPack')
    const result = await handler?.({}, {
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-pack-exports',
      mode: 'approved_plus_derived'
    })

    expect(buildGroupContextPack).toHaveBeenCalledWith(expect.anything(), {
      anchorPersonId: 'cp-1',
      mode: 'approved_plus_derived'
    })
    expect(exportContextPackToDirectory).toHaveBeenCalledWith({
      destinationRoot: '/tmp/context-pack-exports',
      pack: expect.objectContaining({
        scope: {
          kind: 'group',
          anchorPersonId: 'cp-1'
        }
      })
    })
    expect(result).toEqual(expect.objectContaining({
      fileName: 'group-cp-1-context-pack.json'
    }))
    expect(close).toHaveBeenCalled()
  })
})
