import fs from 'node:fs'
import path from 'node:path'
import type { BackupManifest, RestoreCheckResult, RestoreRunResult } from '../../shared/archiveContracts'
import { ensureAppPaths } from './appPaths'
import { openDatabase } from './db'
import { hashFileSha256 } from './vaultService'

function isDirectoryEmpty(root: string) {
  if (!fs.existsSync(root)) {
    return true
  }

  return fs.readdirSync(root).length === 0
}

function countTableRows(databasePath: string, tableName: string) {
  const db = openDatabase(databasePath)
  try {
    const exists = db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(tableName) as { name: string } | undefined
    if (!exists) {
      return 0
    }

    const row = db.prepare(`select count(*) as count from ${tableName}`).get() as { count: number }
    return Number(row.count ?? 0)
  } finally {
    db.close()
  }
}

function readManifest(exportRoot: string) {
  const manifestPath = path.join(exportRoot, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing backup manifest at ${manifestPath}`)
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest
}

export function verifyRestoredBackup(input: { exportRoot: string; targetRoot: string }): RestoreCheckResult[] {
  const { exportRoot, targetRoot } = input
  const manifest = readManifest(exportRoot)
  const restoredDatabasePath = path.join(targetRoot, 'sqlite', 'archive.sqlite')
  const checks: RestoreCheckResult[] = []

  const databaseHashMatches = fs.existsSync(restoredDatabasePath) && hashFileSha256(restoredDatabasePath) === manifest.databaseSnapshot.sha256
  checks.push({
    name: 'database_hash',
    status: databaseHashMatches ? 'passed' : 'failed',
    detail: databaseHashMatches ? 'Restored database hash matches manifest.' : 'Restored database hash does not match manifest.'
  })

  const tableCountsMatch = Object.entries(manifest.tableCounts).every(([tableName, expectedCount]) => countTableRows(restoredDatabasePath, tableName) === expectedCount)
  checks.push({
    name: 'table_counts',
    status: tableCountsMatch ? 'passed' : 'failed',
    detail: tableCountsMatch ? 'Restored table counts match manifest.' : 'Restored table counts differ from manifest.'
  })

  const restoredVaultFiles = manifest.vaultEntries.map((entry) => path.join(targetRoot, entry.relativePath))
  const vaultEntryCountMatches = restoredVaultFiles.filter((filePath) => fs.existsSync(filePath)).length === manifest.vaultEntries.length
  checks.push({
    name: 'vault_entry_count',
    status: vaultEntryCountMatches ? 'passed' : 'failed',
    detail: vaultEntryCountMatches ? 'Restored vault entry count matches manifest.' : 'Restored vault entry count differs from manifest.'
  })

  const vaultHashesMatch = manifest.vaultEntries.every((entry) => {
    const restoredPath = path.join(targetRoot, entry.relativePath)
    return fs.existsSync(restoredPath) && hashFileSha256(restoredPath) === entry.sha256
  })
  checks.push({
    name: 'vault_hashes',
    status: vaultHashesMatch ? 'passed' : 'failed',
    detail: vaultHashesMatch ? 'Restored vault file hashes match manifest.' : 'One or more restored vault file hashes differ from manifest.'
  })

  return checks
}

export async function restoreBackupExport(input: { exportRoot: string; targetRoot: string; overwrite?: boolean }): Promise<RestoreRunResult> {
  const { exportRoot, targetRoot, overwrite = false } = input
  const manifest = readManifest(exportRoot)

  if (!isDirectoryEmpty(targetRoot) && !overwrite) {
    throw new Error(`Target root is not empty: ${targetRoot}`)
  }

  if (overwrite) {
    fs.rmSync(targetRoot, { recursive: true, force: true })
  }

  fs.mkdirSync(targetRoot, { recursive: true })
  const appPaths = ensureAppPaths(targetRoot)
  const exportDatabasePath = path.join(exportRoot, manifest.databaseSnapshot.relativePath)
  const exportVaultRoot = path.join(exportRoot, 'vault', 'originals')

  fs.copyFileSync(exportDatabasePath, path.join(appPaths.sqliteDir, 'archive.sqlite'))
  if (fs.existsSync(exportVaultRoot)) {
    fs.cpSync(exportVaultRoot, appPaths.vaultOriginalsDir, { recursive: true })
  }

  const checks = verifyRestoredBackup({ exportRoot, targetRoot })
  const status = checks.every((check) => check.status === 'passed') ? 'restored' : 'failed'

  return {
    status,
    exportRoot,
    targetRoot,
    restoredAt: new Date().toISOString(),
    checks
  }
}
