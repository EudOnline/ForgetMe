import crypto from 'node:crypto'
import type {
  AgentObjectiveRecord,
  AgentObjectiveStatus,
  AgentParticipantKind,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentThreadStatus,
  CreateAgentObjectiveInput,
  ListAgentObjectivesInput
} from '../../shared/objectiveRuntimeContracts'
import type { AgentRole } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getObjectiveRow,
  getThreadRow,
  listObjectiveRows,
  listThreadParticipantRows,
  mapObjectiveRow,
  mapThreadParticipantRow,
  mapThreadRow
} from './objectivePersistenceQueryService'
export {
  appendAgentMessageV2,
  createCheckpoint,
  createProposal,
  createSubagent,
  createToolExecution,
  getProposal,
  recordProposalVote,
  updateProposalStatus,
  updateSubagent,
  updateToolExecution
} from './objectivePersistenceInteractionMutationService'
export type {
  AppendAgentMessageV2Input,
  CreateCheckpointInput,
  CreateProposalInput,
  CreateSubagentInput,
  CreateToolExecutionInput,
  RecordProposalVoteInput,
  UpdateSubagentInput,
  UpdateToolExecutionInput
} from './objectivePersistenceInteractionMutationService'

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

export type UpdateThreadStatusInput = {
  threadId: string
  status: AgentThreadStatus
  updatedAt?: string
  closedAt?: string | null
}

export type UpdateObjectiveStatusInput = {
  objectiveId: string
  status: AgentObjectiveStatus
  requiresOperatorInput?: boolean
  updatedAt?: string
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

export function updateObjectiveStatus(db: ArchiveDatabase, input: UpdateObjectiveStatusInput): AgentObjectiveRecord | null {
  const updatedAt = input.updatedAt ?? nowIso()
  const hasRequiresOperatorInput = Object.prototype.hasOwnProperty.call(input, 'requiresOperatorInput')

  if (hasRequiresOperatorInput) {
    db.prepare(
      `update agent_objectives
       set status = ?, requires_operator_input = ?, updated_at = ?
       where id = ?`
    ).run(
      input.status,
      input.requiresOperatorInput ? 1 : 0,
      updatedAt,
      input.objectiveId
    )
  } else {
    db.prepare(
      `update agent_objectives
       set status = ?, updated_at = ?
       where id = ?`
    ).run(
      input.status,
      updatedAt,
      input.objectiveId
    )
  }

  const row = getObjectiveRow(db, input.objectiveId)
  return row ? mapObjectiveRow(row) : null
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

export function listObjectives(db: ArchiveDatabase, input?: ListAgentObjectivesInput): AgentObjectiveRecord[] {
  return listObjectiveRows(db, input).map(mapObjectiveRow)
}
