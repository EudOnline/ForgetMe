import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  openDatabase,
  runMigrations,
  listAgentMemories,
  listAgentPolicyVersions,
  createObjectiveRuntimeService,
  createFacilitatorAgentService,
  createRoleAgentRegistryService,
  createExternalVerificationBrokerService,
  createExternalWebSearchService,
  createSubagentRegistryService
} = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listAgentMemories: vi.fn(),
  listAgentPolicyVersions: vi.fn(),
  createObjectiveRuntimeService: vi.fn(),
  createFacilitatorAgentService: vi.fn(),
  createRoleAgentRegistryService: vi.fn(),
  createExternalVerificationBrokerService: vi.fn(),
  createExternalWebSearchService: vi.fn(),
  createSubagentRegistryService: vi.fn()
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/governancePersistenceService', () => ({
  listAgentMemories,
  listAgentPolicyVersions
}))

vi.mock('../../../src/main/services/objectiveRuntimeService', () => ({
  createObjectiveRuntimeService
}))

vi.mock('../../../src/main/services/agents/facilitatorAgentService', () => ({
  createFacilitatorAgentService
}))

vi.mock('../../../src/main/services/agents/roleAgentRegistryService', () => ({
  createRoleAgentRegistryService
}))

vi.mock('../../../src/main/services/externalVerificationBrokerService', () => ({
  createExternalVerificationBrokerService
}))

vi.mock('../../../src/main/services/externalWebSearchService', () => ({
  createExternalWebSearchService
}))

vi.mock('../../../src/main/services/subagentRegistryService', () => ({
  createSubagentRegistryService
}))

import { createObjectiveModule } from '../../../src/main/modules/objective/runtime/createObjectiveModule'

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

describe('createObjectiveModule', () => {
  beforeEach(() => {
    openDatabase.mockReset()
    runMigrations.mockReset()
    listAgentMemories.mockReset()
    listAgentPolicyVersions.mockReset()
    createObjectiveRuntimeService.mockReset()
    createFacilitatorAgentService.mockReset()
    createRoleAgentRegistryService.mockReset()
    createExternalVerificationBrokerService.mockReset()
    createExternalWebSearchService.mockReset()
    createSubagentRegistryService.mockReset()
  })

  it('creates objectives through a module-owned runtime session and returns the persisted detail', async () => {
    const close = vi.fn()
    const db = { close }
    const runtimeDetail = {
      objectiveId: 'objective-1',
      title: 'Verify an external claim before responding'
    }
    const runtime = {
      startObjective: vi.fn().mockResolvedValue({
        objective: {
          objectiveId: 'objective-1'
        }
      }),
      getObjectiveDetail: vi.fn().mockReturnValue(runtimeDetail)
    }

    openDatabase.mockReturnValue(db)
    createFacilitatorAgentService.mockReturnValue({ role: 'facilitator' })
    createRoleAgentRegistryService.mockReturnValue({ role: 'registry' })
    createExternalWebSearchService.mockReturnValue({
      searchWeb: vi.fn(),
      openSourcePage: vi.fn()
    })
    createExternalVerificationBrokerService.mockReturnValue({ role: 'broker' })
    createSubagentRegistryService.mockReturnValue({ role: 'subagents' })
    createObjectiveRuntimeService.mockReturnValue(runtime)

    const objectiveModule = createObjectiveModule(appPathsFixture())
    const detail = await objectiveModule.createObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalledWith(db)
    expect(createObjectiveRuntimeService).toHaveBeenCalledWith(expect.objectContaining({
      db
    }))
    expect(runtime.startObjective).toHaveBeenCalledWith({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })
    expect(runtime.getObjectiveDetail).toHaveBeenCalledWith({
      objectiveId: 'objective-1'
    })
    expect(detail).toBe(runtimeDetail)
    expect(close).toHaveBeenCalled()
  })

  it('lists agent memories through the module database helper and closes the database', async () => {
    const close = vi.fn()
    const db = { close }
    const records = [{ memoryId: 'memory-1' }]

    openDatabase.mockReturnValue(db)
    listAgentMemories.mockReturnValue(records)

    const objectiveModule = createObjectiveModule(appPathsFixture())
    const result = await objectiveModule.listMemories({
      role: 'workspace'
    })

    expect(listAgentMemories).toHaveBeenCalledWith(db, {
      role: 'workspace'
    })
    expect(result).toEqual(records)
    expect(close).toHaveBeenCalled()
  })
})
