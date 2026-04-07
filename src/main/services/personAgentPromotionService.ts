import type {
  PersonAgentPromotionScore,
  PersonAgentPromotionTier,
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

const DEFAULT_RECENT_WINDOW_DAYS = 30
const DETERMINISTIC_FALLBACK_EVALUATED_AT = '1970-01-01T00:00:00.000Z'
const MIN_COMMUNICATION_PROMOTION_FILE_COUNT = 2
const MIN_RECENT_QUESTION_COUNT_FOR_COMMUNICATION_PROMOTION = 2
const MIN_RECENT_CITATION_COUNT_FOR_COMMUNICATION_PROMOTION = 4

type PromotionThresholds = PersonAgentPromotionScore['thresholds']

const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  warming: 20,
  active: 45,
  highSignal: 70
}

export type PersonAgentPromotionSignals = PersonAgentPromotionScore['signals']

export type PersonAgentPromotionDecision = 'unpromoted' | 'candidate' | 'active'

export type PersonAgentPromotionEvaluation = {
  canonicalPersonId: string
  promotionTier: PersonAgentPromotionTier
  decision: PersonAgentPromotionDecision
  shouldActivate: boolean
  promotionScore: PersonAgentPromotionScore
  reasonSummary: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeIsoDate(value: string | undefined, fallback: string = DETERMINISTIC_FALLBACK_EVALUATED_AT) {
  const parsed = value ? Date.parse(value) : Number.NaN
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }

  const fallbackParsed = Date.parse(fallback)
  if (!Number.isNaN(fallbackParsed)) {
    return new Date(fallbackParsed).toISOString()
  }

  return DETERMINISTIC_FALLBACK_EVALUATED_AT
}

function resolveDeterministicEvaluatedAt(db: ArchiveDatabase, preferredNow?: string) {
  if (typeof preferredNow === 'string') {
    return normalizeIsoDate(preferredNow)
  }

  const row = db.prepare(
    `select max(ts) as ts
     from (
       select max(updated_at) as ts from canonical_people
       union all
       select max(updated_at) as ts from person_memberships
       union all
       select max(updated_at) as ts from person_profile_attributes
       union all
       select max(updated_at) as ts from memory_workspace_sessions
       union all
       select max(created_at) as ts from memory_workspace_turns
     )`
  ).get() as { ts: string | null } | undefined

  return normalizeIsoDate(row?.ts ?? undefined)
}

function cutoffIso(nowIso: string, recentWindowDays: number) {
  const parsed = Date.parse(nowIso)
  const base = Number.isNaN(parsed) ? Date.parse(DETERMINISTIC_FALLBACK_EVALUATED_AT) : parsed
  const clampedDays = clamp(recentWindowDays, 1, 365)
  const offsetMs = clampedDays * 24 * 60 * 60 * 1000
  return new Date(base - offsetMs).toISOString()
}

function parseTurnCitationCount(responseJson: string) {
  try {
    const parsed = JSON.parse(responseJson) as {
      answer?: { citations?: unknown }
      guardrail?: { citationCount?: unknown }
    }
    if (Array.isArray(parsed.answer?.citations)) {
      return parsed.answer.citations.length
    }

    const fallbackCount = parsed.guardrail?.citationCount
    if (typeof fallbackCount === 'number' && Number.isFinite(fallbackCount) && fallbackCount > 0) {
      return Math.floor(fallbackCount)
    }
  } catch {
    return 0
  }

  return 0
}

function countApprovedFactSignals(db: ArchiveDatabase, canonicalPersonId: string) {
  const row = db.prepare(
    `select count(*) as count
     from person_profile_attributes
     where canonical_person_id = ?
       and status = 'active'`
  ).get(canonicalPersonId) as { count: number } | undefined

  return row?.count ?? 0
}

function countEvidenceSources(db: ArchiveDatabase, canonicalPersonId: string) {
  const row = db.prepare(
    `select count(*) as count
     from (
       select distinct 'file:' || source_file_id as source_ref
       from person_profile_attributes
       where canonical_person_id = ?
         and status = 'active'
         and source_file_id is not null
       union
       select distinct 'evidence:' || source_evidence_id as source_ref
       from person_profile_attributes
       where canonical_person_id = ?
         and status = 'active'
         and source_evidence_id is not null
       union
       select distinct 'candidate:' || source_candidate_id as source_ref
       from person_profile_attributes
       where canonical_person_id = ?
         and status = 'active'
         and source_candidate_id is not null
     )`
  ).get(
    canonicalPersonId,
    canonicalPersonId,
    canonicalPersonId
  ) as { count: number } | undefined

  return row?.count ?? 0
}

