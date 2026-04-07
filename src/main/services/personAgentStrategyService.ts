import type {
  PersonAgentInteractionMemoryRecord,
  PersonAgentStrategyProfile,
  PersonDossier
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { listPersonAgentInteractionMemories } from './governancePersistenceService'

const PERSON_AGENT_STRATEGY_PROFILE_VERSION = 1

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

  const placeholders = anchorRows.map(() => '?').join(', ')
  const row = db.prepare(
    `select count(distinct file_id) as count
     from communication_evidence
     where speaker_anchor_person_id in (${placeholders})`
  ).get(...anchorRows.map((row) => row.anchorPersonId)) as { count: number } | undefined

  return row?.count ?? 0
}

function totalQuestionCount(records: PersonAgentInteractionMemoryRecord[]) {
  return records.reduce((count, record) => count + record.questionCount, 0)
}

export function createDefaultPersonAgentStrategyProfile(): PersonAgentStrategyProfile {
  return {
    profileVersion: PERSON_AGENT_STRATEGY_PROFILE_VERSION,
    responseStyle: 'concise',
    evidencePreference: 'balanced',
    conflictBehavior: 'balanced'
  }
}

export function derivePersonAgentStrategyProfile(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  dossier: PersonDossier
}) {
  const interactionMemories = listPersonAgentInteractionMemories(db, {
    personAgentId: input.personAgentId
  })
  const communicationFileCount = countCommunicationLinkedFileCount(db, input.canonicalPersonId)
  const hasQuoteHistory = interactionMemories.some((record) => record.memoryKey === 'topic.past_expressions')
  const hasContextualHistory = totalQuestionCount(interactionMemories) >= 2
    || interactionMemories.some((record) => record.memoryKey === 'topic.advice_request')

  return {
    profileVersion: PERSON_AGENT_STRATEGY_PROFILE_VERSION,
    responseStyle: hasContextualHistory ? 'contextual' : 'concise',
    evidencePreference: hasQuoteHistory || communicationFileCount >= 2 ? 'quote_first' : 'balanced',
    conflictBehavior: input.dossier.conflictSummary.length > 0 ? 'conflict_forward' : 'balanced'
  } satisfies PersonAgentStrategyProfile
}
