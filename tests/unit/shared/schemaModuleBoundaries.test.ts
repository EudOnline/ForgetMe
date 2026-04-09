import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments)

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(repoPath(...segments), 'utf8')
}

describe('shared schema and contract boundaries', () => {
  it('replaces the giant shared schema file with domain schema modules', () => {
    expect(fs.existsSync(repoPath('src/shared/ipcSchemas.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/shared/schemas/import.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/people.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/review.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/workspace.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/schemas/objective.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/shared/schemas/ops.ts'))).toBe(true)
  })

  it('publishes domain contracts through shared contract modules', () => {
    expect(fs.existsSync(repoPath('src/shared/contracts/import.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/contracts/people.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/contracts/review.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/contracts/workspace.ts'))).toBe(true)
    expect(fs.existsSync(repoPath('src/shared/contracts/objective.ts'))).toBe(false)
    expect(fs.existsSync(repoPath('src/shared/contracts/ops.ts'))).toBe(true)
  })

  it('stops importing the deleted shared ipcSchemas module from main-process handlers', () => {
    expect(fs.existsSync(repoPath('src/main/ipc'))).toBe(false)

    const files = [
      readRepoFile('src/main/bootstrap/registerIpc.ts'),
      readRepoFile('src/main/modules/import/registerImportIpc.ts'),
      readRepoFile('src/main/modules/people/registerPeopleIpc.ts'),
      readRepoFile('src/main/modules/review/registerReviewIpc.ts'),
      readRepoFile('src/main/modules/workspace/registerWorkspaceIpc.ts'),
      readRepoFile('src/main/modules/ops/registerOpsIpc.ts')
    ]

    for (const source of files) {
      expect(source).not.toContain("shared/ipcSchemas")
    }
  })
})