function countRelationshipDegree(db: ArchiveDatabase, canonicalPersonId: string) {
  const anchorRows = db.prepare(
    `select anchor_person_id as anchorPersonId
     from person_memberships
     where canonical_person_id = ?
       and status = 'active'`
  ).all(canonicalPersonId) as Array<{ anchorPersonId: string }>

  if (anchorRows.length === 0) {
    return 0
  }

  const anchorPlaceholders = anchorRows.map(() => '?').join(', ')
  const fileRows = db.prepare(
    `select distinct target_id as fileId
     from relations
     where source_type = 'person'
       and target_type = 'file'
       and relation_type = 'mentioned_in_file'
       and source_id in (${anchorPlaceholders})`
  ).all(...anchorRows.map((row) => row.anchorPersonId)) as Array<{ fileId: string }>

  if (fileRows.length === 0) {
    return 0
  }

  const filePlaceholders = fileRows.map(() => '?').join(', ')
  const row = db.prepare(
    `select count(distinct pm.canonical_person_id) as count
     from relations r
     join person_memberships pm
       on pm.anchor_person_id = r.source_id
      and pm.status = 'active'
     where r.source_type = 'person'
       and r.target_type = 'file'
       and r.relation_type = 'mentioned_in_file'
       and r.target_id in (${filePlaceholders})
       and pm.canonical_person_id != ?`
  ).get(...fileRows.map((row) => row.fileId), canonicalPersonId) as { count: number } | undefined

  return row?.count ?? 0
}

function countCommunicationLinkedFileCount(db: ArchiveDatabase, canonicalPersonId: string) {
  const anchorRows = db.prepare(
    `select anchor_person_id as anchorPersonId
     from person_memberships
     where canonical_person_id = ?
       and status = 'active'`
  ).all(canonicalPersonId) as Array<{ anchorPersonId: string }>

  if (anchorRows.length === 0) {
    return 0
  }

  const anchorPlaceholders = anchorRows.map(() => '?').join(', ')
  const row = db.prepare(
    `select count(distinct file_id) as count
     from communication_evidence
     where speaker_anchor_person_id in (${anchorPlaceholders})`
  ).get(...anchorRows.map((row) => row.anchorPersonId)) as { count: number } | undefined

  return row?.count ?? 0
}

function countRecentInteractions(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  nowIso: string
  recentWindowDays: number
}) {
  const cutoff = cutoffIso(input.nowIso, input.recentWindowDays)
  const rows = db.prepare(
    `select turns.response_json as responseJson
     from memory_workspace_turns turns
     join memory_workspace_sessions sessions
       on sessions.id = turns.session_id
     where sessions.scope_kind = 'person'
       and sessions.scope_target_id = ?
       and turns.created_at >= ?
     order by turns.created_at asc, turns.id asc`
  ).all(input.canonicalPersonId, cutoff) as Array<{ responseJson: string }>

  const recentQuestionCount = rows.length
  const recentCitationCount = rows.reduce((count, row) => count + parseTurnCitationCount(row.responseJson), 0)

  return {
    recentQuestionCount,
    recentCitationCount
  }
}

function scoreSignals(signals: PersonAgentPromotionSignals) {
  const approvedFactScore = Math.min(30, signals.approvedFactCount * 5)
  const evidenceScore = Math.min(20, signals.evidenceSourceCount * 4)
  const communicationScore = signals.communicationFileCount >= MIN_COMMUNICATION_PROMOTION_FILE_COUNT
    ? Math.min(40, signals.communicationFileCount * 20)
    : 0
  const relationshipScore = Math.min(20, signals.relationshipDegree * 5)
  const questionScore = Math.min(20, signals.recentQuestionCount * 3)
  const citationScore = Math.min(10, signals.recentCitationCount)

  return approvedFactScore + evidenceScore + communicationScore + relationshipScore + questionScore + citationScore
}

function resolveTier(score: number, thresholds: PromotionThresholds): PersonAgentPromotionTier {
  if (score >= thresholds.highSignal) {
    return 'high_signal'
  }

  if (score >= thresholds.active) {
    return 'active'
  }

  if (score >= thresholds.warming) {
    return 'warming'
  }

  return 'cold'
}

function buildReasonSummary(input: {
  decision: PersonAgentPromotionDecision
  hasPromotionEvidence: boolean
  signals: PersonAgentPromotionSignals
  score: number
}) {
  if (!input.hasPromotionEvidence) {
    return `No approved evidence or communication breadth available; promotion disabled. Signals: facts=${input.signals.approvedFactCount}, evidence=${input.signals.evidenceSourceCount}, communicationFiles=${input.signals.communicationFileCount}, relationships=${input.signals.relationshipDegree}, recentQuestions=${input.signals.recentQuestionCount}, recentCitations=${input.signals.recentCitationCount}, score=${input.score}.`
  }

  return `Promotion decision=${input.decision}; signals: facts=${input.signals.approvedFactCount}, evidence=${input.signals.evidenceSourceCount}, communicationFiles=${input.signals.communicationFileCount}, relationships=${input.signals.relationshipDegree}, recentQuestions=${input.signals.recentQuestionCount}, recentCitations=${input.signals.recentCitationCount}, score=${input.score}.`
}

