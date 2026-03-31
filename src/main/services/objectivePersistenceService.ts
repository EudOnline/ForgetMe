import crypto from 'node:crypto'
import type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecordV2,
  AgentObjectiveRecord,
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
  AgentVoteValue,
  CreateAgentObjectiveInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getCheckpointRow,
  getMessageRow,
  getObjectiveRow,
  getProposalRow,
  getSubagentRow,
  getThreadRow,
  getToolExecutionRow,
  getVoteRow,
  listCheckpointRowsByObjective,
  listCheckpointRowsByThread,
  listMessageRows,
  listObjectiveRows,
  listParticipantRowsForObjective,
  listProposalRowsByObjective,
  listProposalRowsByThread,
  listSubagentRowsByObjective,
  listSubagentRowsByThread,
  listThreadParticipantRows,
  listThreadRowsForObjective,
  listToolExecutionRowsByObjective,
  listToolExecutionRowsByThread,
  listVoteRows,
  mapCheckpointRow,
  mapMessageRow,
  mapObjectiveRow,
  mapProposalRow,
  mapSubagentRow,
  mapThreadParticipantRow,
  mapThreadRow,
  mapToolExecutionRow,
  mapVoteRow
} from './objectivePersistenceQueryService'

export type CreateObjectiveInput = CreateAgentObjectiveInput & {
  objectiveId?: string
  status?: AgentObjectiveStatus
  requiresOperatorInput?: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateThreadInput = {
  threadId?: string
  objectiveId: string
  ownerRole: AgentRole
  title: string
  status?: AgentThreadStatus
  createdAt?: string
  updatedAt?: string
  closedAt?: string | null
}

export type AddThreadParticipantsInput = {
  objectiveId: string
  threadId: string
  invitedByParticipantId?: string | null
  participants: Array<{
    threadParticipantId?: string
    participantKind: AgentParticipantKind
    participantId: string
    role: AgentRole | null
    displayLabel: string
    joinedAt?: string
    leftAt?: string | null
  }>
}

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

export type UpdateThreadStatusInput = {
  threadId: string
  status: AgentThreadStatus
  updatedAt?: string
  closedAt?: string | null
}

export type UpdateSubagentInput = {
  subagentId: string
  status: AgentSubagentStatus
  summary?: string | null
  completedAt?: string | null
}

type ObjectiveDetail = AgentObjectiveRecord & {
  threads: AgentThreadRecord[]
  participants: AgentThreadParticipantRecord[]
  proposals: AgentProposalRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

type ThreadDetail = AgentThreadRecord & {
  participants: AgentThreadParticipantRecord[]
  messages: AgentMessageRecordV2[]
  proposals: AgentProposalRecord[]
  votes: AgentVoteRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

function inTransaction<T>(db: ArchiveDatabase, callback: () => T) {
  db.exec('begin immediate')
  try {
    const result = callback()
    db.exec('commit')
    return result
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

function serializeJson(value: unknown) {
  return JSON.stringify(value)
}

function nowIso() {
  return new Date().toISOString()
}

export function createObjective(db: ArchiveDatabase, input: CreateObjectiveInput): AgentObjectiveRecord {
  const objectiveId = input.objectiveId ?? crypto.randomUUID()
  const mainThreadId = crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()
  const updatedAt = input.updatedAt ?? createdAt

  db.prepare(
    `insert into agent_objectives (
      id,
      title,
      objective_kind,
      status,
      prompt,
      initiated_by,
      owner_role,
      main_thread_id,
      risk_level,
      budget_json,
      requires_operator_input,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    objectiveId,
    input.title,
    input.objectiveKind,
    input.status ?? 'open',
    input.prompt,
    input.initiatedBy ?? 'operator',
    input.ownerRole ?? 'workspace',
    mainThreadId,
    input.riskLevel ?? 'medium',
    input.budget ? serializeJson(input.budget) : null,
    input.requiresOperatorInput ? 1 : 0,
    createdAt,
    updatedAt
  )

  const row = getObjectiveRow(db, objectiveId)
  if (!row) {
    throw new Error('failed to create objective')
  }

  return mapObjectiveRow(row)
}

export function createMainThread(db: ArchiveDatabase, input: CreateThreadInput): AgentThreadRecord {
  return inTransaction(db, () => {
    const objective = getObjectiveRow(db, input.objectiveId)
    if (!objective) {
      throw new Error(`objective not found: ${input.objectiveId}`)
    }

    const threadId = input.threadId ?? objective.mainThreadId ?? crypto.randomUUID()
    const createdAt = input.createdAt ?? nowIso()
    const updatedAt = input.updatedAt ?? createdAt

    db.prepare(
      `insert into agent_threads (
        id,
        objective_id,
        parent_thread_id,
        thread_kind,
        owner_role,
        title,
        status,
        created_at,
        updated_at,
        closed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      threadId,
      input.objectiveId,
      null,
      'main',
      input.ownerRole,
      input.title,
      input.status ?? 'open',
      createdAt,
      updatedAt,
      input.closedAt ?? null
    )

    db.prepare(
      'update agent_objectives set main_thread_id = ?, updated_at = ? where id = ?'
    ).run(threadId, updatedAt, input.objectiveId)

    const row = getThreadRow(db, threadId)
    if (!row) {
      throw new Error('failed to create main thread')
    }

    return mapThreadRow(row)
  })
}

export function createSubthread(db: ArchiveDatabase, input: CreateThreadInput & {
  parentThreadId: string
}): AgentThreadRecord {
  const threadId = input.threadId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? nowIso()
  const updatedAt = input.updatedAt ?? createdAt

  db.prepare(
    `insert into agent_threads (
      id,
      objective_id,
      parent_thread_id,
      thread_kind,
      owner_role,
      title,
      status,
      created_at,
      updated_at,
      closed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    threadId,
    input.objectiveId,
    input.parentThreadId,
    'subthread',
    input.ownerRole,
    input.title,
    input.status ?? 'open',
    createdAt,
    updatedAt,
    input.closedAt ?? null
  )

  const row = getThreadRow(db, threadId)
  if (!row) {
    throw new Error('failed to create subthread')
  }

  return mapThreadRow(row)
}

export function updateThreadStatus(db: ArchiveDatabase, input: UpdateThreadStatusInput): AgentThreadRecord | null {
  const updatedAt = input.updatedAt ?? nowIso()
  const closedAt = input.closedAt === undefined
    ? (input.status === 'completed' || input.status === 'blocked' || input.status === 'cancelled'
        ? updatedAt
        : null)
    : input.closedAt

  db.prepare(
    `update agent_threads
    set status = ?, updated_at = ?, closed_at = ?
    where id = ?`
  ).run(
    input.status,
    updatedAt,
    closedAt,
    input.threadId
  )

  const row = getThreadRow(db, input.threadId)
  return row ? mapThreadRow(row) : null
}

export function addThreadParticipants(db: ArchiveDatabase, input: AddThreadParticipantsInput): AgentThreadParticipantRecord[] {
  return inTransaction(db, () => {
    const insert = db.prepare(
      `insert into agent_thread_participants (
        id,
        objective_id,
        thread_id,
        participant_kind,
        participant_id,
        role,
        display_label,
        invited_by_participant_id,
        joined_at,
        left_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const participant of input.participants) {
      insert.run(
        participant.threadParticipantId ?? crypto.randomUUID(),
        input.objectiveId,
        input.threadId,
        participant.participantKind,
        participant.participantId,
        participant.role,
        participant.displayLabel,
        input.invitedByParticipantId ?? null,
        participant.joinedAt ?? nowIso(),
        participant.leftAt ?? null
      )
    }

    return listThreadParticipantRows(db, input.threadId).map(mapThreadParticipantRow)
  })
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
      requires_operator_confirmation,
      tool_policy_id,
      budget_json,
      derived_from_message_ids_json,
      artifact_refs_json,
      created_at,
      updated_at,
      committed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

export function listObjectives(db: ArchiveDatabase, input?: ListAgentObjectivesInput): AgentObjectiveRecord[] {
  return listObjectiveRows(db, input).map(mapObjectiveRow)
}

export function getObjectiveDetail(db: ArchiveDatabase, input: GetAgentObjectiveInput): ObjectiveDetail | null {
  const objectiveRow = getObjectiveRow(db, input.objectiveId)
  if (!objectiveRow) {
    return null
  }

  const objective = mapObjectiveRow(objectiveRow)

  return {
    ...objective,
    threads: listThreadRowsForObjective(db, input.objectiveId).map(mapThreadRow),
    participants: listParticipantRowsForObjective(db, input.objectiveId).map(mapThreadParticipantRow),
    proposals: listProposalRowsByObjective(db, input.objectiveId).map(mapProposalRow),
    checkpoints: listCheckpointRowsByObjective(db, input.objectiveId).map(mapCheckpointRow),
    subagents: listSubagentRowsByObjective(db, input.objectiveId).map(mapSubagentRow),
    toolExecutions: listToolExecutionRowsByObjective(db, input.objectiveId).map(mapToolExecutionRow)
  }
}

export function getThreadDetail(db: ArchiveDatabase, input: GetAgentThreadInput): ThreadDetail | null {
  const threadRow = getThreadRow(db, input.threadId)
  if (!threadRow) {
    return null
  }

  return {
    ...mapThreadRow(threadRow),
    participants: listThreadParticipantRows(db, input.threadId).map(mapThreadParticipantRow),
    messages: listMessageRows(db, input.threadId).map(mapMessageRow),
    proposals: listProposalRowsByThread(db, input.threadId).map(mapProposalRow),
    votes: listVoteRows(db, input.threadId).map(mapVoteRow),
    checkpoints: listCheckpointRowsByThread(db, input.threadId).map(mapCheckpointRow),
    subagents: listSubagentRowsByThread(db, input.threadId).map(mapSubagentRow),
    toolExecutions: listToolExecutionRowsByThread(db, input.threadId).map(mapToolExecutionRow)
  }
}

export type AgentObjectiveDetail = ObjectiveDetail
export type AgentThreadDetail = ThreadDetail
