import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  openDatabase,
  runMigrations,
  askMemoryWorkspacePersisted,
  listApprovedDraftSendDestinations
} = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  askMemoryWorkspacePersisted: vi.fn(),
  listApprovedDraftSendDestinations: vi.fn()
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/memoryWorkspaceSessionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/memoryWorkspaceSessionService')>()
  return {
    ...actual,
    askMemoryWorkspacePersisted
  }
})

vi.mock('../../../src/main/services/approvedDraftSendDestinationService', () => ({
  listApprovedDraftSendDestinations
}))

import { createWorkspaceModule } from '../../../src/main/modules/workspace/runtime/createWorkspaceModule'

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

describe('createWorkspaceModule', () => {
  beforeEach(() => {
    openDatabase.mockReset()
    runMigrations.mockReset()
    askMemoryWorkspacePersisted.mockReset()
    listApprovedDraftSendDestinations.mockReset()
  })

  it('asks the persisted workspace through a module-owned database helper', async () => {
    const close = vi.fn()
    const db = { close }
    const turn = { turnId: 'turn-1' }

    openDatabase.mockReturnValue(db)
    askMemoryWorkspacePersisted.mockReturnValue(turn)

    const workspaceModule = createWorkspaceModule(appPathsFixture())
    const result = await workspaceModule.askPersisted({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '接下来该先处理什么？',
      expressionMode: 'advice'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalledWith(db)
    expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '接下来该先处理什么？',
      expressionMode: 'advice'
    })
    expect(result).toBe(turn)
    expect(close).toHaveBeenCalled()
  })

  it('lists approved draft send destinations without opening the database', async () => {
    const destinations = [{ destinationId: 'dest-1', label: 'Default', provider: 'mock', model: 'v1' }]
    listApprovedDraftSendDestinations.mockReturnValue(destinations)

    const workspaceModule = createWorkspaceModule(appPathsFixture())
    const result = await workspaceModule.listSendDestinations()

    expect(listApprovedDraftSendDestinations).toHaveBeenCalled()
    expect(openDatabase).not.toHaveBeenCalled()
    expect(result).toEqual(destinations)
  })
})
