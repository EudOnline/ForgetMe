import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

describe('workspace and review module boundaries', () => {
  it('keeps review ipc registration behind the review module', () => {
    const registerReviewIpcSource = readSource('src/main/modules/review/registerReviewIpc.ts')
    const createReviewModuleSource = readSource('src/main/modules/review/runtime/createReviewModule.ts')

    expect(registerReviewIpcSource).toContain("from './runtime/createReviewModule'")
    expect(registerReviewIpcSource).not.toContain("from '../../services/db'")
    expect(registerReviewIpcSource).not.toContain("from '../../services/reviewQueueService'")
    expect(registerReviewIpcSource).not.toContain("from '../../services/reviewWorkbenchReadService'")
    expect(createReviewModuleSource).toContain('openArchiveDatabase')
    expect(createReviewModuleSource).toContain('approveReviewItem')
  })

  it('keeps workspace ipc registration behind the workspace module', () => {
    const registerWorkspaceIpcSource = readSource('src/main/modules/workspace/registerWorkspaceIpc.ts')
    const createWorkspaceModuleSource = readSource('src/main/modules/workspace/runtime/createWorkspaceModule.ts')

    expect(registerWorkspaceIpcSource).toContain("from './runtime/createWorkspaceModule'")
    expect(registerWorkspaceIpcSource).not.toContain("from '../../services/db'")
    expect(registerWorkspaceIpcSource).not.toContain("from '../../services/memoryWorkspaceService'")
    expect(registerWorkspaceIpcSource).not.toContain("from '../../services/memoryWorkspaceSessionService'")
    expect(createWorkspaceModuleSource).toContain('openArchiveDatabase')
    expect(createWorkspaceModuleSource).toContain('askMemoryWorkspacePersisted')
  })
})
