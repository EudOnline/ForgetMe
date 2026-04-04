import crypto from 'node:crypto'
import type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointMetadata,
  AgentCheckpointRecord,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecordV2,
  AgentProposalKind,
  AgentProposalAutonomyDecision,
  AgentProposalRecord,
  AgentProposalRiskLevel,
  AgentProposalStatus,
  AgentSubagentRecord,
  AgentSubagentStatus,
  AgentToolExecutionRecord,
  AgentToolExecutionStatus,
  AgentVoteRecord,
  AgentVoteValue
} from '../../shared/objectiveRuntimeContracts'
import type { AgentRole } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getCheckpointRow,
  getMessageRow,
  getProposalRow,
  getSubagentRow,
  getToolExecutionRow,
  getVoteRow,
  mapCheckpointRow,
  mapMessageRow,
  mapProposalRow,
  mapSubagentRow,
  mapToolExecutionRow,
  mapVoteRow
} from './objectivePersistenceQueryService'

export type AppendAgentMessageV2Input = {
  messageId?: string
  objectiveId: string
  threadId: string
  fromParticipantId: string
  toParticipantId?: string | null
  kind: AgentMessageKind
  body: string
  refs?: AgentArtifactRef[]
  replyToMessageId?: string | null
  round: number
  confidence?: number | null
  blocking?: boolean
  createdAt?: string
}

export type CreateProposalInput = {
  proposalId?: string
  objectiveId: string
  threadId: string
  proposedByParticipantId: string
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  ownerRole: AgentRole
  status?: AgentProposalStatus
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  proposalRiskLevel?: AgentProposalRiskLevel
  autonomyDecision?: AgentProposalAutonomyDecision
  riskReasons?: string[]
  confidenceScore?: number | null
  requiresOperatorConfirmation?: boolean
  toolPolicyId?: string | null
  budget?: AgentExecutionBudget | null
  derivedFromMessageIds?: string[]
  artifactRefs?: AgentArtifactRef[]
  createdAt?: string
  updatedAt?: string
  committedAt?: string | null
}

export type RecordProposalVoteInput = {
  voteId?: string
  objectiveId: string
  threadId: string
  proposalId: string
  voterRole: AgentRole
  vote: AgentVoteValue
  comment?: string | null
  artifactRefs?: AgentArtifactRef[]
  createdAt?: string
}

export type CreateCheckpointInput = {
  checkpointId?: string
  objectiveId: string
  threadId: string
  checkpointKind: AgentCheckpointKind
  title: string
  summary: string
  relatedMessageId?: string | null
  relatedProposalId?: string | null
  artifactRefs?: AgentArtifactRef[]
  metadata?: AgentCheckpointMetadata
  createdAt?: string
}

export type CreateToolExecutionInput = {
  toolExecutionId?: string
  objectiveId: string
  threadId: string
  proposalId?: string | null
  requestedByParticipantId: string
  toolName: string
  toolPolicyId?: string | null
  status?: AgentToolExecutionStatus
  inputPayload: Record<string, unknown>
  outputPayload?: Record<string, unknown> | null
  artifactRefs?: AgentArtifactRef[]
  createdAt?: string
  completedAt?: string | null
}

export type UpdateToolExecutionInput = {
  toolExecutionId: string
  status: AgentToolExecutionStatus
  outputPayload?: Record<string, unknown> | null
  artifactRefs?: AgentArtifactRef[]
  completedAt?: string | null
}

export type CreateSubagentInput = {
  subagentId?: string
  objectiveId: string
  threadId: string
  parentThreadId: string
  parentAgentRole: AgentRole
  specialization: AgentSubagentRecord['specialization']
  skillPackIds: AgentSubagentRecord['skillPackIds']
  toolPolicyId: string
  budget: AgentExecutionBudget
  expectedOutputSchema: string
  status?: AgentSubagentStatus
  summary?: string | null
  createdAt?: string
  completedAt?: string | null
}

export type UpdateSubagentInput = {
  subagentId: string
  status: AgentSubagentStatus
  summary?: string | null
  completedAt?: string | null
}

function serializeJson(value: unknown) {
  return JSON.stringify(value)
}

function nowIso() {
  return new Date().toISOString()
}

