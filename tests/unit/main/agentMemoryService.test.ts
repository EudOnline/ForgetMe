import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createAgentMemoryService } from '../../../src/main/services/agentMemoryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-memory-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('agent memory service', () => {
  it('upserts operational memory and recalls the latest value', () => {
    const db = setupDatabase()
    const service = createAgentMemoryService({ db })

    service.recordMemory({
      role: 'governance',
      memoryKey: 'governance.feedback',
      memoryValue: 'Initial note'
    })
    service.recordMemory({
      role: 'governance',
      memoryKey: 'governance.feedback',
      memoryValue: 'Updated note'
    })

    const memories = service.listMemories({
      role: 'governance'
    })

    expect(memories).toHaveLength(1)
    expect(memories[0]?.memoryValue).toBe('Updated note')

    db.close()
  })
})
