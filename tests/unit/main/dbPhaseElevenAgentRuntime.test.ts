import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-eleven agent runtime migrations', () => {
  it('creates agent runtime tables with expected indexes and foreign keys', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase11-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const tables = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'agent_runs',
      'agent_messages',
      'agent_memories',
      'agent_policy_versions'
    ]))

    const messageForeignKeys = db.prepare("pragma foreign_key_list('agent_messages')").all() as Array<{ table: string }>
    expect(messageForeignKeys.map((row) => row.table)).toContain('agent_runs')

    const indexes = db.prepare("select name from sqlite_master where type='index'").all() as Array<{ name: string }>
    const indexNames = indexes.map((row) => row.name)

    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_agent_runs_created_at',
      'idx_agent_runs_status',
      'idx_agent_runs_role',
      'idx_agent_messages_run_id',
      'idx_agent_memories_role',
      'idx_agent_policy_versions_role'
    ]))

    db.close()
  })
})
