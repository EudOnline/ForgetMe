import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { buildBackupManifest } from '../../../src/main/services/backupManifestService'

describe('buildBackupManifest', () => {
  it('captures vault objects, database snapshot metadata, and key table counts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-manifest-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const manifest = buildBackupManifest({ appPaths })

    expect(manifest.formatVersion).toBe('phase6a1')
    expect(manifest.vaultEntries[0]?.relativePath).toContain('vault/originals/ab/abcdef.txt')
    expect(manifest.databaseSnapshot.relativePath).toBe('database/archive.sqlite')
    expect(manifest.tableCounts.vault_files).toBeTypeOf('number')
    db.close()
  })
})
