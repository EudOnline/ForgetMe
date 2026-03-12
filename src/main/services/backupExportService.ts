import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import zlib from 'node:zlib'
import type { BackupExportResult, BackupManifest } from '../../shared/archiveContracts'
import type { AppPaths } from './appPaths'
import { buildBackupManifest } from './backupManifestService'

function buildEncryptedPayload(input: { appPaths: AppPaths; databaseSourcePath: string; vaultRelativePaths: string[] }) {
  const { appPaths, databaseSourcePath, vaultRelativePaths } = input

  return {
    database: {
      relativePath: 'database/archive.sqlite',
      contentBase64: fs.readFileSync(databaseSourcePath).toString('base64')
    },
    vaultEntries: vaultRelativePaths.map((relativePath) => ({
      relativePath,
      contentBase64: fs.readFileSync(path.join(appPaths.root, relativePath)).toString('base64')
    }))
  }
}

function encryptExportPayload(input: { payload: Record<string, unknown>; encryptionPassword: string }) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(input.encryptionPassword, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const compressedPayload = zlib.gzipSync(Buffer.from(JSON.stringify(input.payload)))
  const encrypted = Buffer.concat([cipher.update(compressedPayload), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    saltBase64: salt.toString('base64'),
    ivBase64: iv.toString('base64'),
    authTagBase64: authTag.toString('base64')
  }
}

export async function createBackupExport(input: { appPaths: AppPaths; destinationRoot: string; encryptionPassword?: string }): Promise<BackupExportResult> {
  const { appPaths, destinationRoot, encryptionPassword } = input
  const baseManifest = buildBackupManifest({ appPaths })
  const exportRoot = path.join(destinationRoot, baseManifest.exportRootName)
  const databaseSourcePath = path.join(appPaths.sqliteDir, 'archive.sqlite')
  const databaseDestinationPath = path.join(exportRoot, 'database', 'archive.sqlite')
  const vaultDestinationPath = path.join(exportRoot, 'vault', 'originals')
  const manifestPath = path.join(exportRoot, 'manifest.json')
  const encryptedArtifactPath = path.join(exportRoot, 'package', 'archive.enc')
  const vaultRelativePaths = baseManifest.vaultEntries.map((entry) => entry.relativePath)

  const manifest: BackupManifest = encryptionPassword
    ? {
        ...baseManifest,
        package: {
          mode: 'encrypted',
          encryptedArtifactRelativePath: 'package/archive.enc',
          algorithm: 'aes-256-gcm',
          kdf: 'scrypt',
          saltBase64: '',
          ivBase64: '',
          authTagBase64: '',
          payloadEncoding: 'gzip-json-v1'
        }
      }
    : {
        ...baseManifest,
        package: {
          mode: 'directory'
        }
      }

  fs.mkdirSync(exportRoot, { recursive: true })

  if (encryptionPassword) {
    fs.mkdirSync(path.dirname(encryptedArtifactPath), { recursive: true })
    const encryptedPackage = encryptExportPayload({
      payload: buildEncryptedPayload({
        appPaths,
        databaseSourcePath,
        vaultRelativePaths
      }),
      encryptionPassword
    })

    manifest.package = {
      mode: 'encrypted',
      encryptedArtifactRelativePath: 'package/archive.enc',
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      saltBase64: encryptedPackage.saltBase64,
      ivBase64: encryptedPackage.ivBase64,
      authTagBase64: encryptedPackage.authTagBase64,
      payloadEncoding: 'gzip-json-v1'
    }
    fs.writeFileSync(encryptedArtifactPath, encryptedPackage.encrypted)
  } else {
    fs.mkdirSync(path.dirname(databaseDestinationPath), { recursive: true })
    fs.mkdirSync(vaultDestinationPath, { recursive: true })
    fs.copyFileSync(databaseSourcePath, databaseDestinationPath)

    if (fs.existsSync(appPaths.vaultOriginalsDir)) {
      fs.cpSync(appPaths.vaultOriginalsDir, vaultDestinationPath, { recursive: true })
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return {
    status: 'exported',
    exportRoot,
    manifestPath,
    vaultEntryCount: manifest.vaultEntries.length,
    totalBytes: encryptionPassword
      ? fs.statSync(encryptedArtifactPath).size
      : manifest.databaseSnapshot.fileSize + manifest.vaultEntries.reduce((sum, entry) => sum + entry.fileSize, 0),
    packageMode: manifest.package?.mode ?? 'directory',
    encryptedArtifactPath: manifest.package?.mode === 'encrypted' ? encryptedArtifactPath : null,
    manifest
  }
}
