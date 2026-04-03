import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../../src/main/services/appPaths'

const {
  registerImportIpc,
  registerObjectiveIpc,
  registerPeopleIpc,
  registerReviewIpc,
  registerWorkspaceIpc,
  registerOpsIpc
} = vi.hoisted(() => ({
  registerImportIpc: vi.fn(),
  registerObjectiveIpc: vi.fn(),
  registerPeopleIpc: vi.fn(),
  registerReviewIpc: vi.fn(),
  registerWorkspaceIpc: vi.fn(),
  registerOpsIpc: vi.fn()
}))

vi.mock('../../../../src/main/modules/import/registerImportIpc', () => ({
  registerImportIpc
}))

vi.mock('../../../../src/main/modules/objective/registerObjectiveIpc', () => ({
  registerObjectiveIpc
}))

vi.mock('../../../../src/main/modules/people/registerPeopleIpc', () => ({
  registerPeopleIpc
}))

vi.mock('../../../../src/main/modules/review/registerReviewIpc', () => ({
  registerReviewIpc
}))

vi.mock('../../../../src/main/modules/workspace/registerWorkspaceIpc', () => ({
  registerWorkspaceIpc
}))

vi.mock('../../../../src/main/modules/ops/registerOpsIpc', () => ({
  registerOpsIpc
}))

import { registerIpc } from '../../../../src/main/bootstrap/registerIpc'

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

describe('registerIpc', () => {
  beforeEach(() => {
    registerImportIpc.mockReset()
    registerObjectiveIpc.mockReset()
    registerPeopleIpc.mockReset()
    registerReviewIpc.mockReset()
    registerWorkspaceIpc.mockReset()
    registerOpsIpc.mockReset()
  })

  it('registers each domain module with container-owned app paths', () => {
    const appPaths = appPathsFixture()

    registerIpc({
      appPaths
    })

    expect(registerImportIpc).toHaveBeenCalledWith(appPaths)
    expect(registerObjectiveIpc).toHaveBeenCalledWith(appPaths)
    expect(registerPeopleIpc).toHaveBeenCalledWith(appPaths)
    expect(registerReviewIpc).toHaveBeenCalledWith(appPaths)
    expect(registerWorkspaceIpc).toHaveBeenCalledWith(appPaths)
    expect(registerOpsIpc).toHaveBeenCalledWith(appPaths)
  })
})
