import crypto from 'node:crypto'
import type {
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  ListPersonAgentRefreshQueueInput,
  ListAgentMemoriesInput,
  ListAgentPolicyVersionsInput,
  PersonAgentAuditEventRecord,
  PersonAgentConsultationSessionDetail,
  PersonAgentConsultationSessionSummary,
  PersonAgentConsultationTurnRecord,
  PersonAgentFactMemoryConflictState,
  PersonAgentFactMemoryKind,
  PersonAgentFactMemoryRecord,
  PersonAgentInteractionMemoryRecord,
  PersonAgentInteractionOutcomeKind,
  PersonAgentMemoryRef,
  PersonAgentPromotionTier,
  PersonAgentRecord,
  PersonAgentRuntimeStateRecord,
  PersonAgentStrategyProfile,
  PersonAgentTaskStatus,
  PersonAgentTaskRecord,
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
  strategyProfileJson: string | null
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

type PersonAgentAuditEventRow = {
  id: string
  personAgentId: string | null
  canonicalPersonId: string
  eventKind: string
  payloadJson: string
  createdAt: string
}

type PersonAgentConsultationSessionRow = {
  id: string
  personAgentId: string
  canonicalPersonId: string
  title: string
  latestQuestion: string | null
  turnCount: number
  createdAt: string
  updatedAt: string
}

type PersonAgentConsultationTurnRow = {
  id: string
  sessionId: string
  personAgentId: string
  canonicalPersonId: string
  ordinal: number
  question: string
  answerPackJson: string
  createdAt: string
}

type PersonAgentRuntimeStateRow = {
  personAgentId: string
  canonicalPersonId: string
  activeSessionId: string | null
  sessionCount: number
  totalTurnCount: number
  latestQuestion: string | null
  latestQuestionClassification: string | null
  lastAnswerDigest: string | null
  lastConsultedAt: string | null
  updatedAt: string
}

type PersonAgentTaskRow = {
  id: string
  personAgentId: string
  canonicalPersonId: string
  taskKey: string | null
  taskKind: PersonAgentTaskRecord['taskKind']
  status: PersonAgentTaskRecord['status']
  priority: PersonAgentTaskRecord['priority']
  title: string
  summary: string
  sourceRefJson: string
  statusChangedAt: string | null
  statusSource: string | null
  statusReason: string | null
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

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function parseStrategyProfile(value: string | null): PersonAgentStrategyProfile | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersonAgentStrategyProfile>
    if (
      typeof parsed.profileVersion === 'number'
      && (parsed.responseStyle === 'concise' || parsed.responseStyle === 'contextual')
      && (parsed.evidencePreference === 'balanced' || parsed.evidencePreference === 'quote_first')
      && (parsed.conflictBehavior === 'balanced' || parsed.conflictBehavior === 'conflict_forward')
    ) {
      return {
        profileVersion: parsed.profileVersion,
        responseStyle: parsed.responseStyle,
        evidencePreference: parsed.evidencePreference,
        conflictBehavior: parsed.conflictBehavior
      }
    }
  } catch {
    return null
  }

  return null
}

