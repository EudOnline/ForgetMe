import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-four migrations', () => {
  it('creates runner and profile projection tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase4-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'enrichment_attempts',
      'person_profile_attributes',
      'profile_attribute_candidates'
    ]))
    db.close()
  })
})
