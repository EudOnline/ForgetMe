import type {
  MemoryWorkspaceContextCard,
  MemoryWorkspacePersonAgentContext,
  MemoryWorkspaceScope,
  PersonAgentAnswerPack
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { listPersonAgents } from './governancePersistenceService'
import { buildPersonAgentCapsuleRuntimePromptArtifacts } from './personAgentCapsulePromptBundleService'
import { createCard } from './memoryWorkspaceResponseHelperService'
import { buildPersonAgentAnswerPack } from './personAgentAnswerPackService'

type ActivePersonAgentIdentityRow = {
  canonicalPersonId: string
  displayName: string
}

type AliasRow = {
  canonicalPersonId: string
  displayName: string
}

type ActivePersonAgentIdentity = {
  personAgentId: string
  canonicalPersonId: string
  displayName: string
  matchNames: string[]
}

export type PersonAgentRouteDecoration = {
  injectedContextCards: MemoryWorkspaceContextCard[]
  communicationEvidenceScope?: Extract<MemoryWorkspaceScope, { kind: 'person' }>
  personAgentContext: MemoryWorkspacePersonAgentContext
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function dedupeNames(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function listActivePersonAgentIdentities(db: ArchiveDatabase): ActivePersonAgentIdentity[] {
  const activeAgents = listPersonAgents(db, { status: 'active' })
  if (activeAgents.length === 0) {
    return []
  }

  const canonicalPersonIds = activeAgents.map((agent) => agent.canonicalPersonId)
  const placeholders = canonicalPersonIds.map(() => '?').join(', ')

  const identityRows = db.prepare(
    `select
      id as canonicalPersonId,
      primary_display_name as displayName
     from canonical_people
     where id in (${placeholders})`
  ).all(...canonicalPersonIds) as ActivePersonAgentIdentityRow[]

  const aliasRows = db.prepare(
    `select
      canonical_person_id as canonicalPersonId,
      display_name as displayName
     from person_aliases
     where canonical_person_id in (${placeholders})`
  ).all(...canonicalPersonIds) as AliasRow[]

  return activeAgents.map((agent) => {
    const identityRow = identityRows.find((row) => row.canonicalPersonId === agent.canonicalPersonId)
    const aliases = aliasRows
      .filter((row) => row.canonicalPersonId === agent.canonicalPersonId)
      .map((row) => row.displayName)

    return {
      personAgentId: agent.personAgentId,
      canonicalPersonId: agent.canonicalPersonId,
      displayName: identityRow?.displayName ?? agent.canonicalPersonId,
      matchNames: dedupeNames([
        identityRow?.displayName ?? agent.canonicalPersonId,
        ...aliases
      ])
    }
  })
}

function matchesQuestion(question: string, candidate: ActivePersonAgentIdentity) {
  const normalizedQuestion = normalizeText(question)
  return candidate.matchNames.some((matchName) => normalizedQuestion.includes(matchName))
}

function buildSummaryCard(answerPack: PersonAgentAnswerPack) {
  const hasStableSupportingAnswer = answerPack.supportingFacts.length > 0
    || (
      answerPack.questionClassification === 'quote_request'
      && answerPack.supportingCitations.length > 0
    )

  return createCard({
    cardId: `person-agent-summary:${answerPack.personAgentId}`,
    title: 'Summary',
    body: answerPack.candidateAnswer,
    displayType: hasStableSupportingAnswer
      ? answerPack.supportingFacts.length > 0
        ? 'approved_fact'
        : 'derived_summary'
      : 'coverage_gap',
    citations: answerPack.supportingCitations
  })
}

function buildTimelineCard(answerPack: PersonAgentAnswerPack) {
  const timelineFacts = answerPack.supportingFacts.filter((fact) => fact.memoryKind === 'timeline')
  if (timelineFacts.length === 0) {
    return null
  }

  return createCard({
    cardId: `person-agent-timeline:${answerPack.personAgentId}`,
    title: 'Timeline Windows',
    body: timelineFacts.map((fact) => fact.value).join(' · '),
    displayType: 'approved_fact',
    citations: answerPack.supportingCitations
  })
}

function buildConflictCoverageCard(answerPack: PersonAgentAnswerPack) {
  if (answerPack.conflicts.length === 0 && answerPack.coverageGaps.length === 0) {
    return null
  }

  const bodyParts = [
    answerPack.conflicts.length > 0
      ? `Conflicts: ${answerPack.conflicts.map((conflict) => `${conflict.fieldKey} (${conflict.summary})`).join('; ')}.`
      : '',
    answerPack.coverageGaps.length > 0
      ? `Coverage gaps: ${answerPack.coverageGaps.map((gap) => `${gap.gapKey} (${gap.summary})`).join('; ')}.`
      : ''
  ].filter(Boolean)

  return createCard({
    cardId: `person-agent-conflicts:${answerPack.personAgentId}`,
    title: 'Conflicts & Gaps',
    body: bodyParts.join(' '),
    displayType: answerPack.conflicts.length > 0 ? 'open_conflict' : 'coverage_gap'
  })
}

function buildRecentInteractionCard(answerPack: PersonAgentAnswerPack) {
  if (answerPack.recentInteractionTopics.length === 0) {
    return null
  }

  return createCard({
    cardId: `person-agent-interactions:${answerPack.personAgentId}`,
    title: 'Recent Interaction',
    body: answerPack.recentInteractionTopics
      .map((topic) => `${topic.topicLabel}: ${topic.summary}`)
      .join(' '),
    displayType: 'derived_summary'
  })
}

function buildInjectedContextCards(answerPack: PersonAgentAnswerPack) {
  return [
    buildSummaryCard(answerPack),
    buildTimelineCard(answerPack),
    buildConflictCoverageCard(answerPack),
    buildRecentInteractionCard(answerPack)
  ].filter((card): card is MemoryWorkspaceContextCard => Boolean(card))
}

function buildConsultedContext(
  answerPack: PersonAgentAnswerPack,
  reason: 'scope_person' | 'global_resolved_person'
): PersonAgentRouteDecoration {
  return {
    injectedContextCards: buildInjectedContextCards(answerPack),
    communicationEvidenceScope: {
      kind: 'person',
      canonicalPersonId: answerPack.canonicalPersonId
    },
    personAgentContext: {
      consultedAgents: [{
        personAgentId: answerPack.personAgentId,
        canonicalPersonId: answerPack.canonicalPersonId,
        reason
      }],
      strategyProfile: answerPack.strategyProfile ?? null,
      archiveRouting: {
        strategy: 'person_agent',
        reason: 'agent_consulted'
      },
      activeCanonicalPersonId: answerPack.canonicalPersonId,
      usedAnswerPack: true
    }
  }
}

function buildPersonFallbackContext(canonicalPersonId: string): PersonAgentRouteDecoration {
  return {
    injectedContextCards: [],
    personAgentContext: {
      consultedAgents: [],
      archiveRouting: {
        strategy: 'archive_fallback',
        reason: 'no_active_person_agent'
      },
      activeCanonicalPersonId: canonicalPersonId,
      usedAnswerPack: false
    }
  }
}

function buildGlobalUnresolvedContext(): PersonAgentRouteDecoration {
  return {
    injectedContextCards: [],
    personAgentContext: {
      consultedAgents: [],
      archiveRouting: {
        strategy: 'archive_fallback',
        reason: 'unresolved_target_person'
      },
      activeCanonicalPersonId: null,
      usedAnswerPack: false
    }
  }
}

function resolveGlobalPersonAgent(db: ArchiveDatabase, question: string) {
  const matchedAgents = listActivePersonAgentIdentities(db).filter((candidate) => matchesQuestion(question, candidate))

  if (matchedAgents.length === 0) {
    return null
  }

  if (matchedAgents.length > 1) {
    return buildGlobalUnresolvedContext()
  }

  const matchedAgent = matchedAgents[0]!
  const promptArtifacts = buildPersonAgentCapsuleRuntimePromptArtifacts(db, {
    canonicalPersonId: matchedAgent.canonicalPersonId,
    operationKind: 'consultation',
    promptInput: question
  })
  const answerPack = buildPersonAgentAnswerPack(db, {
    canonicalPersonId: matchedAgent.canonicalPersonId,
    question,
    capsulePromptBundle: promptArtifacts.promptBundle,
    capsuleRuntimeContext: promptArtifacts.runtimeContext
  })

  return answerPack
    ? buildConsultedContext(answerPack, 'global_resolved_person')
    : null
}

export function resolvePersonAgentRoute(
  db: ArchiveDatabase,
  input: {
    scope: MemoryWorkspaceScope
    question: string
  }
): PersonAgentRouteDecoration | null {
  if (input.scope.kind === 'person') {
    const promptArtifacts = buildPersonAgentCapsuleRuntimePromptArtifacts(db, {
      canonicalPersonId: input.scope.canonicalPersonId,
      operationKind: 'consultation',
      promptInput: input.question
    })
    const answerPack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: input.scope.canonicalPersonId,
      question: input.question,
      capsulePromptBundle: promptArtifacts.promptBundle,
      capsuleRuntimeContext: promptArtifacts.runtimeContext
    })

    return answerPack
      ? buildConsultedContext(answerPack, 'scope_person')
      : buildPersonFallbackContext(input.scope.canonicalPersonId)
  }

  if (input.scope.kind === 'global') {
    return resolveGlobalPersonAgent(db, input.question)
  }

  return null
}
