import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('phase-twelve agent runtime run metadata migrations', () => {
  it('adds replay metadata columns to agent_runs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase12-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const columns = db.prepare("pragma table_info('agent_runs')").all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    const byName = new Map(columns.map((column) => [column.name, column]))

    expect(byName.get('target_role')).toBeTruthy()
    expect(byName.get('assigned_roles_json')).toBeTruthy()
    expect(byName.get('latest_assistant_response')).toBeTruthy()
    expect(byName.get('assigned_roles_json')?.notnull).toBe(1)
    expect(byName.get('assigned_roles_json')?.dflt_value).toBe("'[]'")

    db.close()
  })
})
