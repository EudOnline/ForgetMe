import crypto from 'node:crypto'
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

type ObjectiveDetail = AgentObjectiveRecord & {
  threads: AgentThreadRecord[]
  participants: AgentThreadParticipantRecord[]
  proposals: AgentProposalRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
}

type ThreadDetail = AgentThreadRecord & {
  participants: AgentThreadParticipantRecord[]
  messages: AgentMessageRecordV2[]
  proposals: AgentProposalRecord[]
  votes: AgentVoteRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
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

function serializeJson(value: unknown) {
  return JSON.stringify(value)
}

function nowIso() {
  return new Date().toISOString()
}

function mapObjectiveRow(row: AgentObjectiveRow): AgentObjectiveRecord {
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

function mapThreadRow(row: AgentThreadRow): AgentThreadRecord {
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

function mapThreadParticipantRow(row: AgentThreadParticipantRow): AgentThreadParticipantRecord {
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

function mapMessageRow(row: AgentMessageV2Row): AgentMessageRecordV2 {
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

function mapProposalRow(row: AgentProposalRow): AgentProposalRecord {
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

function mapVoteRow(row: AgentVoteRow): AgentVoteRecord {
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

function mapCheckpointRow(row: AgentCheckpointRow): AgentCheckpointRecord {
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

function mapSubagentRow(row: AgentSubagentRow): AgentSubagentRecord {
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

function getObjectiveRow(db: ArchiveDatabase, objectiveId: string) {
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

function getThreadRow(db: ArchiveDatabase, threadId: string) {
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

function listThreadRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
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

function listThreadParticipantRows(db: ArchiveDatabase, threadId: string) {
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

function listParticipantRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
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

function listMessageRows(db: ArchiveDatabase, threadId: string) {
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

function listProposalRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
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

function listProposalRowsByThread(db: ArchiveDatabase, threadId: string) {
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

function getProposalRow(db: ArchiveDatabase, proposalId: string) {
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

function listVoteRows(db: ArchiveDatabase, threadId: string) {
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

function listCheckpointRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
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

function listCheckpointRowsByThread(db: ArchiveDatabase, threadId: string) {
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

function listSubagentRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
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

function listSubagentRowsByThread(db: ArchiveDatabase, threadId: string) {
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

  const row = db.prepare(
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

  const row = db.prepare(
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

  const row = db.prepare(
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

  if (!row) {
    throw new Error('failed to create checkpoint')
  }

  return mapCheckpointRow(row)
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

  const row = db.prepare(
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

  if (!row) {
    throw new Error('failed to create subagent')
  }

  return mapSubagentRow(row)
}

export function listObjectives(db: ArchiveDatabase, input?: ListAgentObjectivesInput): AgentObjectiveRecord[] {
  const rows = db.prepare(
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

  return rows.map(mapObjectiveRow)
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
    subagents: listSubagentRowsByObjective(db, input.objectiveId).map(mapSubagentRow)
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
    subagents: listSubagentRowsByThread(db, input.threadId).map(mapSubagentRow)
  }
}

export type AgentObjectiveDetail = ObjectiveDetail
export type AgentThreadDetail = ThreadDetail
