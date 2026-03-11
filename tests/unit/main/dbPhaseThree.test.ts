import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-three migrations', () => {
  it('creates enrichment tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase3-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'enrichment_jobs',
      'enrichment_artifacts',
      'enriched_evidence',
      'structured_field_candidates'
    ]))
  })
})
