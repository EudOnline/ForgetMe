import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-two migrations', () => {
  it('creates canonical people and review tables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase2-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const rows = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'canonical_people',
      'person_aliases',
      'person_memberships',
      'person_merge_candidates',
      'event_clusters',
      'event_cluster_candidates',
      'review_queue',
      'decision_journal'
    ]))
  })
})
