import type {
  AgentMessageRecord,
  AgentRole,
  AgentRunRecord,
  AgentTaskKind,
  RunAgentTaskInput
} from '../../../shared/archiveContracts'
import type { ArchiveDatabase } from '../db'

export type AgentAdapterMessage = Pick<AgentMessageRecord, 'sender' | 'content'>

export type AgentAdapterResult = {
  messages?: AgentAdapterMessage[]
  summary?: string
}

export type AgentExecutionContext = {
  db: ArchiveDatabase
  run: AgentRunRecord
  input: RunAgentTaskInput
  taskKind: AgentTaskKind
  assignedRoles: AgentRole[]
}

export type AgentAdapter = {
  role: AgentRole
  canHandle(taskKind: AgentTaskKind): boolean
  execute(context: AgentExecutionContext): Promise<AgentAdapterResult>
}
