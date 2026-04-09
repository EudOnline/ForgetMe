import fs from 'node:fs'
import path from 'node:path'

export type AppPaths = ReturnType<typeof ensureAppPaths>

export function ensureAppPaths(root: string) {
  const vaultDir = path.join(root, 'vault')
  const vaultOriginalsDir = path.join(vaultDir, 'originals')
  const importReportsDir = path.join(root, 'reports')
  const preservationReportsDir = path.join(root, 'preservation-reports')
  const sqliteDir = path.join(root, 'sqlite')
  const personAgentRootDir = path.join(root, 'person-agents')
  const personAgentWorkspaceDir = path.join(personAgentRootDir, 'workspaces')
  const personAgentStateDir = path.join(personAgentRootDir, 'state')

  for (const dir of [
    vaultDir,
    vaultOriginalsDir,
    importReportsDir,
    preservationReportsDir,
    sqliteDir,
    personAgentRootDir,
    personAgentWorkspaceDir,
    personAgentStateDir
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return {
    root,
    vaultDir,
    vaultOriginalsDir,
    importReportsDir,
    preservationReportsDir,
    sqliteDir,
    personAgentRootDir,
    personAgentWorkspaceDir,
    personAgentStateDir
  }
}