export function appendAgentMessageV2(db: ArchiveDatabase, input: AppendAgentMessageV2Input): AgentMessageRecordV2 {
  const messageId = input.messageId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()

  db.prepare(
    `insert into agent_messages_v2 (
      id,
      objective_id,
      thread_id,
      from_participant_id,
      to_participant_id,
      kind,
      body,
      refs_json,
      reply_to_message_id,
      round,
      confidence,
      blocking,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    messageId,
    input.objectiveId,
    input.threadId,
    input.fromParticipantId,
    input.toParticipantId ?? null,
    input.kind,
    input.body,
    serializeJson(input.refs ?? []),
    input.replyToMessageId ?? null,
    input.round,
    input.confidence ?? null,
    input.blocking ? 1 : 0,
    createdAt
  )

  const row = getMessageRow(db, messageId)
  if (!row) {
    throw new Error('failed to append message')
  }

  return mapMessageRow(row)
}

export function createProposal(db: ArchiveDatabase, input: CreateProposalInput): AgentProposalRecord {
  const proposalId = input.proposalId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()
  const updatedAt = input.updatedAt ?? createdAt

  db.prepare(
    `insert into agent_proposals (
      id,
      objective_id,
      thread_id,
      proposed_by,
      proposal_kind,
      payload_json,
      owner_role,
      status,
      required_approvals_json,
      allow_veto_by_json,
      proposal_risk_level,
      autonomy_decision,
      risk_reasons_json,
      confidence_score,
      requires_operator_confirmation,
      tool_policy_id,
      budget_json,
      derived_from_message_ids_json,
      artifact_refs_json,
      created_at,
      updated_at,
      committed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    proposalId,
    input.objectiveId,
    input.threadId,
    input.proposedByParticipantId,
    input.proposalKind,
    serializeJson(input.payload),
    input.ownerRole,
    input.status ?? 'open',
    serializeJson(input.requiredApprovals ?? []),
    serializeJson(input.allowVetoBy ?? []),
    input.proposalRiskLevel ?? 'medium',
    input.autonomyDecision ?? 'await_operator',
    serializeJson(input.riskReasons ?? []),
    input.confidenceScore ?? null,
    input.requiresOperatorConfirmation ? 1 : 0,
    input.toolPolicyId ?? null,
    input.budget ? serializeJson(input.budget) : null,
    serializeJson(input.derivedFromMessageIds ?? []),
    serializeJson(input.artifactRefs ?? []),
    createdAt,
    updatedAt,
    input.committedAt ?? null
  )

  const row = getProposalRow(db, proposalId)
  if (!row) {
    throw new Error('failed to create proposal')
  }

  return mapProposalRow(row)
}

export function getProposal(db: ArchiveDatabase, input: {
  proposalId: string
}): AgentProposalRecord | null {
  const row = getProposalRow(db, input.proposalId)
  return row ? mapProposalRow(row) : null
}

export function updateProposalStatus(db: ArchiveDatabase, input: {
  proposalId: string
  status: AgentProposalStatus
  updatedAt?: string
  committedAt?: string | null
}): AgentProposalRecord | null {
  const updatedAt = input.updatedAt ?? nowIso()
  const committedAt = input.committedAt === undefined
    ? (input.status === 'committed' ? updatedAt : null)
    : input.committedAt

  db.prepare(
    `update agent_proposals
    set status = ?, updated_at = ?, committed_at = ?
    where id = ?`
  ).run(input.status, updatedAt, committedAt, input.proposalId)

  return getProposal(db, { proposalId: input.proposalId })
}

export function recordProposalVote(db: ArchiveDatabase, input: RecordProposalVoteInput): AgentVoteRecord {
  const voteId = input.voteId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()

  db.prepare(
    `insert into agent_votes (
      id,
      objective_id,
      thread_id,
      proposal_id,
      voter_role,
      vote,
      comment,
      artifact_refs_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    voteId,
    input.objectiveId,
    input.threadId,
    input.proposalId,
    input.voterRole,
    input.vote,
    input.comment ?? null,
    serializeJson(input.artifactRefs ?? []),
    createdAt
  )

  const row = getVoteRow(db, voteId)
  if (!row) {
    throw new Error('failed to record vote')
  }

  return mapVoteRow(row)
}

export function createCheckpoint(db: ArchiveDatabase, input: CreateCheckpointInput): AgentCheckpointRecord {
  const checkpointId = input.checkpointId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()

  db.prepare(
    `insert into agent_checkpoints (
      id,
      objective_id,
      thread_id,
      checkpoint_kind,
      title,
      summary,
      related_message_id,
      related_proposal_id,
      artifact_refs_json,
      metadata_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    checkpointId,
    input.objectiveId,
    input.threadId,
    input.checkpointKind,
    input.title,
    input.summary,
    input.relatedMessageId ?? null,
    input.relatedProposalId ?? null,
    serializeJson(input.artifactRefs ?? []),
    serializeJson(input.metadata ?? {}),
    createdAt
  )

  const row = getCheckpointRow(db, checkpointId)
  if (!row) {
    throw new Error('failed to create checkpoint')
  }

  return mapCheckpointRow(row)
}

export function createToolExecution(db: ArchiveDatabase, input: CreateToolExecutionInput): AgentToolExecutionRecord {
  const toolExecutionId = input.toolExecutionId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()
  const completedAt = input.completedAt ?? null

  db.prepare(
    `insert into agent_tool_executions (
      id,
      objective_id,
      thread_id,
      proposal_id,
      requested_by_participant_id,
      tool_name,
      tool_policy_id,
      status,
      input_payload_json,
      output_payload_json,
      artifact_refs_json,
      created_at,
      completed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    toolExecutionId,
    input.objectiveId,
    input.threadId,
    input.proposalId ?? null,
    input.requestedByParticipantId,
    input.toolName,
    input.toolPolicyId ?? null,
    input.status ?? 'requested',
    serializeJson(input.inputPayload),
    input.outputPayload ? serializeJson(input.outputPayload) : null,
    serializeJson(input.artifactRefs ?? []),
    createdAt,
    completedAt
  )

  const row = getToolExecutionRow(db, toolExecutionId)
  if (!row) {
    throw new Error('failed to create tool execution')
  }

  return mapToolExecutionRow(row)
}

export function updateToolExecution(db: ArchiveDatabase, input: UpdateToolExecutionInput): AgentToolExecutionRecord | null {
  const completedAt = input.completedAt === undefined
    ? (input.status === 'completed' || input.status === 'failed' || input.status === 'blocked'
        ? nowIso()
        : null)
    : input.completedAt

  db.prepare(
    `update agent_tool_executions
    set status = ?,
        output_payload_json = ?,
        artifact_refs_json = ?,
        completed_at = ?
    where id = ?`
  ).run(
    input.status,
    input.outputPayload ? serializeJson(input.outputPayload) : null,
    serializeJson(input.artifactRefs ?? []),
    completedAt,
    input.toolExecutionId
  )

  const row = getToolExecutionRow(db, input.toolExecutionId)
  return row ? mapToolExecutionRow(row) : null
}

export function createSubagent(db: ArchiveDatabase, input: CreateSubagentInput): AgentSubagentRecord {
  const subagentId = input.subagentId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()

  db.prepare(
    `insert into agent_subagents (
      id,
      objective_id,
      thread_id,
      parent_thread_id,
      parent_agent_role,
      specialization,
      skill_pack_ids_json,
      tool_policy_id,
      budget_json,
      expected_output_schema,
      status,
      summary,
      created_at,
      completed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    subagentId,
    input.objectiveId,
    input.threadId,
    input.parentThreadId,
    input.parentAgentRole,
    input.specialization,
    serializeJson(input.skillPackIds),
    input.toolPolicyId,
    serializeJson(input.budget),
    input.expectedOutputSchema,
    input.status ?? 'running',
    input.summary ?? null,
    createdAt,
    input.completedAt ?? null
  )

  const row = getSubagentRow(db, subagentId)
  if (!row) {
    throw new Error('failed to create subagent')
  }

  return mapSubagentRow(row)
}

export function updateSubagent(db: ArchiveDatabase, input: UpdateSubagentInput): AgentSubagentRecord | null {
  const completedAt = input.completedAt === undefined
    ? (input.status === 'completed' || input.status === 'failed' || input.status === 'cancelled'
        ? nowIso()
        : null)
    : input.completedAt

  db.prepare(
    `update agent_subagents
    set status = ?, summary = ?, completed_at = ?
    where id = ?`
  ).run(
    input.status,
    input.summary ?? null,
    completedAt,
    input.subagentId
  )

  const row = getSubagentRow(db, input.subagentId)
  return row ? mapSubagentRow(row) : null
}
