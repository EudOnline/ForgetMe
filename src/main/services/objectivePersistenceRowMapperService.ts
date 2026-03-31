import type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecordV2,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentObjectiveRiskLevel,
  AgentObjectiveStatus,
  AgentParticipantKind,
  AgentProposalKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentRole,
  AgentSubagentRecord,
  AgentSubagentStatus,
  AgentToolExecutionRecord,
  AgentToolExecutionStatus,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentThreadStatus,
  AgentVoteRecord,
  AgentVoteValue
} from '../../shared/archiveContracts'

export type AgentObjectiveRow = {
  id: string
  title: string
  objectiveKind: AgentObjectiveKind
  status: AgentObjectiveStatus
  prompt: string
  initiatedBy: AgentObjectiveInitiator
  ownerRole: AgentRole
  mainThreadId: string | null
  riskLevel: AgentObjectiveRiskLevel
  budgetJson: string | null
  requiresOperatorInput: number
  createdAt: string
  updatedAt: string
}

export type AgentThreadRow = {
  id: string
  objectiveId: string
  parentThreadId: string | null
  threadKind: 'main' | 'subthread'
  ownerRole: AgentRole
  title: string
  status: AgentThreadStatus
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export type AgentThreadParticipantRow = {
  id: string
  objectiveId: string
  threadId: string
  participantKind: AgentParticipantKind
  participantId: string
  role: AgentRole | null
  displayLabel: string
  invitedByParticipantId: string | null
  joinedAt: string
  leftAt: string | null
}

export type AgentMessageV2Row = {
  id: string
  objectiveId: string
  threadId: string
  fromParticipantId: string
  toParticipantId: string | null
  kind: AgentMessageKind
  body: string
  refsJson: string
  replyToMessageId: string | null
  round: number
  confidence: number | null
  blocking: number
  createdAt: string
}

export type AgentProposalRow = {
  id: string
  objectiveId: string
  threadId: string
  proposedBy: string
  proposalKind: AgentProposalKind
  payloadJson: string
  ownerRole: AgentRole
  status: AgentProposalStatus
  requiredApprovalsJson: string
  allowVetoByJson: string
  requiresOperatorConfirmation: number
  toolPolicyId: string | null
  budgetJson: string | null
  derivedFromMessageIdsJson: string
  artifactRefsJson: string
  createdAt: string
  updatedAt: string
  committedAt: string | null
}

export type AgentVoteRow = {
  id: string
  objectiveId: string
  threadId: string
  proposalId: string
  voterRole: AgentRole
  vote: AgentVoteValue
  comment: string | null
  artifactRefsJson: string
  createdAt: string
}

export type AgentCheckpointRow = {
  id: string
  objectiveId: string
  threadId: string
  checkpointKind: AgentCheckpointKind
  title: string
  summary: string
  relatedMessageId: string | null
  relatedProposalId: string | null
  artifactRefsJson: string
  createdAt: string
}

export type AgentToolExecutionRow = {
  id: string
  objectiveId: string
  threadId: string
  proposalId: string | null
  requestedByParticipantId: string
  toolName: string
  toolPolicyId: string | null
  status: AgentToolExecutionStatus
  inputPayloadJson: string
  outputPayloadJson: string | null
  artifactRefsJson: string
  createdAt: string
  completedAt: string | null
}

export type AgentSubagentRow = {
  id: string
  objectiveId: string
  threadId: string
  parentThreadId: string
  parentAgentRole: AgentRole
  specialization: AgentSubagentRecord['specialization']
  skillPackIdsJson: string
  toolPolicyId: string
  budgetJson: string
  expectedOutputSchema: string
  status: AgentSubagentStatus
  summary: string | null
  createdAt: string
  completedAt: string | null
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function mapObjectiveRow(row: AgentObjectiveRow): AgentObjectiveRecord {
  return {
    objectiveId: row.id,
    title: row.title,
    objectiveKind: row.objectiveKind,
    status: row.status,
    prompt: row.prompt,
    initiatedBy: row.initiatedBy,
    ownerRole: row.ownerRole,
    mainThreadId: row.mainThreadId ?? '',
    riskLevel: row.riskLevel,
    budget: parseJsonObject<AgentExecutionBudget>(row.budgetJson),
    requiresOperatorInput: row.requiresOperatorInput === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function mapThreadRow(row: AgentThreadRow): AgentThreadRecord {
  return {
    threadId: row.id,
    objectiveId: row.objectiveId,
    parentThreadId: row.parentThreadId,
    threadKind: row.threadKind,
    ownerRole: row.ownerRole,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt
  }
}

export function mapThreadParticipantRow(row: AgentThreadParticipantRow): AgentThreadParticipantRecord {
  return {
    threadParticipantId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    participantKind: row.participantKind,
    participantId: row.participantId,
    role: row.role,
    displayLabel: row.displayLabel,
    invitedByParticipantId: row.invitedByParticipantId,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt
  }
}

export function mapMessageRow(row: AgentMessageV2Row): AgentMessageRecordV2 {
  return {
    messageId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    fromParticipantId: row.fromParticipantId,
    toParticipantId: row.toParticipantId,
    kind: row.kind,
    body: row.body,
    refs: parseJsonArray<AgentArtifactRef>(row.refsJson),
    replyToMessageId: row.replyToMessageId,
    round: row.round,
    confidence: row.confidence,
    blocking: row.blocking === 1,
    createdAt: row.createdAt
  }
}

export function mapProposalRow(row: AgentProposalRow): AgentProposalRecord {
  return {
    proposalId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    proposedByParticipantId: row.proposedBy,
    proposalKind: row.proposalKind,
    payload: parseJsonObject<Record<string, unknown>>(row.payloadJson) ?? {},
    ownerRole: row.ownerRole,
    status: row.status,
    requiredApprovals: parseJsonArray<AgentRole>(row.requiredApprovalsJson),
    allowVetoBy: parseJsonArray<AgentRole>(row.allowVetoByJson),
    requiresOperatorConfirmation: row.requiresOperatorConfirmation === 1,
    toolPolicyId: row.toolPolicyId,
    budget: parseJsonObject<AgentExecutionBudget>(row.budgetJson),
    derivedFromMessageIds: parseJsonArray<string>(row.derivedFromMessageIdsJson),
    artifactRefs: parseJsonArray<AgentArtifactRef>(row.artifactRefsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    committedAt: row.committedAt
  }
}

export function mapVoteRow(row: AgentVoteRow): AgentVoteRecord {
  return {
    voteId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    proposalId: row.proposalId,
    voterRole: row.voterRole,
    vote: row.vote,
    comment: row.comment,
    createdAt: row.createdAt
  }
}

export function mapCheckpointRow(row: AgentCheckpointRow): AgentCheckpointRecord {
  return {
    checkpointId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    checkpointKind: row.checkpointKind,
    title: row.title,
    summary: row.summary,
    relatedMessageId: row.relatedMessageId,
    relatedProposalId: row.relatedProposalId,
    artifactRefs: parseJsonArray<AgentArtifactRef>(row.artifactRefsJson),
    createdAt: row.createdAt
  }
}

export function mapToolExecutionRow(row: AgentToolExecutionRow): AgentToolExecutionRecord {
  return {
    toolExecutionId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    proposalId: row.proposalId,
    requestedByParticipantId: row.requestedByParticipantId,
    toolName: row.toolName,
    toolPolicyId: row.toolPolicyId,
    status: row.status,
    inputPayload: parseJsonObject<Record<string, unknown>>(row.inputPayloadJson) ?? {},
    outputPayload: parseJsonObject<Record<string, unknown>>(row.outputPayloadJson),
    artifactRefs: parseJsonArray<AgentArtifactRef>(row.artifactRefsJson),
    createdAt: row.createdAt,
    completedAt: row.completedAt
  }
}

export function mapSubagentRow(row: AgentSubagentRow): AgentSubagentRecord {
  return {
    subagentId: row.id,
    objectiveId: row.objectiveId,
    threadId: row.threadId,
    parentThreadId: row.parentThreadId,
    parentAgentRole: row.parentAgentRole,
    specialization: row.specialization,
    skillPackIds: parseJsonArray<AgentSubagentRecord['specialization']>(row.skillPackIdsJson),
    toolPolicyId: row.toolPolicyId,
    budget: parseJsonObject<AgentExecutionBudget>(row.budgetJson) ?? {
      maxRounds: 1,
      maxToolCalls: 1,
      timeoutMs: 1
    },
    expectedOutputSchema: row.expectedOutputSchema,
    status: row.status,
    summary: row.summary,
    createdAt: row.createdAt,
    completedAt: row.completedAt
  }
}
