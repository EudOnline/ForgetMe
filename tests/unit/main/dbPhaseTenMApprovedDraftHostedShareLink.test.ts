import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-ten-m hosted share link migrations', () => {
  it('creates hosted share boundary audit tables with expected columns and fks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10m-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const tables = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'persona_draft_share_host_artifacts',
      'persona_draft_share_host_events'
    ]))

    const eventFks = db.prepare("pragma foreign_key_list('persona_draft_share_host_events')").all() as Array<{ table: string }>
    expect(eventFks.map((row) => row.table)).toContain('persona_draft_share_host_artifacts')

    const artifactColumns = db.prepare("pragma table_info('persona_draft_share_host_artifacts')").all() as Array<{ name: string }>
    const artifactColumnNames = artifactColumns.map((column) => column.name)

    expect(artifactColumnNames).toEqual(expect.arrayContaining([
      'share_link_id',
      'draft_review_id',
      'publication_id',
      'source_turn_id',
      'operation_kind',
      'host_kind',
      'host_label',
      'request_hash'
    ]))

    db.close()
  })
})
