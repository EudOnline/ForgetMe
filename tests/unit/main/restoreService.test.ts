import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createBackupExport } from '../../../src/main/services/backupExportService'
import { restoreBackupExport, runRecoveryDrill } from '../../../src/main/services/restoreService'

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

  it('requires the correct password to restore an encrypted export package', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-encrypted-src-'))
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-encrypted-export-'))
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-restore-encrypted-target-'))
    const appPaths = ensureAppPaths(sourceRoot)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello encrypted restoration')

    const exported = await createBackupExport({
      appPaths,
      destinationRoot: exportRoot,
      encryptionPassword: 'correct horse battery staple'
    })

    await expect(
      restoreBackupExport({
        exportRoot: exported.exportRoot,
        targetRoot,
        overwrite: true,
        encryptionPassword: 'wrong password'
      })
    ).rejects.toThrow(/password/i)

    const restored = await restoreBackupExport({
      exportRoot: exported.exportRoot,
      targetRoot,
      overwrite: true,
      encryptionPassword: 'correct horse battery staple'
    })

    expect(restored.status).toBe('restored')
    expect(restored.checks.every((check) => check.status === 'passed')).toBe(true)
    expect(fs.existsSync(path.join(targetRoot, 'sqlite', 'archive.sqlite'))).toBe(true)
    db.close()
  })

  it('returns a diff-rich recovery drill report when restored evidence is missing', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-drill-src-'))
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-drill-export-'))
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-drill-target-'))
    const appPaths = ensureAppPaths(sourceRoot)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello recovery drill')

    const exported = await createBackupExport({ appPaths, destinationRoot: exportRoot })
    fs.rmSync(path.join(exported.exportRoot, 'vault', 'originals', 'ab', 'abcdef.txt'))

    const result = await runRecoveryDrill({
      exportRoot: exported.exportRoot,
      targetRoot,
      overwrite: true
    })

    expect(result.mode).toBe('recovery_drill')
    expect(result.status).toBe('failed')
    expect(result.summary.failedCount).toBeGreaterThan(0)
    expect(result.checks).toContainEqual(expect.objectContaining({
      name: 'vault_entry_count',
      status: 'failed',
      expected: expect.objectContaining({ count: 1 }),
      actual: expect.objectContaining({
        count: 0,
        missingRelativePaths: ['vault/originals/ab/abcdef.txt']
      })
    }))
    db.close()
  })

  it('allows running the same recovery drill repeatedly against the same target root', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-repeat-drill-src-'))
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-repeat-drill-export-'))
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-repeat-drill-target-'))
    const appPaths = ensureAppPaths(sourceRoot)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const objectPath = path.join(appPaths.vaultOriginalsDir, 'ab', 'abcdef.txt')
    fs.mkdirSync(path.dirname(objectPath), { recursive: true })
    fs.writeFileSync(objectPath, 'hello repeatable drill')

    const exported = await createBackupExport({ appPaths, destinationRoot: exportRoot })

    const first = await runRecoveryDrill({
      exportRoot: exported.exportRoot,
      targetRoot
    })
    const second = await runRecoveryDrill({
      exportRoot: exported.exportRoot,
      targetRoot
    })

    expect(first.status).toBe('restored')
    expect(second.status).toBe('restored')
    expect(second.summary.failedCount).toBe(0)
    db.close()
  })
})
