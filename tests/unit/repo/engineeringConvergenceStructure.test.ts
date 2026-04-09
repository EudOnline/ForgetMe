import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments)

describe('engineering convergence structure', () => {
  it('replaces the monolithic renderer root with an app shell entrypoint', () => {
    const rendererEntry = readRepoFile('src/renderer/main.tsx')

    expect(fs.existsSync(repoPath('src/renderer/app-shell/AppShell.tsx'))).toBe(true)
    expect(rendererEntry).toContain("from './app-shell/AppShell'")
    expect(rendererEntry).not.toContain("from './App'")
    expect(fs.existsSync(repoPath('src/renderer/App.tsx'))).toBe(false)
  })

  it('removes the giant shared ipc schema file in favor of domain schema modules', () => {
    expect(fs.existsSync(repoPath('src/shared/ipcSchemas.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/shared/schemas/import.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/review.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/workspace.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/objective.ts'))).toBe(false)
  })

  it('moves main-process registration into bootstrap modules', () => {
    const mainEntry = readRepoFile('src/main/index.ts')
    const bootstrapEntry = readRepoFile('src/main/bootstrap/registerIpc.ts')

    expect(fs.existsSync(repoPath('src/main/bootstrap/registerIpc.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/bootstrap/serviceContainer.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/modules/review/registerReviewIpc.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/modules/workspace/registerWorkspaceIpc.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/modules/import/registerImportIpc.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/modules/people/registerPeopleIpc.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/main/modules/ops/registerOpsIpc.ts'))).toBe(true)
    expect(mainEntry).toContain("from './bootstrap/registerIpc'")
    expect(mainEntry).toContain("from './bootstrap/serviceContainer'")
    expect(bootstrapEntry).toContain("from '../modules/review/registerReviewIpc'")
    expect(bootstrapEntry).toContain("from '../modules/workspace/registerWorkspaceIpc'")
    expect(bootstrapEntry).toContain("from '../modules/import/registerImportIpc'")
    expect(bootstrapEntry).toContain("from '../modules/people/registerPeopleIpc'")
    expect(bootstrapEntry).toContain("from '../modules/ops/registerOpsIpc'")
    expect(fs.existsSync(repoPath('src/main/ipc/agentIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/archiveIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/contextPackIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/enrichmentIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/memoryWorkspaceIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/peopleIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/preservationIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/reviewIpc.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/main/ipc/searchIpc.ts'))).toBe(false)
  })
})
