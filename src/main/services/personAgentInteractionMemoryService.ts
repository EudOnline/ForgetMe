import type {
  MemoryWorkspaceResponse,
  PersonAgentInteractionOutcomeKind,
  PersonAgentInteractionMemoryRecord,
  PersonAgentMemoryRef
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentInteractionMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from './governancePersistenceService'
import {
  listPersonAgentInteractionOutcomeKinds,
  listPersonAgentInteractionRefs
} from './memoryWorkspaceResponseService'

const PERSONA_KEYWORDS = ['像她本人', '像他本人', '像本人', '模仿', '口吻', '语气', '会怎么说', '会怎么建议', 'voice', 'style']
const QUOTE_KEYWORDS = ['原话', '怎么说', '表达', '说过', 'quote']
const CONFLICT_KEYWORDS = ['冲突', '矛盾', '不一致', 'ambigu', 'conflict']
const TIMELINE_KEYWORDS = ['最近', '发生', '时间线', 'timeline', 'latest', 'recent']
const RELATIONSHIP_KEYWORDS = ['关系', '朋友', '家人', '同学', '同事', 'relationship']

type InteractionTopic = {
  memoryKey: string
  topicLabel: string
}

type StoredTurnResponseRow = {
  responseJson: string
}

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase()
}

function hasKeyword(question: string, keywords: string[]) {
  const normalized = normalizeQuestion(question)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)]
}

function dedupeOutcomeKinds(values: PersonAgentInteractionOutcomeKind[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function dedupeRefs(refs: PersonAgentMemoryRef[]) {
  const seen = new Set<string>()
  const deduped: PersonAgentMemoryRef[] = []

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(ref)
  }

  return deduped.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
}

function resolveInteractionTopic(question: string, response: MemoryWorkspaceResponse): InteractionTopic {
  if (response.boundaryRedirect || hasKeyword(question, PERSONA_KEYWORDS) || response.expressionMode === 'advice') {
    return {
      memoryKey: 'topic.advice_request',
      topicLabel: 'Advice request'
    }
  }

  if (hasKeyword(question, QUOTE_KEYWORDS)) {
    return {
      memoryKey: 'topic.past_expressions',
      topicLabel: 'Past expressions'
    }
  }

  if (
    hasKeyword(question, CONFLICT_KEYWORDS)
    || response.guardrail.decision === 'fallback_to_conflict'
    || response.guardrail.reasonCodes.includes('open_conflict_present')
  ) {
    return {
      memoryKey: 'topic.conflict_resolution',
      topicLabel: 'Conflict resolution'
    }
  }

  if (hasKeyword(question, TIMELINE_KEYWORDS)) {
    return {
      memoryKey: 'topic.recent_timeline',
      topicLabel: 'Recent timeline'
    }
  }

  if (hasKeyword(question, RELATIONSHIP_KEYWORDS)) {
    return {
      memoryKey: 'topic.relationship_context',
      topicLabel: 'Relationship context'
    }
  }

  return {
    memoryKey: 'topic.profile_facts',
    topicLabel: 'Profile facts'
  }
}

function loadTurnInteractionRefs(db: ArchiveDatabase, turnIds: string[]) {
  if (turnIds.length === 0) {
    return []
  }

  const placeholders = turnIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `select response_json as responseJson
     from memory_workspace_turns
     where id in (${placeholders})`
  ).all(...turnIds) as StoredTurnResponseRow[]

  return dedupeRefs(
    rows.flatMap((row) => {
      try {
        return listPersonAgentInteractionRefs(JSON.parse(row.responseJson) as MemoryWorkspaceResponse)
      } catch {
        return []
      }
    })
  )
}

