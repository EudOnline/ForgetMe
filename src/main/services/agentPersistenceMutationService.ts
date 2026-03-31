import crypto from 'node:crypto'
import type {
  AgentAutonomyMode,
  AgentMessageRecord,
  AgentRole,
  AgentRunExecutionOrigin,
  AgentRunStatus,
  AgentSuggestionPriority,
  AgentTaskKind,
  AgentTriggerKind,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { serializeAssignedRoles } from './agentPersistenceQueryService'

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

export function createAgentRunRecord(db: ArchiveDatabase, input: {
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
}) {
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

  return runId
}

export function updateAgentRunStatusRecord(db: ArchiveDatabase, input: {
  runId: string
  status: AgentRunStatus
  errorMessage?: string | null
  updatedAt?: string
}) {
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
}

export function updateAgentRunReplayMetadataRecord(db: ArchiveDatabase, input: {
  runId: string
  targetRole: AgentRole | null
  assignedRoles: AgentRole[]
  latestAssistantResponse?: string | null
  updatedAt?: string
}) {
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
    return
  }

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

export function appendAgentMessageRecord(db: ArchiveDatabase, input: {
  messageId?: string
  runId: string
  sender: AgentMessageRecord['sender']
  content: string
  createdAt?: string
}) {
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

    return messageId
  })
}

export function upsertAgentMemoryRecord(db: ArchiveDatabase, input: {
  memoryId?: string
  role: AgentRole
  memoryKey: string
  memoryValue: string
  createdAt?: string
  updatedAt?: string
}) {
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
}

export function createAgentPolicyVersionRecord(db: ArchiveDatabase, input: {
  policyVersionId?: string
  role: AgentRole
  policyKey: string
  policyBody: string
  createdAt?: string
}) {
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

  return policyVersionId
}

export function upsertAgentSuggestionRecord(db: ArchiveDatabase, input: {
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
}) {
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
}

export function dismissAgentSuggestionRecord(db: ArchiveDatabase, input: {
  suggestionId: string
  updatedAt?: string
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString()

  db.prepare(
    `update agent_suggestions
     set status = ?,
         updated_at = ?
     where id = ?`
  ).run('dismissed', updatedAt, input.suggestionId)
}

export function markAgentSuggestionExecutedRecord(db: ArchiveDatabase, input: {
  suggestionId: string
  runId: string
  updatedAt?: string
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString()

  db.prepare(
    `update agent_suggestions
     set status = ?,
         executed_run_id = ?,
         updated_at = ?
     where id = ?`
  ).run('executed', input.runId, updatedAt, input.suggestionId)
}

export function upsertAgentRuntimeSettingsRecord(db: ArchiveDatabase, input: {
  settingsId: string
  autonomyMode: AgentAutonomyMode
  updatedAt?: string
}) {
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
    input.settingsId,
    input.autonomyMode,
    updatedAt
  )
}

export function incrementAgentSuggestionAttemptRecord(db: ArchiveDatabase, input: {
  suggestionId: string
  attemptedAt?: string
  cooldownUntil?: string | null
}) {
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
}
