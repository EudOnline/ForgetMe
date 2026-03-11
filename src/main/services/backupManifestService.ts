import fs from 'node:fs'
import path from 'node:path'
import type { BackupManifest, BackupManifestEntry } from '../../shared/archiveContracts'
import type { AppPaths } from './appPaths'
import { openDatabase } from './db'
import { hashFileSha256 } from './vaultService'

const CORE_TABLE_NAMES = [
  'import_batches',
  'vault_files',
  'canonical_people',
  'review_queue',
  'decision_journal',
  'enrichment_jobs',
  'enriched_evidence',
  'structured_field_candidates',
  'person_profile_attributes'
] as const

function getAppVersion() {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string }
  return packageJson.version ?? '0.0.0'
}

function listFilesRecursive(root: string): string[] {
  if (!fs.existsSync(root)) {
    return []
  }

  const results: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(absolutePath))
      continue
    }

    if (entry.isFile()) {
      results.push(absolutePath)
    }
  }

  return results.sort()
}

function buildEntryFromAbsolutePath(appPaths: AppPaths, absolutePath: string): BackupManifestEntry {
  const relativePath = path.relative(appPaths.root, absolutePath).split(path.sep).join('/')
  const stat = fs.statSync(absolutePath)

  return {
    relativePath,
    fileSize: stat.size,
    sha256: hashFileSha256(absolutePath)
  }
}

function tableExists(dbFile: string, tableName: string) {
  const db = openDatabase(dbFile)
  try {
    const row = db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(tableName) as { name: string } | undefined
    return Boolean(row?.name)
  } finally {
    db.close()
  }
}

function countTableRows(dbFile: string, tableName: string) {
  if (!tableExists(dbFile, tableName)) {
    return 0
  }

  const db = openDatabase(dbFile)
  try {
    const row = db.prepare(`select count(*) as count from ${tableName}`).get() as { count: number }
    return Number(row.count ?? 0)
  } finally {
    db.close()
  }
}

export function buildBackupManifest(input: { appPaths: AppPaths }): BackupManifest {
  const { appPaths } = input
  const databasePath = path.join(appPaths.sqliteDir, 'archive.sqlite')
  const exportRootName = `forgetme-export-${new Date().toISOString().replaceAll(':', '-')}`
  const vaultEntries = listFilesRecursive(appPaths.vaultOriginalsDir).map((absolutePath) => buildEntryFromAbsolutePath(appPaths, absolutePath))
  const tableCounts = Object.fromEntries(CORE_TABLE_NAMES.map((tableName) => [tableName, countTableRows(databasePath, tableName)]))

  return {
    formatVersion: 'phase6a1',
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    exportRootName,
    databaseSnapshot: {
      relativePath: 'database/archive.sqlite',
      fileSize: fs.statSync(databasePath).size,
      sha256: hashFileSha256(databasePath)
    },
    vaultEntries,
    tableCounts
  }
}
