import type {
  AgentArtifactRef,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecord,
  AgentMessageRecordV2,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentProposalKind,
  AgentRole,
  AgentRunRecord,
  AgentSkillPackId,
  AgentThreadRecord,
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

export type AgentMessageDraft = {
  toParticipantId?: string | null
  kind: AgentMessageKind
  body: string
  refs?: AgentArtifactRef[]
  blocking?: boolean
  confidence?: number | null
}

export type AgentProposalDraft = {
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  ownerRole: AgentRole
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  requiresOperatorConfirmation?: boolean
  toolPolicyId?: string | null
  budget?: AgentExecutionBudget | null
  artifactRefs?: AgentArtifactRef[]
}

export type SpawnSubagentDraft = {
  specialization: AgentSkillPackId
  payload?: Record<string, unknown>
  ownerRole: AgentRole
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  requiresOperatorConfirmation?: boolean
  toolPolicyId?: string | null
  budget?: AgentExecutionBudget | null
  artifactRefs?: AgentArtifactRef[]
}

export type AgentReceiveContext = {
  db: ArchiveDatabase
  objective: AgentObjectiveRecord
  thread: AgentThreadRecord
  participantId: string
  messages: AgentMessageRecordV2[]
  proposals: AgentProposalRecord[]
  round: number
}

export type AgentReceiveResult = {
  messages: AgentMessageDraft[]
  proposals?: AgentProposalDraft[]
  spawnRequests?: SpawnSubagentDraft[]
}

export type AgentAdapter = {
  role: AgentRole
  canHandle(taskKind: AgentTaskKind): boolean
  execute(context: AgentExecutionContext): Promise<AgentAdapterResult>
  receive?(context: AgentReceiveContext): Promise<AgentReceiveResult>
}
