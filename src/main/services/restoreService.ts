import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
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

function summarizeChecks(checks: RestoreCheckResult[]) {
  return {
    passedCount: checks.filter((check) => check.status === 'passed').length,
    failedCount: checks.filter((check) => check.status === 'failed').length
  }
}

function readManifest(exportRoot: string) {
  const manifestPath = path.join(exportRoot, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing backup manifest at ${manifestPath}`)
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest
}

function packageMode(manifest: BackupManifest) {
  return manifest.package?.mode ?? 'directory'
}

function decryptEncryptedExport(input: {
  exportRoot: string
  manifest: BackupManifest
  encryptionPassword?: string
}) {
  const { exportRoot, manifest, encryptionPassword } = input

  if (packageMode(manifest) !== 'encrypted') {
    throw new Error('Encrypted package metadata is missing')
  }
  if (!encryptionPassword) {
    throw new Error('Encrypted backup requires a password')
  }

  const encryptedPath = path.join(exportRoot, manifest.package.encryptedArtifactRelativePath)
  const encryptedBytes = fs.readFileSync(encryptedPath)
  const key = crypto.scryptSync(encryptionPassword, Buffer.from(manifest.package.saltBase64, 'base64'), 32)
  const decipher = crypto.createDecipheriv(
    manifest.package.algorithm,
    key,
    Buffer.from(manifest.package.ivBase64, 'base64')
  )

  decipher.setAuthTag(Buffer.from(manifest.package.authTagBase64, 'base64'))

  try {
    const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()])
    return JSON.parse(zlib.gunzipSync(decrypted).toString('utf8')) as {
      database: {
        relativePath: string
        contentBase64: string
      }
      vaultEntries: Array<{
        relativePath: string
        contentBase64: string
      }>
    }
  } catch {
    throw new Error('Encrypted backup password is invalid or the package is corrupted')
  }
}

export function verifyRestoredBackup(input: { exportRoot: string; targetRoot: string }): RestoreCheckResult[] {
  const { exportRoot, targetRoot } = input
  const manifest = readManifest(exportRoot)
  const restoredDatabasePath = path.join(targetRoot, 'sqlite', 'archive.sqlite')
  const checks: RestoreCheckResult[] = []

  const actualDatabaseHash = fs.existsSync(restoredDatabasePath) ? hashFileSha256(restoredDatabasePath) : null
  const databaseHashMatches = actualDatabaseHash === manifest.databaseSnapshot.sha256
  checks.push({
    name: 'database_hash',
    status: databaseHashMatches ? 'passed' : 'failed',
    detail: databaseHashMatches ? 'Restored database hash matches manifest.' : 'Restored database hash does not match manifest.',
    expected: {
      sha256: manifest.databaseSnapshot.sha256
    },
    actual: {
      sha256: actualDatabaseHash
    }
  })

  const actualTableCounts = Object.fromEntries(
    Object.keys(manifest.tableCounts).map((tableName) => [tableName, countTableRows(restoredDatabasePath, tableName)])
  )
  const tableCountDiffs = Object.entries(manifest.tableCounts)
    .filter(([tableName, expectedCount]) => actualTableCounts[tableName] !== expectedCount)
    .map(([tableName, expectedCount]) => ({
      tableName,
      expectedCount,
      actualCount: actualTableCounts[tableName]
    }))
  const tableCountsMatch = tableCountDiffs.length === 0
  checks.push({
    name: 'table_counts',
    status: tableCountsMatch ? 'passed' : 'failed',
    detail: tableCountsMatch ? 'Restored table counts match manifest.' : 'Restored table counts differ from manifest.',
    expected: {
      tableCounts: manifest.tableCounts
    },
    actual: {
      tableCounts: actualTableCounts,
      mismatchedTables: tableCountDiffs
    }
  })

  const restoredVaultFiles = manifest.vaultEntries.map((entry) => ({
    relativePath: entry.relativePath,
    exists: fs.existsSync(path.join(targetRoot, entry.relativePath))
  }))
  const missingRelativePaths = restoredVaultFiles.filter((entry) => !entry.exists).map((entry) => entry.relativePath)
  const existingVaultCount = restoredVaultFiles.filter((entry) => entry.exists).length
  const vaultEntryCountMatches = existingVaultCount === manifest.vaultEntries.length
  checks.push({
    name: 'vault_entry_count',
    status: vaultEntryCountMatches ? 'passed' : 'failed',
    detail: vaultEntryCountMatches ? 'Restored vault entry count matches manifest.' : 'Restored vault entry count differs from manifest.',
    expected: {
      count: manifest.vaultEntries.length
    },
    actual: {
      count: existingVaultCount,
      missingRelativePaths
    }
  })

  const mismatchedEntries = manifest.vaultEntries.flatMap((entry) => {
    const restoredPath = path.join(targetRoot, entry.relativePath)
    const actualSha256 = fs.existsSync(restoredPath) ? hashFileSha256(restoredPath) : null
    return actualSha256 === entry.sha256
      ? []
      : [{
          relativePath: entry.relativePath,
          expectedSha256: entry.sha256,
          actualSha256
        }]
  })
  const vaultHashesMatch = mismatchedEntries.length === 0
  checks.push({
    name: 'vault_hashes',
    status: vaultHashesMatch ? 'passed' : 'failed',
    detail: vaultHashesMatch ? 'Restored vault file hashes match manifest.' : 'One or more restored vault file hashes differ from manifest.',
    expected: {
      count: manifest.vaultEntries.length
    },
    actual: {
      mismatchedEntries
    }
  })

  return checks
}

export async function restoreBackupExport(input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }): Promise<RestoreRunResult> {
  const { exportRoot, targetRoot, overwrite = false, encryptionPassword } = input
  const manifest = readManifest(exportRoot)

  if (!isDirectoryEmpty(targetRoot) && !overwrite) {
    throw new Error(`Target root is not empty: ${targetRoot}`)
  }

  if (overwrite) {
    fs.rmSync(targetRoot, { recursive: true, force: true })
  }

  fs.mkdirSync(targetRoot, { recursive: true })
  const appPaths = ensureAppPaths(targetRoot)
  if (packageMode(manifest) === 'encrypted') {
    const payload = decryptEncryptedExport({ exportRoot, manifest, encryptionPassword })

    fs.writeFileSync(path.join(appPaths.sqliteDir, 'archive.sqlite'), Buffer.from(payload.database.contentBase64, 'base64'))
    for (const entry of payload.vaultEntries) {
      const restoredPath = path.join(targetRoot, entry.relativePath)
      fs.mkdirSync(path.dirname(restoredPath), { recursive: true })
      fs.writeFileSync(restoredPath, Buffer.from(entry.contentBase64, 'base64'))
    }
  } else {
    const exportDatabasePath = path.join(exportRoot, manifest.databaseSnapshot.relativePath)
    const exportVaultRoot = path.join(exportRoot, 'vault', 'originals')

    fs.copyFileSync(exportDatabasePath, path.join(appPaths.sqliteDir, 'archive.sqlite'))
    if (fs.existsSync(exportVaultRoot)) {
      fs.cpSync(exportVaultRoot, appPaths.vaultOriginalsDir, { recursive: true })
    }
  }

  const checks = verifyRestoredBackup({ exportRoot, targetRoot })
  const status = checks.every((check) => check.status === 'passed') ? 'restored' : 'failed'

  return {
    status,
    mode: 'restore',
    exportRoot,
    targetRoot,
    restoredAt: new Date().toISOString(),
    summary: summarizeChecks(checks),
    checks
  }
}

export async function runRecoveryDrill(input: {
  exportRoot: string
  targetRoot: string
  overwrite?: boolean
  encryptionPassword?: string
}): Promise<RestoreRunResult> {
  const restored = await restoreBackupExport({
    ...input,
    overwrite: input.overwrite ?? true
  })
  return {
    ...restored,
    mode: 'recovery_drill'
  }
}
