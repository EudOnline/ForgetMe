import type {
  PersonAgentConsultationSessionDetail,
  PersonAgentConsultationSessionSummary,
  PersonAgentConsultationTurnRecord,
  PersonAgentRuntimeStateRecord
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentConsultationSession as getPersistedConsultationSession,
  getPersonAgentRuntimeState,
  listPersonAgentConsultationSessions as listPersistedConsultationSessions
} from './governancePersistenceService'
import { runPersonAgentRuntime } from './personAgentRuntimeService'

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
  const result = runPersonAgentRuntime(db, {
    operationKind: 'consultation',
    canonicalPersonId: input.canonicalPersonId,
    question: input.question,
    sessionId: input.sessionId,
    now: input.now
  })

  return result.resultKind === 'consultation_turn' ? result.consultationTurn : null
}

export function getPersonAgentConsultationRuntimeState(
  db: ArchiveDatabase,
  input: { canonicalPersonId: string }
): PersonAgentRuntimeStateRecord | null {
  return getPersonAgentRuntimeState(db, {
    canonicalPersonId: input.canonicalPersonId
  })
}
