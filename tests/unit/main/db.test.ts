import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('database migrations', () => {
  it('creates the archive tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const tableNames = rows.map((row) => row.name)

    expect(tableNames).toEqual(expect.arrayContaining([
      'import_batches',
      'vault_files',
      'file_derivatives',
      'people',
      'relations',
      'audit_logs'
    ]))
  })

  it('can rerun migrations on an initialized database without duplicate-column failures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-db-rerun-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    expect(() => runMigrations(db)).not.toThrow()
  })
})