export function collectPersonAgentPromotionSignals(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  now?: string
  recentWindowDays?: number
}): PersonAgentPromotionSignals {
  const nowIso = resolveDeterministicEvaluatedAt(db, input.now)
  const recentWindowDays = input.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS

  const approvedFactCount = countApprovedFactSignals(db, input.canonicalPersonId)
  const evidenceSourceCount = countEvidenceSources(db, input.canonicalPersonId)
  const communicationFileCount = countCommunicationLinkedFileCount(db, input.canonicalPersonId)
  const relationshipDegree = countRelationshipDegree(db, input.canonicalPersonId)
  const interactionCounts = countRecentInteractions(db, {
    canonicalPersonId: input.canonicalPersonId,
    nowIso,
    recentWindowDays
  })

  return {
    approvedFactCount,
    evidenceSourceCount,
    communicationFileCount,
    relationshipDegree,
    recentQuestionCount: interactionCounts.recentQuestionCount,
    recentCitationCount: interactionCounts.recentCitationCount
  }
}

export function buildPersonAgentPromotionScore(input: {
  canonicalPersonId: string
  signals: PersonAgentPromotionSignals
  evaluatedAt?: string
  thresholds?: PromotionThresholds
}): PersonAgentPromotionScore {
  const thresholds = input.thresholds ?? DEFAULT_PROMOTION_THRESHOLDS
  return {
    canonicalPersonId: input.canonicalPersonId,
    totalScore: scoreSignals(input.signals),
    thresholds,
    signals: input.signals,
    evaluatedAt: normalizeIsoDate(input.evaluatedAt)
  }
}

export function evaluatePersonAgentPromotion(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  now?: string
  recentWindowDays?: number
  thresholds?: PromotionThresholds
}): PersonAgentPromotionEvaluation {
  const evaluatedAt = resolveDeterministicEvaluatedAt(db, input.now)
  const signals = collectPersonAgentPromotionSignals(db, {
    canonicalPersonId: input.canonicalPersonId,
    now: evaluatedAt,
    recentWindowDays: input.recentWindowDays
  })

  const promotionScore = buildPersonAgentPromotionScore({
    canonicalPersonId: input.canonicalPersonId,
    signals,
    evaluatedAt,
    thresholds: input.thresholds
  })

  const hasApprovedEvidence = signals.approvedFactCount > 0 || signals.evidenceSourceCount > 0
  const hasCommunicationPromotionEvidence =
    signals.communicationFileCount >= MIN_COMMUNICATION_PROMOTION_FILE_COUNT
    && (
      signals.relationshipDegree > 0
      || signals.recentQuestionCount >= MIN_RECENT_QUESTION_COUNT_FOR_COMMUNICATION_PROMOTION
      || signals.recentCitationCount >= MIN_RECENT_CITATION_COUNT_FOR_COMMUNICATION_PROMOTION
    )
  const hasPromotionEvidence = hasApprovedEvidence || hasCommunicationPromotionEvidence
  const computedTier = resolveTier(promotionScore.totalScore, promotionScore.thresholds)
  const promotionTier: PersonAgentPromotionTier = hasPromotionEvidence ? computedTier : 'cold'

  let decision: PersonAgentPromotionDecision = 'unpromoted'
  let shouldActivate = false

  if (hasPromotionEvidence && (promotionTier === 'active' || promotionTier === 'high_signal')) {
    decision = 'active'
    shouldActivate = true
  } else if (hasPromotionEvidence && promotionTier === 'warming') {
    decision = 'candidate'
  }

  return {
    canonicalPersonId: input.canonicalPersonId,
    promotionTier,
    decision,
    shouldActivate,
    promotionScore,
    reasonSummary: buildReasonSummary({
      decision,
      hasPromotionEvidence,
      signals,
      score: promotionScore.totalScore
    })
  }
}

export function listPersonAgentPromotionEvaluations(db: ArchiveDatabase, input: {
  now?: string
  recentWindowDays?: number
  thresholds?: PromotionThresholds
} = {}) {
  const people = db.prepare(
    `select id
     from canonical_people
     where status = 'approved'
     order by id asc`
  ).all() as Array<{ id: string }>

  return people.map((person) =>
    evaluatePersonAgentPromotion(db, {
      canonicalPersonId: person.id,
      now: input.now,
      recentWindowDays: input.recentWindowDays,
      thresholds: input.thresholds
    })
  )
}
