import type {
  AgentMemoryRecord,
  AgentRole,
  ListAgentMemoriesInput
} from '../../shared/archiveContracts'
import {
  listAgentMemories,
  upsertAgentMemory
} from './governancePersistenceService'
import type { ArchiveDatabase } from './db'

type CreateAgentMemoryServiceInput = {
  db: ArchiveDatabase
}

export function createAgentMemoryService(input: CreateAgentMemoryServiceInput) {
  return {
    recordMemory(memoryInput: {
      role: AgentRole
      memoryKey: string
      memoryValue: string
    }): AgentMemoryRecord {
      return upsertAgentMemory(input.db, memoryInput)
    },
    listMemories(filter: ListAgentMemoriesInput = {}) {
      return listAgentMemories(input.db, filter)
    }
  }
}