function mapPersonAgentRow(row: PersonAgentRow): PersonAgentRecord {
  return {
    personAgentId: row.id,
    canonicalPersonId: row.canonicalPersonId,
    status: row.status,
    promotionTier: row.promotionTier,
    promotionScore: row.promotionScore,
    promotionReasonSummary: row.promotionReasonSummary,
    strategyProfile: parseStrategyProfile(row.strategyProfileJson),
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

function mapPersonAgentAuditEventRow(row: PersonAgentAuditEventRow): PersonAgentAuditEventRecord {
  return {
    auditEventId: row.id,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    eventKind: row.eventKind,
    payload: parseJsonObject(row.payloadJson),
    createdAt: row.createdAt
  }
}

function mapPersonAgentConsultationSessionRow(row: PersonAgentConsultationSessionRow): PersonAgentConsultationSessionSummary {
  return {
    sessionId: row.id,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    title: row.title,
    latestQuestion: row.latestQuestion,
    turnCount: row.turnCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapPersonAgentConsultationTurnRow(row: PersonAgentConsultationTurnRow): PersonAgentConsultationTurnRecord {
  return {
    turnId: row.id,
    sessionId: row.sessionId,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    ordinal: row.ordinal,
    question: row.question,
    answerPack: JSON.parse(row.answerPackJson),
    createdAt: row.createdAt
  }
}

function mapPersonAgentRuntimeStateRow(row: PersonAgentRuntimeStateRow): PersonAgentRuntimeStateRecord {
  return {
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    activeSessionId: row.activeSessionId,
    sessionCount: row.sessionCount,
    totalTurnCount: row.totalTurnCount,
    latestQuestion: row.latestQuestion,
    latestQuestionClassification: row.latestQuestionClassification as PersonAgentRuntimeStateRecord['latestQuestionClassification'],
    lastAnswerDigest: row.lastAnswerDigest,
    lastConsultedAt: row.lastConsultedAt,
    updatedAt: row.updatedAt
  }
}

function mapPersonAgentTaskRow(row: PersonAgentTaskRow): PersonAgentTaskRecord {
  return {
    taskId: row.id,
    taskKey: row.taskKey ?? `${row.taskKind}:${row.id}`,
    personAgentId: row.personAgentId,
    canonicalPersonId: row.canonicalPersonId,
    taskKind: row.taskKind,
    status: row.status,
    priority: row.priority,
    title: row.title,
    summary: row.summary,
    sourceRef: parseJsonObject(row.sourceRefJson),
    statusChangedAt: row.statusChangedAt ?? row.updatedAt,
    statusSource: row.statusSource,
    statusReason: row.statusReason,
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
  strategyProfile?: PersonAgentStrategyProfile | null
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
  const strategyProfileJson = input.strategyProfile
    ? JSON.stringify(input.strategyProfile)
    : null

  db.prepare(
    `insert into person_agents (
      id,
      canonical_person_id,
      status,
      promotion_tier,
      promotion_score,
      promotion_reason_summary,
      strategy_profile_json,
      facts_version,
      interaction_version,
      last_refreshed_at,
      last_activated_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(canonical_person_id) do update set
      status = excluded.status,
      promotion_tier = excluded.promotion_tier,
      promotion_score = excluded.promotion_score,
      promotion_reason_summary = excluded.promotion_reason_summary,
      strategy_profile_json = case
        when excluded.strategy_profile_json is not null then excluded.strategy_profile_json
        else person_agents.strategy_profile_json
      end,
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
    strategyProfileJson,
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
      strategy_profile_json as strategyProfileJson,
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
      strategy_profile_json as strategyProfileJson,
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

export function appendPersonAgentAuditEvent(db: ArchiveDatabase, input: {
  auditEventId?: string
  personAgentId?: string | null
  canonicalPersonId: string
  eventKind: string
  payload?: Record<string, unknown>
  createdAt?: string
}): PersonAgentAuditEventRecord {
  const auditEventId = input.auditEventId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date().toISOString()

  db.prepare(
    `insert into person_agent_audit_events (
      id,
      person_agent_id,
      canonical_person_id,
      event_kind,
      payload_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?)`
  ).run(
    auditEventId,
    input.personAgentId ?? null,
    input.canonicalPersonId,
    input.eventKind,
    JSON.stringify(input.payload ?? {}),
    createdAt
  )

  return listPersonAgentAuditEvents(db, {}).find((row) => row.auditEventId === auditEventId)!
}

export function listPersonAgentAuditEvents(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  eventKind?: string
} = {}): PersonAgentAuditEventRecord[] {
  const rows = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      event_kind as eventKind,
      payload_json as payloadJson,
      created_at as createdAt
     from person_agent_audit_events
     order by created_at desc, id asc`
  ).all() as PersonAgentAuditEventRow[]

  return rows
    .filter((row) => {
      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }

      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }

      if (input.eventKind && row.eventKind !== input.eventKind) {
        return false
      }

      return true
    })
    .map(mapPersonAgentAuditEventRow)
}

export function createPersonAgentConsultationSession(db: ArchiveDatabase, input: {
  sessionId?: string
  personAgentId: string
  canonicalPersonId: string
  title: string
  latestQuestion?: string | null
  turnCount?: number
  createdAt?: string
  updatedAt?: string
}): PersonAgentConsultationSessionSummary {
  const sessionId = input.sessionId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date().toISOString()
  const updatedAt = input.updatedAt ?? createdAt

  db.prepare(
    `insert into person_agent_consultation_sessions (
      id,
      person_agent_id,
      canonical_person_id,
      title,
      latest_question,
      turn_count,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    input.personAgentId,
    input.canonicalPersonId,
    input.title,
    input.latestQuestion ?? null,
    input.turnCount ?? 0,
    createdAt,
    updatedAt
  )

  return listPersonAgentConsultationSessions(db, {}).find((row) => row.sessionId === sessionId)!
}

export function listPersonAgentConsultationSessions(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
} = {}): PersonAgentConsultationSessionSummary[] {
  const rows = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      title,
      latest_question as latestQuestion,
      turn_count as turnCount,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_consultation_sessions
     order by updated_at desc, created_at desc, id asc`
  ).all() as PersonAgentConsultationSessionRow[]

  return rows
    .filter((row) => {
      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }
      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }
      return true
    })
    .map(mapPersonAgentConsultationSessionRow)
}

export function appendPersonAgentConsultationTurn(db: ArchiveDatabase, input: {
  turnId?: string
  sessionId: string
  personAgentId: string
  canonicalPersonId: string
  question: string
  answerPack: PersonAgentConsultationTurnRecord['answerPack']
  createdAt?: string
}): PersonAgentConsultationTurnRecord {
  const existingSession = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      title,
      latest_question as latestQuestion,
      turn_count as turnCount,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_consultation_sessions
     where id = ?`
  ).get(input.sessionId) as PersonAgentConsultationSessionRow | undefined

  if (!existingSession) {
    throw new Error(`Person-agent consultation session not found: ${input.sessionId}`)
  }

  if (existingSession.personAgentId !== input.personAgentId || existingSession.canonicalPersonId !== input.canonicalPersonId) {
    throw new Error(`Person-agent consultation session mismatch: ${input.sessionId}`)
  }

  const turnId = input.turnId ?? crypto.randomUUID()
  const createdAt = input.createdAt ?? new Date().toISOString()
  const ordinal = existingSession.turnCount + 1

  db.prepare(
    `insert into person_agent_consultation_turns (
      id,
      session_id,
      person_agent_id,
      canonical_person_id,
      ordinal,
      question,
      answer_pack_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    turnId,
    input.sessionId,
    input.personAgentId,
    input.canonicalPersonId,
    ordinal,
    input.question,
    JSON.stringify(input.answerPack),
    createdAt
  )

  db.prepare(
    `update person_agent_consultation_sessions
     set latest_question = ?, turn_count = ?, updated_at = ?
     where id = ?`
  ).run(
    input.question,
    ordinal,
    createdAt,
    input.sessionId
  )

  return getPersonAgentConsultationSession(db, {
    sessionId: input.sessionId
  })!.turns.find((turn) => turn.turnId === turnId)!
}

export function getPersonAgentConsultationSession(db: ArchiveDatabase, input: {
  sessionId: string
}): PersonAgentConsultationSessionDetail | null {
  const sessionRow = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      title,
      latest_question as latestQuestion,
      turn_count as turnCount,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_consultation_sessions
     where id = ?`
  ).get(input.sessionId) as PersonAgentConsultationSessionRow | undefined

  if (!sessionRow) {
    return null
  }

  const turnRows = db.prepare(
    `select
      id,
      session_id as sessionId,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      ordinal,
      question,
      answer_pack_json as answerPackJson,
      created_at as createdAt
     from person_agent_consultation_turns
     where session_id = ?
     order by ordinal asc, created_at asc`
  ).all(input.sessionId) as PersonAgentConsultationTurnRow[]

  return {
    ...mapPersonAgentConsultationSessionRow(sessionRow),
    turns: turnRows.map(mapPersonAgentConsultationTurnRow)
  }
}

export function upsertPersonAgentRuntimeState(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  activeSessionId?: string | null
  sessionCount: number
  totalTurnCount: number
  latestQuestion?: string | null
  latestQuestionClassification?: PersonAgentRuntimeStateRecord['latestQuestionClassification']
  lastAnswerDigest?: string | null
  lastConsultedAt?: string | null
  updatedAt?: string
}): PersonAgentRuntimeStateRecord {
  const updatedAt = input.updatedAt ?? new Date().toISOString()

  db.prepare(
    `insert into person_agent_runtime_state (
      person_agent_id,
      canonical_person_id,
      active_session_id,
      session_count,
      total_turn_count,
      latest_question,
      latest_question_classification,
      last_answer_digest,
      last_consulted_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(person_agent_id) do update set
      canonical_person_id = excluded.canonical_person_id,
      active_session_id = excluded.active_session_id,
      session_count = excluded.session_count,
      total_turn_count = excluded.total_turn_count,
      latest_question = excluded.latest_question,
      latest_question_classification = excluded.latest_question_classification,
      last_answer_digest = excluded.last_answer_digest,
      last_consulted_at = excluded.last_consulted_at,
      updated_at = excluded.updated_at`
  ).run(
    input.personAgentId,
    input.canonicalPersonId,
    input.activeSessionId ?? null,
    input.sessionCount,
    input.totalTurnCount,
    input.latestQuestion ?? null,
    input.latestQuestionClassification ?? null,
    input.lastAnswerDigest ?? null,
    input.lastConsultedAt ?? null,
    updatedAt
  )

  return getPersonAgentRuntimeState(db, {
    personAgentId: input.personAgentId
  })!
}

export function getPersonAgentRuntimeState(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
}): PersonAgentRuntimeStateRecord | null {
  const row = db.prepare(
    `select
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      active_session_id as activeSessionId,
      session_count as sessionCount,
      total_turn_count as totalTurnCount,
      latest_question as latestQuestion,
      latest_question_classification as latestQuestionClassification,
      last_answer_digest as lastAnswerDigest,
      last_consulted_at as lastConsultedAt,
      updated_at as updatedAt
     from person_agent_runtime_state
     order by updated_at desc`
  ).all() as PersonAgentRuntimeStateRow[]

  const matched = row.find((candidate) => {
    if (input.personAgentId && candidate.personAgentId !== input.personAgentId) {
      return false
    }
    if (input.canonicalPersonId && candidate.canonicalPersonId !== input.canonicalPersonId) {
      return false
    }
    return true
  })

  return matched ? mapPersonAgentRuntimeStateRow(matched) : null
}

export function replacePersonAgentTasks(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  rows: Array<{
    taskKey: string
    taskKind: PersonAgentTaskRecord['taskKind']
    status: PersonAgentTaskRecord['status']
    priority: PersonAgentTaskRecord['priority']
    title: string
    summary: string
    sourceRef?: Record<string, unknown>
  }>
  now?: string
}): PersonAgentTaskRecord[] {
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

  const now = input.now ?? new Date().toISOString()
  const existingTasks = listPersonAgentTasks(db, {
    personAgentId: input.personAgentId
  })
  const existingByTaskKey = new Map(existingTasks.map((task) => [task.taskKey, task]))
  db.exec('begin immediate')
  try {
    db.prepare(
      `delete from person_agent_tasks
       where person_agent_id = ?`
    ).run(input.personAgentId)

    for (const row of input.rows) {
      db.prepare(
        `insert into person_agent_tasks (
          id,
          person_agent_id,
          canonical_person_id,
          task_key,
          task_kind,
          status,
          priority,
          title,
          summary,
          source_ref_json,
          status_changed_at,
          status_source,
          status_reason,
          created_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        existingByTaskKey.get(row.taskKey)?.taskId ?? crypto.randomUUID(),
        input.personAgentId,
        input.canonicalPersonId,
        row.taskKey,
        row.taskKind,
        existingByTaskKey.get(row.taskKey)?.status ?? row.status,
        row.priority,
        row.title,
        row.summary,
        JSON.stringify(row.sourceRef ?? {}),
        existingByTaskKey.get(row.taskKey)?.statusChangedAt ?? now,
        existingByTaskKey.get(row.taskKey)?.statusSource ?? null,
        existingByTaskKey.get(row.taskKey)?.statusReason ?? null,
        existingByTaskKey.get(row.taskKey)?.createdAt ?? now,
        now
      )
    }

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }

  return listPersonAgentTasks(db, {
    personAgentId: input.personAgentId
  })
}

