import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createBackupExport } from '../../../src/main/services/backupExportService'

describe('createBackupExport', () => {
  it('writes a manifest, database snapshot, and vault copy into a new export directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-export-src-'))
    const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-export-dst-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const result = await createBackupExport({ appPaths, destinationRoot })

    expect(fs.existsSync(path.join(result.exportRoot, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(result.exportRoot, 'database', 'archive.sqlite'))).toBe(true)
    expect(fs.existsSync(path.join(result.exportRoot, 'vault', 'originals', 'ab', 'abcdef.txt'))).toBe(true)
    db.close()
  })
})