function extractContextLabelsFromSummary(summary: string) {
  const marker = 'Cited context: '
  const markerIndex = summary.indexOf(marker)
  if (markerIndex === -1) {
    return []
  }

  const suffix = summary.slice(markerIndex + marker.length).trim()
  const normalized = suffix.endsWith('.') ? suffix.slice(0, -1) : suffix
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function buildInteractionSummary(input: {
  topicLabel: string
  questionCount: number
  outcomeKinds: PersonAgentInteractionOutcomeKind[]
  contextLabels: string[]
}) {
  const contextText = input.contextLabels.length > 0
    ? ` Cited context: ${input.contextLabels.slice(0, 5).join(', ')}.`
    : ''

  return `${input.topicLabel}. Asked ${input.questionCount} times. Outcomes: ${input.outcomeKinds.join(', ')}.${contextText}`
}

export function recordPersonAgentInteractionMemory(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  turnId: string
  question: string
  response: MemoryWorkspaceResponse
  createdAt?: string
}): PersonAgentInteractionMemoryRecord {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (!personAgent) {
    throw new Error(`Person agent not found for canonical person: ${input.canonicalPersonId}`)
  }

  if (personAgent.personAgentId !== input.personAgentId) {
    throw new Error(
      `Person-agent mismatch: expected ${personAgent.personAgentId} for ${input.canonicalPersonId}, got ${input.personAgentId}`
    )
  }

  const topic = resolveInteractionTopic(input.question, input.response)
  const existing = listPersonAgentInteractionMemories(db, {
    personAgentId: input.personAgentId,
    memoryKey: topic.memoryKey
  })[0] ?? null
  const createdAt = input.createdAt ?? new Date().toISOString()
  const supportingTurnIds = dedupeStrings([
    ...(existing?.supportingTurnIds ?? []),
    input.turnId
  ])
  const currentOutcomeKinds = listPersonAgentInteractionOutcomeKinds(input.response)
  const outcomeKinds = dedupeOutcomeKinds([
    ...(existing?.outcomeKinds ?? []),
    ...currentOutcomeKinds
  ])
  const currentRefs = listPersonAgentInteractionRefs(input.response)
  const contextLabels = (() => {
    const loadedRefs = loadTurnInteractionRefs(db, supportingTurnIds)
    if (loadedRefs.length > 0) {
      return dedupeStrings(loadedRefs.map((ref) => ref.label))
    }

    return dedupeStrings([
      ...extractContextLabelsFromSummary(existing?.summary ?? ''),
      ...dedupeRefs(currentRefs).map((ref) => ref.label)
    ])
  })()
  const questionCount = (existing?.questionCount ?? 0) + 1
  const citationCount = (existing?.citationCount ?? 0) + input.response.guardrail.citationCount
  const lastCitationAt = input.response.guardrail.citationCount > 0
    ? createdAt
    : (existing?.lastCitationAt ?? null)
  const summary = buildInteractionSummary({
    topicLabel: topic.topicLabel,
    questionCount,
    outcomeKinds,
    contextLabels
  })

  const record = upsertPersonAgentInteractionMemory(db, {
    memoryId: existing?.memoryId,
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    memoryKey: topic.memoryKey,
    topicLabel: topic.topicLabel,
    summary,
    questionCount,
    citationCount,
    outcomeKinds,
    supportingTurnIds,
    lastQuestionAt: createdAt,
    lastCitationAt,
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt: createdAt
  })

  upsertPersonAgent(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: personAgent.canonicalPersonId,
    status: personAgent.status,
    promotionTier: personAgent.promotionTier,
    promotionScore: personAgent.promotionScore,
    promotionReasonSummary: personAgent.promotionReasonSummary,
    factsVersion: personAgent.factsVersion,
    interactionVersion: personAgent.interactionVersion + 1,
    lastRefreshedAt: personAgent.lastRefreshedAt,
    lastActivatedAt: personAgent.lastActivatedAt
  })

  return record
}

export function recordPersistedPersonAgentInteractionIfEligible(db: ArchiveDatabase, input: {
  scope: MemoryWorkspaceResponse['scope']
  turnId: string
  question: string
  response: MemoryWorkspaceResponse
  createdAt?: string
}) {
  if (input.scope.kind !== 'person') {
    return null
  }

  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.scope.canonicalPersonId
  })

  if (!personAgent || personAgent.status !== 'active') {
    return null
  }

  return recordPersonAgentInteractionMemory(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.scope.canonicalPersonId,
    turnId: input.turnId,
    question: input.question,
    response: input.response,
    createdAt: input.createdAt
  })
}