export function listPersonAgentTasks(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  status?: PersonAgentTaskStatus
} = {}): PersonAgentTaskRecord[] {
  const rows = db.prepare(
    `select
      id,
      person_agent_id as personAgentId,
      canonical_person_id as canonicalPersonId,
      task_key as taskKey,
      task_kind as taskKind,
      status,
      priority,
      title,
      summary,
      source_ref_json as sourceRefJson,
      status_changed_at as statusChangedAt,
      status_source as statusSource,
      status_reason as statusReason,
      created_at as createdAt,
      updated_at as updatedAt
     from person_agent_tasks
     order by
       case status
         when 'pending' then 0
         when 'processing' then 1
         when 'completed' then 2
         when 'dismissed' then 3
         else 4
       end asc,
       case priority when 'high' then 0 else 1 end asc,
       case task_kind
         when 'await_refresh' then 0
         when 'resolve_conflict' then 1
         when 'fill_coverage_gap' then 2
         when 'expand_topic' then 3
         when 'review_strategy_change' then 4
         else 5
       end asc,
       updated_at desc,
       id asc`
  ).all() as PersonAgentTaskRow[]

  return rows
    .filter((row) => {
      if (input.personAgentId && row.personAgentId !== input.personAgentId) {
        return false
      }
      if (input.canonicalPersonId && row.canonicalPersonId !== input.canonicalPersonId) {
        return false
      }
      if (input.status && row.status !== input.status) {
        return false
      }
      return true
    })
    .map(mapPersonAgentTaskRow)
}

export function getPersonAgentTaskById(db: ArchiveDatabase, input: {
  taskId: string
}): PersonAgentTaskRecord | null {
  return listPersonAgentTasks(db).find((task) => task.taskId === input.taskId) ?? null
}

export function updatePersonAgentTaskStatus(db: ArchiveDatabase, input: {
  taskId: string
  status: PersonAgentTaskStatus
  statusChangedAt?: string
  statusSource?: string | null
  statusReason?: string | null
  updatedAt?: string
}) {
  const existing = getPersonAgentTaskById(db, {
    taskId: input.taskId
  })

  if (!existing) {
    return null
  }

  const updatedAt = input.updatedAt ?? input.statusChangedAt ?? new Date().toISOString()
  const statusChangedAt = input.statusChangedAt ?? updatedAt

  db.prepare(
    `update person_agent_tasks
     set status = ?,
         status_changed_at = ?,
         status_source = ?,
         status_reason = ?,
         updated_at = ?
     where id = ?`
  ).run(
    input.status,
    statusChangedAt,
    input.statusSource ?? null,
    input.statusReason ?? null,
    updatedAt,
    input.taskId
  )

  return getPersonAgentTaskById(db, {
    taskId: input.taskId
  })
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
