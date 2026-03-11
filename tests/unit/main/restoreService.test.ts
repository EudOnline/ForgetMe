import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createBackupExport } from '../../../src/main/services/backupExportService'
import { restoreBackupExport } from '../../../src/main/services/restoreService'

describe('restoreBackupExport', () => {
  it('restores an export package into a fresh target root and verifies counts', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-src-'))
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-export-'))
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-target-'))
    const appPaths = ensureAppPaths(sourceRoot)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello preservation')

    const exported = await createBackupExport({ appPaths, destinationRoot: exportRoot })
    const result = await restoreBackupExport({ exportRoot: exported.exportRoot, targetRoot, overwrite: true })

    expect(result.status).toBe('restored')
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true)
    expect(fs.existsSync(path.join(targetRoot, 'sqlite', 'archive.sqlite'))).toBe(true)
    db.close()
  })
})
