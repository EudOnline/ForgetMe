import crypto from 'node:crypto'
import type {
  AgentMemoryRecord,
  AgentMessageRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  AgentRunDetail,
  AgentRunRecord,
  AgentRunStatus,
  AgentSuggestionRecord,
  AgentSuggestionStatus,
  AgentTaskKind,
  AgentTriggerKind,
  DismissAgentSuggestionInput,
  GetAgentRunInput,
  ListAgentMemoriesInput,
  ListAgentSuggestionsInput,
  ListAgentPolicyVersionsInput,
  ListAgentRunsInput,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type AgentRunRow = {
  id: string
  role: AgentRole
  taskKind: AgentTaskKind | null
  targetRole: AgentRole | null
  assignedRolesJson: string
  latestAssistantResponse: string | null
  status: AgentRunStatus
  prompt: string
  confirmationToken: string | null
  policyVersion: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

type AgentMessageRow = {
  id: string
  runId: string
  ordinal: number
  sender: AgentMessageRecord['sender']
  content: string
  createdAt: string
}

type AgentMemoryRow = {
  id: string
  role: AgentRole
  memoryKey: string
  memoryValue: string
  createdAt: string
  updatedAt: string
}

type AgentPolicyVersionRow = {
  id: string
  role: AgentRole
  policyKey: string
  policyBody: string
  createdAt: string
}

type AgentSuggestionRow = {
  id: string
  triggerKind: AgentTriggerKind
  status: AgentSuggestionStatus
  role: AgentRole
  taskKind: AgentTaskKind
  taskInputJson: string
  dedupeKey: string
  sourceRunId: string | null
  executedRunId: string | null
  createdAt: string
  updatedAt: string
  lastObservedAt: string
}

export type CreateAgentRunInput = {
  runId?: string
  role: AgentRole
  taskKind?: AgentTaskKind | null
  targetRole?: AgentRole | null
  assignedRoles?: AgentRole[]
  latestAssistantResponse?: string | null
  prompt: string
  confirmationToken?: string | null
  status?: AgentRunStatus
  policyVersion?: string | null
  errorMessage?: string | null
  createdAt?: string
  updatedAt?: string
}

export type UpsertAgentSuggestionInput = {
  suggestionId?: string
  triggerKind: AgentTriggerKind
  role: AgentRole
  taskKind: AgentTaskKind
  taskInput: RunAgentTaskInput
  dedupeKey: string
  sourceRunId: string | null
  observedAt?: string
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

const AGENT_ROLES: ReadonlySet<AgentRole> = new Set([
  'orchestrator',
  'ingestion',
  'review',
  'workspace',
  'governance'
])

function parseAssignedRolesJson(value: string | null | undefined): AgentRole[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is AgentRole => typeof item === 'string' && AGENT_ROLES.has(item as AgentRole))
  } catch {
    return []
  }
}

function serializeAssignedRoles(assignedRoles?: AgentRole[]) {
  return JSON.stringify(assignedRoles ?? [])
}

function mapAgentRunRow(row: AgentRunRow): AgentRunRecord {
  return {
    runId: row.id,
    role: row.role,
    taskKind: row.taskKind,
    targetRole: row.targetRole,
    assignedRoles: parseAssignedRolesJson(row.assignedRolesJson),
    latestAssistantResponse: row.latestAssistantResponse,
    status: row.status,
    prompt: row.prompt,
    confirmationToken: row.confirmationToken,
    policyVersion: row.policyVersion,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapAgentMessageRow(row: AgentMessageRow): AgentMessageRecord {
  return {
    messageId: row.id,
    runId: row.runId,
    ordinal: row.ordinal,
    sender: row.sender,
    content: row.content,
    createdAt: row.createdAt
  }
}

function mapAgentMemoryRow(row: AgentMemoryRow): AgentMemoryRecord {
  return {
    memoryId: row.id,
    role: row.role,
    memoryKey: row.memoryKey,
    memoryValue: row.memoryValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapAgentPolicyVersionRow(row: AgentPolicyVersionRow): AgentPolicyVersionRecord {
  return {
    policyVersionId: row.id,
    role: row.role,
    policyKey: row.policyKey,
    policyBody: row.policyBody,
    createdAt: row.createdAt
  }
}

function parseTaskInputJson(rawValue: string): RunAgentTaskInput {
  const parsed = JSON.parse(rawValue) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid agent suggestion task input')
  }

  return parsed as RunAgentTaskInput
}

function mapAgentSuggestionRow(row: AgentSuggestionRow): AgentSuggestionRecord {
  return {
    suggestionId: row.id,
    triggerKind: row.triggerKind,
    status: row.status,
    role: row.role,
    taskKind: row.taskKind,
    taskInput: parseTaskInputJson(row.taskInputJson),
    dedupeKey: row.dedupeKey,
    sourceRunId: row.sourceRunId,
    executedRunId: row.executedRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastObservedAt: row.lastObservedAt
  }
}

function loadAgentRunRow(db: ArchiveDatabase, runId: string) {
  return db.prepare(
    `select
      id,
      role,
      task_kind as taskKind,
      target_role as targetRole,
      assigned_roles_json as assignedRolesJson,
      latest_assistant_response as latestAssistantResponse,
      status,
      prompt,
      confirmation_token as confirmationToken,
      policy_version as policyVersion,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     from agent_runs
     where id = ?`
  ).get(runId) as AgentRunRow | undefined
}

function loadAgentMessageRows(db: ArchiveDatabase, runId: string) {
  return db.prepare(
    `select
      id,
      run_id as runId,
      ordinal,
      sender,
      content,
      created_at as createdAt
     from agent_messages
     where run_id = ?
     order by ordinal asc, created_at asc, id asc`
  ).all(runId) as AgentMessageRow[]
}

function loadAgentMemoryRow(db: ArchiveDatabase, input: {
  role: AgentRole
  memoryKey: string
}) {
  return db.prepare(
    `select
      id,
      role,
      memory_key as memoryKey,
      memory_value as memoryValue,
      created_at as createdAt,
      updated_at as updatedAt
     from agent_memories
     where role = ?
       and memory_key = ?`
  ).get(input.role, input.memoryKey) as AgentMemoryRow | undefined
}

function loadAgentSuggestionRow(db: ArchiveDatabase, suggestionId: string) {
  return db.prepare(
    `select
      id,
      trigger_kind as triggerKind,
      status,
      role,
      task_kind as taskKind,
      task_input_json as taskInputJson,
      dedupe_key as dedupeKey,
      source_run_id as sourceRunId,
      executed_run_id as executedRunId,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     where id = ?`
  ).get(suggestionId) as AgentSuggestionRow | undefined
}

function loadAgentSuggestionRowByDedupeKey(db: ArchiveDatabase, dedupeKey: string) {
  return db.prepare(
    `select
      id,
      trigger_kind as triggerKind,
      status,
      role,
      task_kind as taskKind,
      task_input_json as taskInputJson,
      dedupe_key as dedupeKey,
      source_run_id as sourceRunId,
      executed_run_id as executedRunId,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     where dedupe_key = ?`
  ).get(dedupeKey) as AgentSuggestionRow | undefined
}

export function createAgentRun(
  db: ArchiveDatabase,
  input: CreateAgentRunInput
): AgentRunRecord {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const updatedAt = input.updatedAt ?? createdAt
  const runId = input.runId ?? crypto.randomUUID()

  db.prepare(
    `insert into agent_runs (
      id, role, task_kind, target_role, assigned_roles_json, latest_assistant_response, status, prompt, confirmation_token, policy_version, error_message, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    input.role,
    input.taskKind ?? null,
    input.targetRole ?? null,
    serializeAssignedRoles(input.assignedRoles),
    input.latestAssistantResponse ?? null,
    input.status ?? 'queued',
    input.prompt,
    input.confirmationToken ?? null,
    input.policyVersion ?? null,
    input.errorMessage ?? null,
    createdAt,
    updatedAt
  )

  return mapAgentRunRow(loadAgentRunRow(db, runId)!)
}

export function updateAgentRunStatus(db: ArchiveDatabase, input: {
  runId: string
  status: AgentRunStatus
  errorMessage?: string | null
  updatedAt?: string
}): AgentRunRecord | null {
  const updatedAt = input.updatedAt ?? new Date().toISOString()

  db.prepare(
    `update agent_runs
     set status = ?,
         error_message = ?,
         updated_at = ?
     where id = ?`
  ).run(
    input.status,
    input.errorMessage ?? null,
    updatedAt,
    input.runId
  )

  const row = loadAgentRunRow(db, input.runId)
  return row ? mapAgentRunRow(row) : null
}

export function updateAgentRunReplayMetadata(db: ArchiveDatabase, input: {
  runId: string
  targetRole: AgentRole | null
  assignedRoles: AgentRole[]
  latestAssistantResponse?: string | null
  updatedAt?: string
}): AgentRunRecord | null {
  const updatedAt = input.updatedAt ?? new Date().toISOString()
  const hasLatestAssistantResponse = Object.prototype.hasOwnProperty.call(input, 'latestAssistantResponse')

  if (hasLatestAssistantResponse) {
    db.prepare(
      `update agent_runs
       set target_role = ?,
           assigned_roles_json = ?,
           latest_assistant_response = ?,
           updated_at = ?
       where id = ?`
    ).run(
      input.targetRole,
      serializeAssignedRoles(input.assignedRoles),
      input.latestAssistantResponse ?? null,
      updatedAt,
      input.runId
    )
  } else {
    db.prepare(
      `update agent_runs
       set target_role = ?,
           assigned_roles_json = ?,
           updated_at = ?
       where id = ?`
    ).run(
      input.targetRole,
      serializeAssignedRoles(input.assignedRoles),
      updatedAt,
      input.runId
    )
  }

  const row = loadAgentRunRow(db, input.runId)
  return row ? mapAgentRunRow(row) : null
}

export function appendAgentMessage(db: ArchiveDatabase, input: {
  messageId?: string
  runId: string
  sender: AgentMessageRecord['sender']
  content: string
  createdAt?: string
}): AgentMessageRecord {
  return inTransaction(db, () => {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const messageId = input.messageId ?? crypto.randomUUID()
    const row = db.prepare(
      `select coalesce(max(ordinal), 0) as maxOrdinal
       from agent_messages
       where run_id = ?`
    ).get(input.runId) as { maxOrdinal: number }
    const ordinal = row.maxOrdinal + 1

    db.prepare(
      `insert into agent_messages (
        id, run_id, ordinal, sender, content, created_at
      ) values (?, ?, ?, ?, ?, ?)`
    ).run(
      messageId,
      input.runId,
      ordinal,
      input.sender,
      input.content,
      createdAt
    )

    return mapAgentMessageRow(loadAgentMessageRows(db, input.runId).find((message) => message.id === messageId)!)
  })
}

export function listAgentRuns(
  db: ArchiveDatabase,
  input: ListAgentRunsInput = {}
): AgentRunRecord[] {
  const rows = db.prepare(
    `select
      id,
      role,
      task_kind as taskKind,
      target_role as targetRole,
      assigned_roles_json as assignedRolesJson,
      latest_assistant_response as latestAssistantResponse,
      status,
      prompt,
      confirmation_token as confirmationToken,
      policy_version as policyVersion,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     from agent_runs
     order by created_at desc, updated_at desc, id asc`
  ).all() as AgentRunRow[]

  const filtered = rows.filter((row) => {
    if (input.role && row.role !== input.role) {
      return false
    }

    if (input.status && row.status !== input.status) {
      return false
    }

    return true
  })

  return filtered
    .slice(0, input.limit ?? filtered.length)
    .map(mapAgentRunRow)
}

export function getAgentRun(
  db: ArchiveDatabase,
  input: GetAgentRunInput
): AgentRunDetail | null {
  const runRow = loadAgentRunRow(db, input.runId)
  if (!runRow) {
    return null
  }

  return {
    ...mapAgentRunRow(runRow),
    messages: loadAgentMessageRows(db, input.runId).map(mapAgentMessageRow)
  }
}

export function upsertAgentMemory(db: ArchiveDatabase, input: {
  memoryId?: string
  role: AgentRole
  memoryKey: string
  memoryValue: string
  createdAt?: string
  updatedAt?: string
}): AgentMemoryRecord {
  const now = new Date().toISOString()
  const createdAt = input.createdAt ?? now
  const updatedAt = input.updatedAt ?? createdAt
  const memoryId = input.memoryId ?? crypto.randomUUID()

  db.prepare(
    `insert into agent_memories (
      id, role, memory_key, memory_value, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(role, memory_key) do update set
      memory_value = excluded.memory_value,
      updated_at = excluded.updated_at`
  ).run(
    memoryId,
    input.role,
    input.memoryKey,
    input.memoryValue,
    createdAt,
    updatedAt
  )

  return mapAgentMemoryRow(loadAgentMemoryRow(db, {
    role: input.role,
    memoryKey: input.memoryKey
  })!)
}

export function listAgentMemories(
  db: ArchiveDatabase,
  input: ListAgentMemoriesInput = {}
): AgentMemoryRecord[] {
  const rows = db.prepare(
    `select
      id,
      role,
      memory_key as memoryKey,
      memory_value as memoryValue,
      created_at as createdAt,
      updated_at as updatedAt
     from agent_memories
     order by updated_at desc, created_at desc, id asc`
  ).all() as AgentMemoryRow[]

  return rows
    .filter((row) => {
      if (input.role && row.role !== input.role) {
        return false
      }

      if (input.memoryKey && row.memoryKey !== input.memoryKey) {
        return false
      }

      return true
    })
    .map(mapAgentMemoryRow)
}

export function createAgentPolicyVersion(db: ArchiveDatabase, input: {
  policyVersionId?: string
  role: AgentRole
  policyKey: string
  policyBody: string
  createdAt?: string
}): AgentPolicyVersionRecord {
  const policyVersionId = input.policyVersionId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date().toISOString()

  db.prepare(
    `insert into agent_policy_versions (
      id, role, policy_key, policy_body, created_at
    ) values (?, ?, ?, ?, ?)`
  ).run(
    policyVersionId,
    input.role,
    input.policyKey,
    input.policyBody,
    createdAt
  )

  const row = db.prepare(
    `select
      id,
      role,
      policy_key as policyKey,
      policy_body as policyBody,
      created_at as createdAt
     from agent_policy_versions
     where id = ?`
  ).get(policyVersionId) as AgentPolicyVersionRow | undefined

  return mapAgentPolicyVersionRow(row!)
}

export function listAgentPolicyVersions(
  db: ArchiveDatabase,
  input: ListAgentPolicyVersionsInput = {}
): AgentPolicyVersionRecord[] {
  const rows = db.prepare(
    `select
      id,
      role,
      policy_key as policyKey,
      policy_body as policyBody,
      created_at as createdAt
     from agent_policy_versions
     order by created_at desc, id asc`
  ).all() as AgentPolicyVersionRow[]

  return rows
    .filter((row) => {
      if (input.role && row.role !== input.role) {
        return false
      }

      if (input.policyKey && row.policyKey !== input.policyKey) {
        return false
      }

      return true
    })
    .map(mapAgentPolicyVersionRow)
}

export function upsertAgentSuggestion(
  db: ArchiveDatabase,
  input: UpsertAgentSuggestionInput
): AgentSuggestionRecord {
  const suggestionId = input.suggestionId ?? crypto.randomUUID()
  const observedAt = input.observedAt ?? new Date().toISOString()
  const taskInputJson = JSON.stringify(input.taskInput)

  db.prepare(
    `insert into agent_suggestions (
      id,
      trigger_kind,
      status,
      role,
      task_kind,
      task_input_json,
      dedupe_key,
      source_run_id,
      executed_run_id,
      created_at,
      updated_at,
      last_observed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(dedupe_key) do update set
      trigger_kind = excluded.trigger_kind,
      role = excluded.role,
      task_kind = excluded.task_kind,
      task_input_json = excluded.task_input_json,
      source_run_id = excluded.source_run_id,
      updated_at = excluded.updated_at,
      last_observed_at = excluded.last_observed_at`
  ).run(
    suggestionId,
    input.triggerKind,
    'suggested',
    input.role,
    input.taskKind,
    taskInputJson,
    input.dedupeKey,
    input.sourceRunId,
    null,
    observedAt,
    observedAt,
    observedAt
  )

  return mapAgentSuggestionRow(loadAgentSuggestionRowByDedupeKey(db, input.dedupeKey)!)
}

export function listAgentSuggestions(
  db: ArchiveDatabase,
  input: ListAgentSuggestionsInput = {}
): AgentSuggestionRecord[] {
  const rows = db.prepare(
    `select
      id,
      trigger_kind as triggerKind,
      status,
      role,
      task_kind as taskKind,
      task_input_json as taskInputJson,
      dedupe_key as dedupeKey,
      source_run_id as sourceRunId,
      executed_run_id as executedRunId,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     order by last_observed_at desc, updated_at desc, created_at desc, id asc`
  ).all() as AgentSuggestionRow[]

  const filtered = rows.filter((row) => {
    if (input.status && row.status !== input.status) {
      return false
    }

    if (input.role && row.role !== input.role) {
      return false
    }

    return true
  })

  return filtered
    .slice(0, input.limit ?? filtered.length)
    .map(mapAgentSuggestionRow)
}

export function getAgentSuggestion(
  db: ArchiveDatabase,
  input: { suggestionId: string }
): AgentSuggestionRecord | null {
  const row = loadAgentSuggestionRow(db, input.suggestionId)
  return row ? mapAgentSuggestionRow(row) : null
}

export function dismissAgentSuggestion(
  db: ArchiveDatabase,
  input: DismissAgentSuggestionInput
): AgentSuggestionRecord | null {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update agent_suggestions
     set status = ?,
         updated_at = ?
     where id = ?`
  ).run('dismissed', updatedAt, input.suggestionId)

  return getAgentSuggestion(db, { suggestionId: input.suggestionId })
}

export function markAgentSuggestionExecuted(
  db: ArchiveDatabase,
  input: { suggestionId: string; runId: string }
): AgentSuggestionRecord | null {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update agent_suggestions
     set status = ?,
         executed_run_id = ?,
         updated_at = ?
     where id = ?`
  ).run('executed', input.runId, updatedAt, input.suggestionId)

  return getAgentSuggestion(db, { suggestionId: input.suggestionId })
}
