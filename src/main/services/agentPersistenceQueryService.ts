import type {
  AgentAutonomyMode,
  AgentMemoryRecord,
  AgentMessageRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  AgentRunExecutionOrigin,
  AgentRunRecord,
  AgentRunStatus,
  AgentRuntimeSettingsRecord,
  AgentSuggestionPriority,
  AgentSuggestionRecord,
  AgentSuggestionStatus,
  AgentTaskKind,
  AgentTriggerKind,
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
  executionOrigin: AgentRunExecutionOrigin | null
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
  priority: AgentSuggestionPriority | null
  rationale: string | null
  autoRunnable: number | null
  followUpOfSuggestionId: string | null
  attemptCount: number | null
  cooldownUntil: string | null
  lastAttemptedAt: string | null
  createdAt: string
  updatedAt: string
  lastObservedAt: string
}

type AgentRuntimeSettingsRow = {
  settingsId: string
  autonomyMode: AgentAutonomyMode
  updatedAt: string
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

export function serializeAssignedRoles(assignedRoles?: AgentRole[]) {
  return JSON.stringify(assignedRoles ?? [])
}

export function mapAgentRunRow(row: AgentRunRow): AgentRunRecord {
  return {
    runId: row.id,
    role: row.role,
    taskKind: row.taskKind,
    targetRole: row.targetRole,
    assignedRoles: parseAssignedRolesJson(row.assignedRolesJson),
    latestAssistantResponse: row.latestAssistantResponse,
    status: row.status,
    executionOrigin: row.executionOrigin ?? 'operator_manual',
    prompt: row.prompt,
    confirmationToken: row.confirmationToken,
    policyVersion: row.policyVersion,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function mapAgentMessageRow(row: AgentMessageRow): AgentMessageRecord {
  return {
    messageId: row.id,
    runId: row.runId,
    ordinal: row.ordinal,
    sender: row.sender,
    content: row.content,
    createdAt: row.createdAt
  }
}

export function mapAgentMemoryRow(row: AgentMemoryRow): AgentMemoryRecord {
  return {
    memoryId: row.id,
    role: row.role,
    memoryKey: row.memoryKey,
    memoryValue: row.memoryValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function mapAgentPolicyVersionRow(row: AgentPolicyVersionRow): AgentPolicyVersionRecord {
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

export function mapAgentSuggestionRow(row: AgentSuggestionRow): AgentSuggestionRecord {
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
    priority: row.priority ?? 'medium',
    rationale: row.rationale ?? '',
    autoRunnable: row.autoRunnable === 1,
    followUpOfSuggestionId: row.followUpOfSuggestionId,
    attemptCount: row.attemptCount ?? 0,
    cooldownUntil: row.cooldownUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastObservedAt: row.lastObservedAt
  }
}

export function mapAgentRuntimeSettingsRow(row: AgentRuntimeSettingsRow): AgentRuntimeSettingsRecord {
  return {
    settingsId: row.settingsId,
    autonomyMode: row.autonomyMode,
    updatedAt: row.updatedAt
  }
}

export function loadAgentRunRow(db: ArchiveDatabase, runId: string) {
  return db.prepare(
    `select
      id,
      role,
      task_kind as taskKind,
      target_role as targetRole,
      assigned_roles_json as assignedRolesJson,
      latest_assistant_response as latestAssistantResponse,
      status,
      execution_origin as executionOrigin,
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

export function listAgentRunRows(db: ArchiveDatabase) {
  return db.prepare(
    `select
      id,
      role,
      task_kind as taskKind,
      target_role as targetRole,
      assigned_roles_json as assignedRolesJson,
      latest_assistant_response as latestAssistantResponse,
      status,
      execution_origin as executionOrigin,
      prompt,
      confirmation_token as confirmationToken,
      policy_version as policyVersion,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     from agent_runs
     order by created_at desc, updated_at desc, id asc`
  ).all() as AgentRunRow[]
}

export function loadAgentMessageRows(db: ArchiveDatabase, runId: string) {
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

export function loadAgentMemoryRow(db: ArchiveDatabase, input: {
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

export function listAgentMemoryRows(db: ArchiveDatabase) {
  return db.prepare(
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
}

export function loadAgentPolicyVersionRow(db: ArchiveDatabase, policyVersionId: string) {
  return db.prepare(
    `select
      id,
      role,
      policy_key as policyKey,
      policy_body as policyBody,
      created_at as createdAt
     from agent_policy_versions
     where id = ?`
  ).get(policyVersionId) as AgentPolicyVersionRow | undefined
}

export function listAgentPolicyVersionRows(db: ArchiveDatabase) {
  return db.prepare(
    `select
      id,
      role,
      policy_key as policyKey,
      policy_body as policyBody,
      created_at as createdAt
     from agent_policy_versions
     order by created_at desc, id asc`
  ).all() as AgentPolicyVersionRow[]
}

export function loadAgentSuggestionRow(db: ArchiveDatabase, suggestionId: string) {
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
      priority,
      rationale,
      auto_runnable as autoRunnable,
      follow_up_of_suggestion_id as followUpOfSuggestionId,
      attempt_count as attemptCount,
      cooldown_until as cooldownUntil,
      last_attempted_at as lastAttemptedAt,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     where id = ?`
  ).get(suggestionId) as AgentSuggestionRow | undefined
}

export function loadAgentSuggestionRowByDedupeKey(db: ArchiveDatabase, dedupeKey: string) {
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
      priority,
      rationale,
      auto_runnable as autoRunnable,
      follow_up_of_suggestion_id as followUpOfSuggestionId,
      attempt_count as attemptCount,
      cooldown_until as cooldownUntil,
      last_attempted_at as lastAttemptedAt,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     where dedupe_key = ?`
  ).get(dedupeKey) as AgentSuggestionRow | undefined
}

export function listAgentSuggestionRows(db: ArchiveDatabase) {
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
      priority,
      rationale,
      auto_runnable as autoRunnable,
      follow_up_of_suggestion_id as followUpOfSuggestionId,
      attempt_count as attemptCount,
      cooldown_until as cooldownUntil,
      last_attempted_at as lastAttemptedAt,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     order by last_observed_at desc, updated_at desc, created_at desc, id asc`
  ).all() as AgentSuggestionRow[]
}

export function listRunnableAgentSuggestionRows(db: ArchiveDatabase, now: string) {
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
      priority,
      rationale,
      auto_runnable as autoRunnable,
      follow_up_of_suggestion_id as followUpOfSuggestionId,
      attempt_count as attemptCount,
      cooldown_until as cooldownUntil,
      last_attempted_at as lastAttemptedAt,
      created_at as createdAt,
      updated_at as updatedAt,
      last_observed_at as lastObservedAt
     from agent_suggestions
     where status = 'suggested'
       and auto_runnable = 1
       and (cooldown_until is null or cooldown_until <= ?)
     order by
       case priority
         when 'critical' then 0
         when 'high' then 1
         when 'medium' then 2
         else 3
       end asc,
       last_observed_at desc,
       updated_at desc,
       created_at desc,
       id asc`
  ).all(now) as AgentSuggestionRow[]
}

export function loadAgentRuntimeSettingsRow(db: ArchiveDatabase, settingsId: string) {
  return db.prepare(
    `select
      settings_id as settingsId,
      autonomy_mode as autonomyMode,
      updated_at as updatedAt
     from agent_runtime_settings
     where settings_id = ?`
  ).get(settingsId) as AgentRuntimeSettingsRow | undefined
}
