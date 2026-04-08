import type {
  PersonAgentConsultationSessionDetail,
  PersonAgentConsultationSessionSummary,
  PersonAgentConsultationTurnRecord,
  PersonAgentRuntimeStateRecord
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentConsultationTurn,
  createPersonAgentConsultationSession,
  getPersonAgentByCanonicalPersonId,
  getPersonAgentConsultationSession as getPersistedConsultationSession,
  getPersonAgentRuntimeState,
  listPersonAgentConsultationSessions as listPersistedConsultationSessions,
  upsertPersonAgentRuntimeState
} from './governancePersistenceService'
import { buildPersonAgentAnswerPack } from './personAgentAnswerPackService'

function resolveSessionTitle(db: ArchiveDatabase, canonicalPersonId: string) {
  const row = db.prepare(
    `select primary_display_name as displayName
     from canonical_people
     where id = ?`
  ).get(canonicalPersonId) as { displayName: string } | undefined

  return `Person Agent · ${row?.displayName ?? canonicalPersonId}`
}

function summarizeAnswerDigest(candidateAnswer: string) {
  const trimmed = candidateAnswer.trim()
  return trimmed.length <= 240 ? trimmed : `${trimmed.slice(0, 237)}...`
}

export function listPersonAgentConsultationSessions(
  db: ArchiveDatabase,
  input: { personAgentId?: string; canonicalPersonId?: string } = {}
): PersonAgentConsultationSessionSummary[] {
  return listPersistedConsultationSessions(db, input)
}

export function getPersonAgentConsultationSession(
  db: ArchiveDatabase,
  input: { sessionId: string }
): PersonAgentConsultationSessionDetail | null {
  return getPersistedConsultationSession(db, input)
}

export function askPersonAgentConsultationPersisted(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  question: string
  sessionId?: string
  now?: string
}): PersonAgentConsultationTurnRecord | null {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (!personAgent || personAgent.status !== 'active') {
    return null
  }

  const answerPack = buildPersonAgentAnswerPack(db, {
    canonicalPersonId: input.canonicalPersonId,
    question: input.question
  })

  if (!answerPack) {
    return null
  }

  const now = input.now ?? new Date().toISOString()
  const existingSession = input.sessionId
    ? getPersistedConsultationSession(db, { sessionId: input.sessionId })
    : null

  if (input.sessionId && (!existingSession || existingSession.personAgentId !== personAgent.personAgentId)) {
    return null
  }

  const session = existingSession ?? createPersonAgentConsultationSession(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    title: resolveSessionTitle(db, input.canonicalPersonId),
    createdAt: now,
    updatedAt: now
  })

  const turn = appendPersonAgentConsultationTurn(db, {
    sessionId: session.sessionId,
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    question: input.question,
    answerPack,
    createdAt: now
  })

  const runtimeState = getPersonAgentRuntimeState(db, {
    personAgentId: personAgent.personAgentId
  })
  const isNewSession = !existingSession

  upsertPersonAgentRuntimeState(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    activeSessionId: session.sessionId,
    sessionCount: isNewSession ? (runtimeState?.sessionCount ?? 0) + 1 : (runtimeState?.sessionCount ?? 1),
    totalTurnCount: (runtimeState?.totalTurnCount ?? 0) + 1,
    latestQuestion: input.question,
    latestQuestionClassification: answerPack.questionClassification,
    lastAnswerDigest: summarizeAnswerDigest(answerPack.candidateAnswer),
    lastConsultedAt: now,
    updatedAt: now
  })

  return turn
}

export function getPersonAgentConsultationRuntimeState(
  db: ArchiveDatabase,
  input: { canonicalPersonId: string }
): PersonAgentRuntimeStateRecord | null {
  return getPersonAgentRuntimeState(db, {
    canonicalPersonId: input.canonicalPersonId
  })
}
