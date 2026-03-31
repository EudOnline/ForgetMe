import crypto from 'node:crypto'
import type {
  AgentAutonomyMode,
  AgentMemoryRecord,
  AgentMessageRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  AgentRunDetail,
  AgentRunExecutionOrigin,
  AgentRunRecord,
  AgentRunStatus,
  AgentRuntimeSettingsRecord,
  AgentSuggestionPriority,
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
import {
  listAgentMemoryRows,
  listAgentPolicyVersionRows,
  listAgentRunRows,
  listAgentSuggestionRows,
  listRunnableAgentSuggestionRows,
  loadAgentMemoryRow,
  loadAgentMessageRows,
  loadAgentPolicyVersionRow,
  loadAgentRunRow,
  loadAgentRuntimeSettingsRow,
  loadAgentSuggestionRow,
  loadAgentSuggestionRowByDedupeKey,
  mapAgentMemoryRow,
  mapAgentMessageRow,
  mapAgentPolicyVersionRow,
  mapAgentRunRow,
  mapAgentRuntimeSettingsRow,
  mapAgentSuggestionRow,
  serializeAssignedRoles
} from './agentPersistenceQueryService'

export type CreateAgentRunInput = {
  runId?: string
  role: AgentRole
  taskKind?: AgentTaskKind | null
  targetRole?: AgentRole | null
  assignedRoles?: AgentRole[]
  latestAssistantResponse?: string | null
  prompt: string
  executionOrigin?: AgentRunExecutionOrigin
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
  priority?: AgentSuggestionPriority
  rationale?: string
  autoRunnable?: boolean
  followUpOfSuggestionId?: string | null
  attemptCount?: number
  cooldownUntil?: string | null
  lastAttemptedAt?: string | null
  observedAt?: string
}

const DEFAULT_AGENT_RUNTIME_SETTINGS_ID = 'default'
const DEFAULT_AGENT_AUTONOMY_MODE: AgentAutonomyMode = 'manual_only'

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


export function createAgentRun(
  db: ArchiveDatabase,
  input: CreateAgentRunInput
): AgentRunRecord {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const updatedAt = input.updatedAt ?? createdAt
  const runId = input.runId ?? crypto.randomUUID()

  db.prepare(
    `insert into agent_runs (
      id, role, task_kind, target_role, assigned_roles_json, latest_assistant_response, status, execution_origin, prompt, confirmation_token, policy_version, error_message, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    input.role,
    input.taskKind ?? null,
    input.targetRole ?? null,
    serializeAssignedRoles(input.assignedRoles),
    input.latestAssistantResponse ?? null,
    input.status ?? 'queued',
    input.executionOrigin ?? 'operator_manual',
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
  const filtered = listAgentRunRows(db).filter((row) => {
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
  return listAgentMemoryRows(db)
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

  const row = loadAgentPolicyVersionRow(db, policyVersionId)
  return mapAgentPolicyVersionRow(row!)
}

export function listAgentPolicyVersions(
  db: ArchiveDatabase,
  input: ListAgentPolicyVersionsInput = {}
): AgentPolicyVersionRecord[] {
  return listAgentPolicyVersionRows(db)
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
  const priority = input.priority ?? 'medium'
  const rationale = input.rationale ?? ''
  const autoRunnable = input.autoRunnable ?? false
  const followUpOfSuggestionId = input.followUpOfSuggestionId ?? null
  const attemptCount = input.attemptCount ?? 0
  const cooldownUntil = input.cooldownUntil ?? null
  const lastAttemptedAt = input.lastAttemptedAt ?? null

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
      priority,
      rationale,
      auto_runnable,
      follow_up_of_suggestion_id,
      attempt_count,
      cooldown_until,
      last_attempted_at,
      created_at,
      updated_at,
      last_observed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(dedupe_key) do update set
      trigger_kind = excluded.trigger_kind,
      role = excluded.role,
      task_kind = excluded.task_kind,
      task_input_json = excluded.task_input_json,
      source_run_id = excluded.source_run_id,
      priority = excluded.priority,
      rationale = excluded.rationale,
      auto_runnable = excluded.auto_runnable,
      follow_up_of_suggestion_id = excluded.follow_up_of_suggestion_id,
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
    priority,
    rationale,
    autoRunnable ? 1 : 0,
    followUpOfSuggestionId,
    attemptCount,
    cooldownUntil,
    lastAttemptedAt,
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
  const filtered = listAgentSuggestionRows(db).filter((row) => {
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

export function getAgentRuntimeSettings(db: ArchiveDatabase): AgentRuntimeSettingsRecord {
  const existing = loadAgentRuntimeSettingsRow(db, DEFAULT_AGENT_RUNTIME_SETTINGS_ID)
  if (existing) {
    return mapAgentRuntimeSettingsRow(existing)
  }

  return upsertAgentRuntimeSettings(db, {
    autonomyMode: DEFAULT_AGENT_AUTONOMY_MODE
  })
}

export function upsertAgentRuntimeSettings(db: ArchiveDatabase, input: {
  autonomyMode: AgentAutonomyMode
  updatedAt?: string
}): AgentRuntimeSettingsRecord {
  const updatedAt = input.updatedAt ?? new Date().toISOString()

  db.prepare(
    `insert into agent_runtime_settings (
      settings_id,
      autonomy_mode,
      updated_at
    ) values (?, ?, ?)
    on conflict(settings_id) do update set
      autonomy_mode = excluded.autonomy_mode,
      updated_at = excluded.updated_at`
  ).run(
    DEFAULT_AGENT_RUNTIME_SETTINGS_ID,
    input.autonomyMode,
    updatedAt
  )

  return mapAgentRuntimeSettingsRow(loadAgentRuntimeSettingsRow(db, DEFAULT_AGENT_RUNTIME_SETTINGS_ID)!)
}

export function incrementAgentSuggestionAttempt(db: ArchiveDatabase, input: {
  suggestionId: string
  attemptedAt?: string
  cooldownUntil?: string | null
}): AgentSuggestionRecord | null {
  const attemptedAt = input.attemptedAt ?? new Date().toISOString()

  db.prepare(
    `update agent_suggestions
     set attempt_count = attempt_count + 1,
         last_attempted_at = ?,
         cooldown_until = ?,
         updated_at = ?
     where id = ?`
  ).run(
    attemptedAt,
    input.cooldownUntil ?? null,
    attemptedAt,
    input.suggestionId
  )

  return getAgentSuggestion(db, { suggestionId: input.suggestionId })
}

export function listRunnableAgentSuggestions(db: ArchiveDatabase, input: {
  now?: string
  limit?: number
} = {}): AgentSuggestionRecord[] {
  const now = input.now ?? new Date().toISOString()
  const runnableRows = listRunnableAgentSuggestionRows(db, now)

  return runnableRows
    .slice(0, input.limit ?? runnableRows.length)
    .map(mapAgentSuggestionRow)
}
