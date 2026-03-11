import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-six-a2 migrations', () => {
  it('creates redaction policy and provider egress audit tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6a2-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'redaction_policies',
      'provider_egress_artifacts',
      'provider_egress_events'
    ]))
    db.close()
  })
})
