import type {
  PersonAgentInteractionMemoryRecord,
  PersonAgentStrategyProfile,
  PersonDossier
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { listPersonAgentInteractionMemories } from './governancePersistenceService'

const PERSON_AGENT_STRATEGY_PROFILE_VERSION = 1

type PersonAgentStrategyTraits = Omit<PersonAgentStrategyProfile, 'profileVersion'>

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

function extractStrategyTraits(profile: PersonAgentStrategyProfile | null | undefined): PersonAgentStrategyTraits | null {
  if (!profile) {
    return null
  }

  return {
    responseStyle: profile.responseStyle,
    evidencePreference: profile.evidencePreference,
    conflictBehavior: profile.conflictBehavior
  }
}

function sameStrategyTraits(
  left: PersonAgentStrategyProfile | null | undefined,
  right: PersonAgentStrategyProfile | null | undefined
) {
  const leftTraits = extractStrategyTraits(left)
  const rightTraits = extractStrategyTraits(right)

  return JSON.stringify(leftTraits) === JSON.stringify(rightTraits)
}

function listChangedStrategyFields(
  previousProfile: PersonAgentStrategyProfile,
  nextTraits: PersonAgentStrategyTraits
) {
  const changedFields = [] as Array<keyof PersonAgentStrategyTraits>

  if (previousProfile.responseStyle !== nextTraits.responseStyle) {
    changedFields.push('responseStyle')
  }
  if (previousProfile.evidencePreference !== nextTraits.evidencePreference) {
    changedFields.push('evidencePreference')
  }
  if (previousProfile.conflictBehavior !== nextTraits.conflictBehavior) {
    changedFields.push('conflictBehavior')
  }

  return changedFields
}

function createStrategyProfile(
  traits: PersonAgentStrategyTraits,
  profileVersion: number = PERSON_AGENT_STRATEGY_PROFILE_VERSION
): PersonAgentStrategyProfile {
  return {
    profileVersion,
    ...traits
  }
}

export function createDefaultPersonAgentStrategyProfile(): PersonAgentStrategyProfile {
  return createStrategyProfile({
    responseStyle: 'concise',
    evidencePreference: 'balanced',
    conflictBehavior: 'balanced'
  })
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

  return createStrategyProfile({
    responseStyle: hasContextualHistory ? 'contextual' : 'concise',
    evidencePreference: hasQuoteHistory || communicationFileCount >= 2 ? 'quote_first' : 'balanced',
    conflictBehavior: input.dossier.conflictSummary.length > 0 ? 'conflict_forward' : 'balanced'
  }) satisfies PersonAgentStrategyProfile
}

export function resolveNextPersonAgentStrategyProfile(input: {
  existingProfile?: PersonAgentStrategyProfile | null
  derivedProfile: PersonAgentStrategyProfile
}) {
  const existingProfile = input.existingProfile ?? null

  if (!existingProfile) {
    return {
      changed: false,
      changedFields: [] as Array<keyof PersonAgentStrategyTraits>,
      previousProfile: null,
      nextProfile: createStrategyProfile(
        extractStrategyTraits(input.derivedProfile) ?? extractStrategyTraits(createDefaultPersonAgentStrategyProfile())!
      )
    }
  }

  if (sameStrategyTraits(existingProfile, input.derivedProfile)) {
    return {
      changed: false,
      changedFields: [] as Array<keyof PersonAgentStrategyTraits>,
      previousProfile: existingProfile,
      nextProfile: existingProfile
    }
  }

  const nextTraits = extractStrategyTraits(input.derivedProfile) ?? extractStrategyTraits(createDefaultPersonAgentStrategyProfile())!

  return {
    changed: true,
    changedFields: listChangedStrategyFields(existingProfile, nextTraits),
    previousProfile: existingProfile,
    nextProfile: createStrategyProfile(nextTraits, existingProfile.profileVersion + 1)
  }
}
