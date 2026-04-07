import crypto from 'node:crypto'
import type {
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  ListPersonAgentRefreshQueueInput,
  ListAgentMemoriesInput,
  ListAgentPolicyVersionsInput,
  PersonAgentFactMemoryConflictState,
  PersonAgentFactMemoryKind,
  PersonAgentFactMemoryRecord,
  PersonAgentInteractionMemoryRecord,
  PersonAgentInteractionOutcomeKind,
  PersonAgentMemoryRef,
  PersonAgentPromotionTier,
  PersonAgentRecord,
  PersonAgentStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type GovernanceMemoryRow = {
  id: string
  role: AgentRole
  memoryKey: string
  memoryValue: string
  createdAt: string
  updatedAt: string
}

type GovernancePolicyVersionRow = {
  id: string
  role: AgentRole
  policyKey: string
  policyBody: string
  createdAt: string
}

type PersonAgentRow = {
  id: string
  canonicalPersonId: string
  status: PersonAgentStatus
  promotionTier: PersonAgentPromotionTier
  promotionScore: number
  promotionReasonSummary: string
  factsVersion: number
  interactionVersion: number
  lastRefreshedAt: string | null
  lastActivatedAt: string | null
  createdAt: string
  updatedAt: string
}

type PersonAgentFactMemoryRow = {
  id: string
  personAgentId: string
  canonicalPersonId: string
  memoryKey: string
  sectionKey: string
  displayLabel: string
  summaryValue: string
  memoryKind: PersonAgentFactMemoryKind
  confidence: number | null
  conflictState: PersonAgentFactMemoryConflictState
  freshnessAt: string | null
  sourceRefsJson: string
  sourceHash: string
  createdAt: string
  updatedAt: string
}

type PersonAgentRefreshQueueRow = {
  id: string
  canonicalPersonId: string
  personAgentId: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reasonsJson: string
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type PersonAgentInteractionMemoryRow = {
  id: string
  personAgentId: string
  canonicalPersonId: string
  memoryKey: string
  topicLabel: string
  summary: string
  questionCount: number
  citationCount: number
  outcomeKindsJson: string
  supportingTurnIdsJson: string
  lastQuestionAt: string | null
  lastCitationAt: string | null
  createdAt: string
  updatedAt: string
}

export type PersonAgentRefreshQueueRecord = {
  refreshId: string
  canonicalPersonId: string
  personAgentId: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reasons: string[]
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

function mapMemoryRow(row: GovernanceMemoryRow): AgentMemoryRecord {
  return {
    memoryId: row.id,
    role: row.role,
    memoryKey: row.memoryKey,
    memoryValue: row.memoryValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapPolicyVersionRow(row: GovernancePolicyVersionRow): AgentPolicyVersionRecord {
  return {
    policyVersionId: row.id,
    role: row.role,
    policyKey: row.policyKey,
    policyBody: row.policyBody,
    createdAt: row.createdAt
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function mapPersonAgentRow(row: PersonAgentRow): PersonAgentRecord {
  return {
    personAgentId: row.id,
    canonicalPersonId: row.canonicalPersonId,
    status: row.status,
    promotionTier: row.promotionTier,
    promotionScore: row.promotionScore,
    promotionReasonSummary: row.promotionReasonSummary,
    factsVersion: row.factsVersion,
    interactionVersion: row.interactionVersion,
    lastRefreshedAt: row.lastRefreshedAt,
    lastActivatedAt: row.lastActivatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapPersonAgentFactMemoryRow(row: PersonAgentFactMemoryRow): PersonAgentFactMemoryRecord {
  return {
    memoryId: row.id,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    memoryKey: row.memoryKey,
    sectionKey: row.sectionKey,
    displayLabel: row.displayLabel,
    summaryValue: row.summaryValue,
    memoryKind: row.memoryKind,
    confidence: row.confidence,
    conflictState: row.conflictState,
    freshnessAt: row.freshnessAt,
    sourceRefs: parseJsonArray<PersonAgentMemoryRef>(row.sourceRefsJson),
    sourceHash: row.sourceHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapPersonAgentRefreshQueueRow(row: PersonAgentRefreshQueueRow): PersonAgentRefreshQueueRecord {
  return {
    refreshId: row.id,
    canonicalPersonId: row.canonicalPersonId,
    personAgentId: row.personAgentId,
    status: row.status,
    reasons: parseJsonArray<string>(row.reasonsJson),
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapPersonAgentInteractionMemoryRow(row: PersonAgentInteractionMemoryRow): PersonAgentInteractionMemoryRecord {
  return {
    memoryId: row.id,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    memoryKey: row.memoryKey,
    topicLabel: row.topicLabel,
    summary: row.summary,
    questionCount: row.questionCount,
    citationCount: row.citationCount,
    outcomeKinds: parseJsonArray<PersonAgentInteractionOutcomeKind>(row.outcomeKindsJson),
    supportingTurnIds: parseJsonArray<string>(row.supportingTurnIdsJson),
    lastQuestionAt: row.lastQuestionAt,
    lastCitationAt: row.lastCitationAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
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

  return listAgentMemories(db, {
    role: input.role,
    memoryKey: input.memoryKey
  })[0]!
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
     order by updated_at desc, id asc`
  ).all() as GovernanceMemoryRow[]

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
    .map(mapMemoryRow)
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

  return listAgentPolicyVersions(db, {
    role: input.role,
    policyKey: input.policyKey
  }).find((record) => record.policyVersionId === policyVersionId)!
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
  ).all() as GovernancePolicyVersionRow[]

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
    .map(mapPolicyVersionRow)
}

export function upsertPersonAgent(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId: string
  status: PersonAgentStatus
  promotionTier: PersonAgentPromotionTier
  promotionScore: number
  promotionReasonSummary: string
  factsVersion: number
  interactionVersion: number
  lastRefreshedAt?: string | null
  lastActivatedAt?: string | null
  createdAt?: string
  updatedAt?: string
}): PersonAgentRecord {
  const now = new Date().toISOString()
  const createdAt = input.createdAt ?? now
  const updatedAt = input.updatedAt ?? now
  const personAgentId = input.personAgentId ?? crypto.randomUUID()

  db.prepare(
    `insert into person_agents (
      id,
      canonical_person_id,
      status,
      promotion_tier,
      promotion_score,
      promotion_reason_summary,
      facts_version,
      interaction_version,
      last_refreshed_at,
      last_activated_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(canonical_person_id) do update set
      status = excluded.status,
      promotion_tier = excluded.promotion_tier,
      promotion_score = excluded.promotion_score,
      promotion_reason_summary = excluded.promotion_reason_summary,
      facts_version = excluded.facts_version,
      interaction_version = excluded.interaction_version,
      last_refreshed_at = excluded.last_refreshed_at,
      last_activated_at = excluded.last_activated_at,
      updated_at = excluded.updated_at`
  ).run(
    personAgentId,
    input.canonicalPersonId,
    input.status,
    input.promotionTier,
    input.promotionScore,
    input.promotionReasonSummary,
    input.factsVersion,
    input.interactionVersion,
    input.lastRefreshedAt ?? null,
    input.lastActivatedAt ?? null,
    createdAt,
    updatedAt
  )

  return getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })!
}

export function getPersonAgentByCanonicalPersonId(db: ArchiveDatabase, input: {
  canonicalPersonId: string
}): PersonAgentRecord | null {
  const row = db.prepare(
    `select
      id,
      canonical_person_id as canonicalPersonId,
      status,
      promotion_tier as promotionTier,
      promotion_score as promotionScore,
      promotion_reason_summary as promotionReasonSummary,
      facts_version as factsVersion,
      interaction_version as interactionVersion,
      last_refreshed_at as lastRefreshedAt,
      last_activated_at as lastActivatedAt,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agents
     where canonical_person_id = ?`
  ).get(input.canonicalPersonId) as PersonAgentRow | undefined

  return row ? mapPersonAgentRow(row) : null
}

export function listPersonAgents(db: ArchiveDatabase, input: {
  status?: PersonAgentStatus
  canonicalPersonId?: string
} = {}): PersonAgentRecord[] {
  const rows = db.prepare(
    `select
      id,
      canonical_person_id as canonicalPersonId,
      status,
      promotion_tier as promotionTier,
      promotion_score as promotionScore,
      promotion_reason_summary as promotionReasonSummary,
      facts_version as factsVersion,
      interaction_version as interactionVersion,
      last_refreshed_at as lastRefreshedAt,
      last_activated_at as lastActivatedAt,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agents
     order by updated_at desc, id asc`
  ).all() as PersonAgentRow[]

  return rows
    .filter((row) => {
      if (input.status && row.status !== input.status) {
        return false
      }

      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }

      return true
    })
    .map(mapPersonAgentRow)
}

export function replacePersonAgentFactMemories(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  rows: Array<{
    memoryKey: string
    sectionKey: string
    displayLabel: string
    summaryValue: string
    memoryKind: PersonAgentFactMemoryKind
    confidence: number | null
    conflictState: PersonAgentFactMemoryConflictState
    freshnessAt: string | null
    sourceRefs: PersonAgentMemoryRef[]
    sourceHash: string
  }>
}): PersonAgentFactMemoryRecord[] {
  const ownerRow = db.prepare(
    `select canonical_person_id as canonicalPersonId
     from person_agents
     where id = ?`
  ).get(input.personAgentId) as { canonicalPersonId: string } | undefined

  if (!ownerRow) {
    throw new Error(`Person agent not found: ${input.personAgentId}`)
  }

  if (ownerRow.canonicalPersonId !== input.canonicalPersonId) {
    throw new Error(
      `Person-agent canonical mismatch: ${input.personAgentId} belongs to ${ownerRow.canonicalPersonId}, got ${input.canonicalPersonId}`
    )
  }

  const now = new Date().toISOString()
  db.exec('begin immediate')
  try {
    db.prepare(
      `delete from person_agent_fact_memory
       where person_agent_id = ?`
    ).run(input.personAgentId)

    for (const row of input.rows) {
      db.prepare(
        `insert into person_agent_fact_memory (
          id,
          person_agent_id,
          canonical_person_id,
          memory_key,
          section_key,
          display_label,
          summary_value,
          memory_kind,
          confidence,
          conflict_state,
          freshness_at,
          source_refs_json,
          source_hash,
          created_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        input.personAgentId,
        input.canonicalPersonId,
        row.memoryKey,
        row.sectionKey,
        row.displayLabel,
        row.summaryValue,
        row.memoryKind,
        row.confidence,
        row.conflictState,
        row.freshnessAt,
        JSON.stringify(row.sourceRefs),
        row.sourceHash,
        now,
        now
      )
    }

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }

  return listPersonAgentFactMemories(db, {
    personAgentId: input.personAgentId
  })
}

export function listPersonAgentFactMemories(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  memoryKey?: string
} = {}): PersonAgentFactMemoryRecord[] {
  const rows = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      memory_key as memoryKey,
      section_key as sectionKey,
      display_label as displayLabel,
      summary_value as summaryValue,
      memory_kind as memoryKind,
      confidence,
      conflict_state as conflictState,
      freshness_at as freshnessAt,
      source_refs_json as sourceRefsJson,
      source_hash as sourceHash,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_fact_memory
     order by updated_at desc, id asc`
  ).all() as PersonAgentFactMemoryRow[]

  return rows
    .filter((row) => {
      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }

      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }

      if (input.memoryKey && row.memoryKey !== input.memoryKey) {
        return false
      }

      return true
    })
    .map(mapPersonAgentFactMemoryRow)
}

export function upsertPersonAgentInteractionMemory(db: ArchiveDatabase, input: {
  memoryId?: string
  personAgentId: string
  canonicalPersonId: string
  memoryKey: string
  topicLabel: string
  summary: string
  questionCount: number
  citationCount: number
  outcomeKinds: PersonAgentInteractionOutcomeKind[]
  supportingTurnIds: string[]
  lastQuestionAt: string | null
  lastCitationAt: string | null
  createdAt?: string
  updatedAt?: string
}): PersonAgentInteractionMemoryRecord {
  const ownerRow = db.prepare(
    `select canonical_person_id as canonicalPersonId
     from person_agents
     where id = ?`
  ).get(input.personAgentId) as { canonicalPersonId: string } | undefined

  if (!ownerRow) {
    throw new Error(`Person agent not found: ${input.personAgentId}`)
  }

  if (ownerRow.canonicalPersonId !== input.canonicalPersonId) {
    throw new Error(
      `Person-agent canonical mismatch: ${input.personAgentId} belongs to ${ownerRow.canonicalPersonId}, got ${input.canonicalPersonId}`
    )
  }

  const existing = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      memory_key as memoryKey,
      topic_label as topicLabel,
      summary,
      question_count as questionCount,
      citation_count as citationCount,
      outcome_kinds_json as outcomeKindsJson,
      supporting_turn_ids_json as supportingTurnIdsJson,
      last_question_at as lastQuestionAt,
      last_citation_at as lastCitationAt,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_interaction_memory
     where person_agent_id = ?
       and memory_key = ?
     limit 1`
  ).get(input.personAgentId, input.memoryKey) as PersonAgentInteractionMemoryRow | undefined

  const now = new Date().toISOString()
  const memoryId = existing?.id ?? input.memoryId ?? crypto.randomUUID()
  const createdAt = existing?.createdAt ?? input.createdAt ?? now
  const updatedAt = input.updatedAt ?? now

  if (existing) {
    db.prepare(
      `update person_agent_interaction_memory
       set topic_label = ?,
           summary = ?,
           question_count = ?,
           citation_count = ?,
           outcome_kinds_json = ?,
           supporting_turn_ids_json = ?,
           last_question_at = ?,
           last_citation_at = ?,
           updated_at = ?
       where id = ?`
    ).run(
      input.topicLabel,
      input.summary,
      input.questionCount,
      input.citationCount,
      JSON.stringify(input.outcomeKinds),
      JSON.stringify(input.supportingTurnIds),
      input.lastQuestionAt,
      input.lastCitationAt,
      updatedAt,
      existing.id
    )
  } else {
    db.prepare(
      `insert into person_agent_interaction_memory (
        id,
        person_agent_id,
        canonical_person_id,
        memory_key,
        topic_label,
        summary,
        question_count,
        citation_count,
        outcome_kinds_json,
        supporting_turn_ids_json,
        last_question_at,
        last_citation_at,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      memoryId,
      input.personAgentId,
      input.canonicalPersonId,
      input.memoryKey,
      input.topicLabel,
      input.summary,
      input.questionCount,
      input.citationCount,
      JSON.stringify(input.outcomeKinds),
      JSON.stringify(input.supportingTurnIds),
      input.lastQuestionAt,
      input.lastCitationAt,
      createdAt,
      updatedAt
    )
  }

  return listPersonAgentInteractionMemories(db, {
    personAgentId: input.personAgentId,
    memoryKey: input.memoryKey
  })[0]!
}

export function listPersonAgentInteractionMemories(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  memoryKey?: string
} = {}): PersonAgentInteractionMemoryRecord[] {
  const rows = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      memory_key as memoryKey,
      topic_label as topicLabel,
      summary,
      question_count as questionCount,
      citation_count as citationCount,
      outcome_kinds_json as outcomeKindsJson,
      supporting_turn_ids_json as supportingTurnIdsJson,
      last_question_at as lastQuestionAt,
      last_citation_at as lastCitationAt,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_interaction_memory
     order by updated_at desc, id asc`
  ).all() as PersonAgentInteractionMemoryRow[]

  return rows
    .filter((row) => {
      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }

      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }

      if (input.memoryKey && row.memoryKey !== input.memoryKey) {
        return false
      }

      return true
    })
    .map(mapPersonAgentInteractionMemoryRow)
}

export function enqueuePersonAgentRefresh(db: ArchiveDatabase, input: {
  refreshId?: string
  canonicalPersonId: string
  personAgentId?: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reasons: string[]
  requestedAt?: string
  startedAt?: string | null
  completedAt?: string | null
  lastError?: string | null
  createdAt?: string
  updatedAt?: string
}): PersonAgentRefreshQueueRecord {
  const now = new Date().toISOString()
  const refreshId = input.refreshId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? now
  const updatedAt = input.updatedAt ?? now

  db.prepare(
    `insert into person_agent_refresh_queue (
      id,
      canonical_person_id,
      person_agent_id,
      status,
      reasons_json,
      requested_at,
      started_at,
      completed_at,
      last_error,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    refreshId,
    input.canonicalPersonId,
    input.personAgentId ?? null,
    input.status,
    JSON.stringify(input.reasons),
    input.requestedAt ?? now,
    input.startedAt ?? null,
    input.completedAt ?? null,
    input.lastError ?? null,
    createdAt,
    updatedAt
  )

  return listPersonAgentRefreshQueue(db, {}).find((row) => row.refreshId === refreshId)!
}

export function listPersonAgentRefreshQueue(
  db: ArchiveDatabase,
  input: ListPersonAgentRefreshQueueInput & {
    canonicalPersonId?: string
    personAgentId?: string
  } = {}
): PersonAgentRefreshQueueRecord[] {
  const rows = db.prepare(
    `select
      id,
      canonical_person_id as canonicalPersonId,
      person_agent_id as personAgentId,
      status,
      reasons_json as reasonsJson,
      requested_at as requestedAt,
      started_at as startedAt,
      completed_at as completedAt,
      last_error as lastError,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_refresh_queue
     order by requested_at desc, id asc`
  ).all() as PersonAgentRefreshQueueRow[]

  return rows
    .filter((row) => {
      if (input.status && row.status !== input.status) {
        return false
      }

      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }

      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }

      return true
    })
    .map(mapPersonAgentRefreshQueueRow)
}
