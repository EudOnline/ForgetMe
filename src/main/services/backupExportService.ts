import fs from 'node:fs'
import path from 'node:path'
import type { BackupExportResult } from '../../shared/archiveContracts'
import type { AppPaths } from './appPaths'
import { buildBackupManifest } from './backupManifestService'

export async function createBackupExport(input: { appPaths: AppPaths; destinationRoot: string }): Promise<BackupExportResult> {
  const { appPaths, destinationRoot } = input
  const manifest = buildBackupManifest({ appPaths })
  const exportRoot = path.join(destinationRoot, manifest.exportRootName)
  const databaseSourcePath = path.join(appPaths.sqliteDir, 'archive.sqlite')
  const databaseDestinationPath = path.join(exportRoot, 'database', 'archive.sqlite')
  const vaultDestinationPath = path.join(exportRoot, 'vault', 'originals')
  const manifestPath = path.join(exportRoot, 'manifest.json')

  fs.mkdirSync(path.dirname(databaseDestinationPath), { recursive: true })
  fs.mkdirSync(vaultDestinationPath, { recursive: true })
  fs.copyFileSync(databaseSourcePath, databaseDestinationPath)

  if (fs.existsSync(appPaths.vaultOriginalsDir)) {
    fs.cpSync(appPaths.vaultOriginalsDir, vaultDestinationPath, { recursive: true })
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return {
    status: 'exported',
    exportRoot,
    manifestPath,
    vaultEntryCount: manifest.vaultEntries.length,
    totalBytes: manifest.databaseSnapshot.fileSize + manifest.vaultEntries.reduce((sum, entry) => sum + entry.fileSize, 0),
    manifest
  }
}
