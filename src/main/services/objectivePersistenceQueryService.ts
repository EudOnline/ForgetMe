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
import type { ArchiveDatabase } from './db'

type AgentObjectiveRow = {
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

type AgentThreadRow = {
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

type AgentThreadParticipantRow = {
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

type AgentMessageV2Row = {
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

type AgentProposalRow = {
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

type AgentVoteRow = {
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

type AgentCheckpointRow = {
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

type AgentToolExecutionRow = {
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

type AgentSubagentRow = {
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

export function getObjectiveRow(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      title,
      objective_kind as objectiveKind,
      status,
      prompt,
      initiated_by as initiatedBy,
      owner_role as ownerRole,
      main_thread_id as mainThreadId,
      risk_level as riskLevel,
      budget_json as budgetJson,
      requires_operator_input as requiresOperatorInput,
      created_at as createdAt,
      updated_at as updatedAt
    from agent_objectives
    where id = ?`
  ).get(objectiveId) as AgentObjectiveRow | undefined
}

export function getThreadRow(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      parent_thread_id as parentThreadId,
      thread_kind as threadKind,
      owner_role as ownerRole,
      title,
      status,
      created_at as createdAt,
      updated_at as updatedAt,
      closed_at as closedAt
    from agent_threads
    where id = ?`
  ).get(threadId) as AgentThreadRow | undefined
}

export function listObjectiveRows(db: ArchiveDatabase, input?: {
  status?: AgentObjectiveStatus
  ownerRole?: AgentRole
  limit?: number
}) {
  return db.prepare(
    `select
      id,
      title,
      objective_kind as objectiveKind,
      status,
      prompt,
      initiated_by as initiatedBy,
      owner_role as ownerRole,
      main_thread_id as mainThreadId,
      risk_level as riskLevel,
      budget_json as budgetJson,
      requires_operator_input as requiresOperatorInput,
      created_at as createdAt,
      updated_at as updatedAt
    from agent_objectives
    where (? is null or status = ?)
      and (? is null or owner_role = ?)
    order by created_at desc, id desc
    limit ?`
  ).all(
    input?.status ?? null,
    input?.status ?? null,
    input?.ownerRole ?? null,
    input?.ownerRole ?? null,
    input?.limit ?? 200
  ) as AgentObjectiveRow[]
}

export function getMessageRow(db: ArchiveDatabase, messageId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      from_participant_id as fromParticipantId,
      to_participant_id as toParticipantId,
      kind,
      body,
      refs_json as refsJson,
      reply_to_message_id as replyToMessageId,
      round,
      confidence,
      blocking,
      created_at as createdAt
    from agent_messages_v2
    where id = ?`
  ).get(messageId) as AgentMessageV2Row | undefined
}

export function getProposalRow(db: ArchiveDatabase, proposalId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where id = ?`
  ).get(proposalId) as AgentProposalRow | undefined
}

export function getVoteRow(db: ArchiveDatabase, voteId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      voter_role as voterRole,
      vote,
      comment,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_votes
    where id = ?`
  ).get(voteId) as AgentVoteRow | undefined
}

export function getCheckpointRow(db: ArchiveDatabase, checkpointId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_checkpoints
    where id = ?`
  ).get(checkpointId) as AgentCheckpointRow | undefined
}

export function getToolExecutionRow(db: ArchiveDatabase, toolExecutionId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where id = ?`
  ).get(toolExecutionId) as AgentToolExecutionRow | undefined
}

export function getSubagentRow(db: ArchiveDatabase, subagentId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where id = ?`
  ).get(subagentId) as AgentSubagentRow | undefined
}

export function listThreadRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      parent_thread_id as parentThreadId,
      thread_kind as threadKind,
      owner_role as ownerRole,
      title,
      status,
      created_at as createdAt,
      updated_at as updatedAt,
      closed_at as closedAt
    from agent_threads
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentThreadRow[]
}

export function listThreadParticipantRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      participant_kind as participantKind,
      participant_id as participantId,
      role,
      display_label as displayLabel,
      invited_by_participant_id as invitedByParticipantId,
      joined_at as joinedAt,
      left_at as leftAt
     from agent_thread_participants
     where thread_id = ?
     order by joined_at asc, rowid asc`
  ).all(threadId) as AgentThreadParticipantRow[]
}

export function listParticipantRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      participant_kind as participantKind,
      participant_id as participantId,
      role,
      display_label as displayLabel,
      invited_by_participant_id as invitedByParticipantId,
      joined_at as joinedAt,
      left_at as leftAt
     from agent_thread_participants
     where objective_id = ?
     order by joined_at asc, rowid asc`
  ).all(objectiveId) as AgentThreadParticipantRow[]
}

export function listMessageRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      from_participant_id as fromParticipantId,
      to_participant_id as toParticipantId,
      kind,
      body,
      refs_json as refsJson,
      reply_to_message_id as replyToMessageId,
      round,
      confidence,
      blocking,
      created_at as createdAt
    from agent_messages_v2
    where thread_id = ?
    order by round asc, created_at asc, id asc`
  ).all(threadId) as AgentMessageV2Row[]
}

export function listProposalRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentProposalRow[]
}

export function listProposalRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentProposalRow[]
}

export function listVoteRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      voter_role as voterRole,
      vote,
      comment,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_votes
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentVoteRow[]
}

export function listCheckpointRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_checkpoints
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentCheckpointRow[]
}

export function listCheckpointRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_checkpoints
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentCheckpointRow[]
}

export function listSubagentRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentSubagentRow[]
}

export function listSubagentRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentSubagentRow[]
}

export function listToolExecutionRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentToolExecutionRow[]
}

export function listToolExecutionRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentToolExecutionRow[]
}
