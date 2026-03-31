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
  mapAgentSuggestionRow
} from './agentPersistenceQueryService'
import {
  appendAgentMessageRecord,
  createAgentPolicyVersionRecord,
  createAgentRunRecord,
  dismissAgentSuggestionRecord,
  incrementAgentSuggestionAttemptRecord,
  markAgentSuggestionExecutedRecord,
  updateAgentRunReplayMetadataRecord,
  updateAgentRunStatusRecord,
  upsertAgentMemoryRecord,
  upsertAgentRuntimeSettingsRecord,
  upsertAgentSuggestionRecord
} from './agentPersistenceMutationService'

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

export function createAgentRun(
  db: ArchiveDatabase,
  input: CreateAgentRunInput
): AgentRunRecord {
  const runId = createAgentRunRecord(db, input)

  return mapAgentRunRow(loadAgentRunRow(db, runId)!)
}

export function updateAgentRunStatus(db: ArchiveDatabase, input: {
  runId: string
  status: AgentRunStatus
  errorMessage?: string | null
  updatedAt?: string
}): AgentRunRecord | null {
  updateAgentRunStatusRecord(db, input)

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
  updateAgentRunReplayMetadataRecord(db, input)

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
  const messageId = appendAgentMessageRecord(db, input)
  return mapAgentMessageRow(loadAgentMessageRows(db, input.runId).find((message) => message.id === messageId)!)
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
  upsertAgentMemoryRecord(db, input)

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
  const policyVersionId = createAgentPolicyVersionRecord(db, input)

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
  upsertAgentSuggestionRecord(db, input)

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
  dismissAgentSuggestionRecord(db, input)

  return getAgentSuggestion(db, { suggestionId: input.suggestionId })
}

export function markAgentSuggestionExecuted(
  db: ArchiveDatabase,
  input: { suggestionId: string; runId: string }
): AgentSuggestionRecord | null {
  markAgentSuggestionExecutedRecord(db, input)

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
  upsertAgentRuntimeSettingsRecord(db, {
    settingsId: DEFAULT_AGENT_RUNTIME_SETTINGS_ID,
    ...input
  })

  return mapAgentRuntimeSettingsRow(loadAgentRuntimeSettingsRow(db, DEFAULT_AGENT_RUNTIME_SETTINGS_ID)!)
}

export function incrementAgentSuggestionAttempt(db: ArchiveDatabase, input: {
  suggestionId: string
  attemptedAt?: string
  cooldownUntil?: string | null
}): AgentSuggestionRecord | null {
  incrementAgentSuggestionAttemptRecord(db, input)

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
