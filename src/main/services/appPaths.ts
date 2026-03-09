import fs from 'node:fs'
import path from 'node:path'

export type AppPaths = ReturnType<typeof ensureAppPaths>

export function ensureAppPaths(root: string) {
  const vaultDir = path.join(root, 'vault')
  const vaultOriginalsDir = path.join(vaultDir, 'originals')
  const importReportsDir = path.join(root, 'reports')
  const sqliteDir = path.join(root, 'sqlite')

  for (const dir of [vaultDir, vaultOriginalsDir, importReportsDir, sqliteDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return {
    root,
    vaultDir,
    vaultOriginalsDir,
    importReportsDir,
    sqliteDir
  }
}
