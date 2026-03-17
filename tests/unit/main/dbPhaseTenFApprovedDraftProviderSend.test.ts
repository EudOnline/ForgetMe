import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-ten-f/h migrations', () => {
  it('creates approved draft provider boundary audit tables and destination columns', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10f-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'persona_draft_provider_egress_artifacts',
      'persona_draft_provider_egress_events'
    ]))

    const foreignKeys = db.prepare("pragma foreign_key_list('persona_draft_provider_egress_events')").all() as Array<{ table: string }>
    expect(foreignKeys.map((row) => row.table)).toContain('persona_draft_provider_egress_artifacts')

    const columns = db.prepare("pragma table_info('persona_draft_provider_egress_artifacts')").all() as Array<{ name: string }>
    const columnNames = columns.map((column) => column.name)

    expect(columnNames).toEqual(expect.arrayContaining([
      'destination_id',
      'destination_label',
      'attempt_kind',
      'retry_of_artifact_id'
    ]))

    db.close()
  })
})
