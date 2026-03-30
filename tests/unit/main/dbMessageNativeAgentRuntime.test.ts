import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'

describe('message-native agent runtime migrations', () => {
  it('creates objective runtime tables with expected indexes and foreign keys', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const tables = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const tableNames = tables.map((row) => row.name)

    expect(tableNames).toEqual(expect.arrayContaining([
      'agent_objectives',
      'agent_threads',
      'agent_thread_participants',
      'agent_messages_v2',
      'agent_proposals',
      'agent_votes',
      'agent_tool_executions',
      'agent_checkpoints',
      'agent_role_state',
      'agent_subagents'
    ]))

    const indexes = db.prepare("select name from sqlite_master where type='index'").all() as Array<{ name: string }>
    const indexNames = indexes.map((row) => row.name)

    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_agent_objectives_status_created_at',
      'idx_agent_threads_objective_parent',
      'idx_agent_messages_v2_thread_round',
      'idx_agent_messages_v2_thread_created_at',
      'idx_agent_proposals_objective_status_owner',
      'idx_agent_checkpoints_objective_created_at',
      'idx_agent_subagents_parent_thread_status'
    ]))

    const proposalForeignKeys = db.prepare("pragma foreign_key_list('agent_proposals')").all() as Array<{ table: string }>
    expect(proposalForeignKeys.map((row) => row.table)).toEqual(expect.arrayContaining([
      'agent_objectives',
      'agent_threads'
    ]))

    const messageForeignKeys = db.prepare("pragma foreign_key_list('agent_messages_v2')").all() as Array<{ table: string }>
    expect(messageForeignKeys.map((row) => row.table)).toEqual(expect.arrayContaining([
      'agent_objectives',
      'agent_threads'
    ]))

    db.close()
  })
})
