import type {
  MemoryWorkspaceCitation,
  PersonAgentAnswerPack,
  PersonAgentFactMemoryRecord,
  PersonAgentInteractionMemoryRecord,
  PersonAgentMemoryRef,
  PersonAgentStrategyProfile
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentInteractionMemories
} from './governancePersistenceService'
import { getPersonAgentFactMemorySummary } from './personAgentFactMemoryService'
import { listPersonAgentCommunicationEvidence } from './communicationEvidenceService'
import {
  classifyPersonAgentQuestion,
  createCitation
} from './memoryWorkspaceResponseHelperService'
import { buildPersonAgentCapsuleRuntimePromptArtifacts } from './personAgentCapsulePromptBundleService'
import { createDefaultPersonAgentStrategyProfile } from './personAgentStrategyService'

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase()
}

function wordsForMatch(question: string) {
  return normalizeQuestion(question)
    .replace(/[，。！？、,.!?;:()[\]{}"'“”‘’/\\_-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

function scoreFactForQuestion(question: string, fact: PersonAgentFactMemoryRecord) {
  const normalizedQuestion = normalizeQuestion(question)
  let score = 0

  if (normalizedQuestion.includes(normalizeQuestion(fact.displayLabel))) {
    score += 8
  }
  if (normalizedQuestion.includes(normalizeQuestion(fact.memoryKey.split('.').pop() ?? ''))) {
    score += 6
  }
  if (normalizedQuestion.includes(normalizeQuestion(fact.summaryValue))) {
    score += 4
  }

  if (fact.memoryKind === 'fact') {
    score += 2
  }

  return score
}

function refsToCitations(sourceRefs: PersonAgentMemoryRef[], cardId: string) {
  return sourceRefs.flatMap((ref, index): MemoryWorkspaceCitation[] => {
    if (ref.kind === 'file') {
      return [createCitation(cardId, index, 'file', ref.id, ref.label)]
    }
    if (ref.kind === 'journal') {
      return [createCitation(cardId, index, 'journal', ref.id, ref.label)]
    }
    if (ref.kind === 'review') {
      return [createCitation(cardId, index, 'review', ref.id, ref.label)]
    }
    return []
  })
}

function dedupeCitations(citations: MemoryWorkspaceCitation[]) {
  const seen = new Set<string>()
  const deduped: MemoryWorkspaceCitation[] = []

  for (const citation of citations) {
    const key = `${citation.kind}:${citation.targetId}:${citation.label}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(citation)
  }

  return deduped
}

function rankFactsForClassification(input: {
  question: string
  facts: PersonAgentFactMemoryRecord[]
  classification: PersonAgentAnswerPack['questionClassification']
}) {
  const filtered = input.facts.filter((fact) => {
    if (input.classification === 'relationship') {
      return fact.memoryKind === 'relationship'
    }
    if (input.classification === 'recent_timeline') {
      return fact.memoryKind === 'timeline'
    }
    if (input.classification === 'profile_fact') {
      return fact.memoryKind === 'fact'
    }
    return fact.memoryKind === 'fact' || fact.memoryKind === 'relationship' || fact.memoryKind === 'timeline'
  })

  return [...filtered]
    .map((fact) => ({
      fact,
      score: scoreFactForQuestion(input.question, fact)
    }))
    .sort((left, right) => right.score - left.score || left.fact.memoryKey.localeCompare(right.fact.memoryKey))
    .map((entry) => entry.fact)
}

function buildFactAnswer(classification: PersonAgentAnswerPack['questionClassification'], supportingFacts: PersonAgentAnswerPack['supportingFacts']) {
  if (supportingFacts.length === 0) {
    return null
  }

  if (classification === 'relationship') {
    return `${supportingFacts[0]?.label} is currently summarized as ${supportingFacts[0]?.value}.`
  }

  if (classification === 'recent_timeline') {
    return `${supportingFacts[0]?.value}.`
  }

  return `${supportingFacts[0]?.label}: ${supportingFacts[0]?.value}.`
}

function scoreInteractionTopic(
  classification: PersonAgentAnswerPack['questionClassification'],
  record: PersonAgentInteractionMemoryRecord
) {
  if (classification === 'quote_request' && record.memoryKey === 'topic.past_expressions') {
    return 100
  }
  if (classification === 'relationship' && record.memoryKey === 'topic.relationship_context') {
    return 100
  }
  if (classification === 'recent_timeline' && record.memoryKey === 'topic.recent_timeline') {
    return 100
  }
  if ((classification === 'profile_fact' || classification === 'general') && record.memoryKey === 'topic.profile_facts') {
    return 100
  }
  if ((classification === 'advice' || classification === 'relationship') && record.memoryKey === 'topic.conflict_resolution') {
    return 60
  }

  return 0
}

function buildRecentInteractionTopics(
  strategyProfile: PersonAgentStrategyProfile,
  classification: PersonAgentAnswerPack['questionClassification'],
  records: PersonAgentInteractionMemoryRecord[]
) {
  return [...records]
    .sort((left, right) =>
      scoreInteractionTopic(classification, right) - scoreInteractionTopic(classification, left)
      || right.questionCount - left.questionCount
      || left.memoryKey.localeCompare(right.memoryKey)
    )
    .slice(0, strategyProfile.responseStyle === 'contextual' ? 3 : 2)
    .map((record) => ({
      topicLabel: record.topicLabel,
      summary: record.summary,
      questionCount: record.questionCount
    }))
}

export function buildPersonAgentAnswerPack(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  question: string
  capsulePromptBundle?: PersonAgentAnswerPack['capsulePromptBundle']
  capsuleRuntimeContext?: PersonAgentAnswerPack['capsuleRuntimeContext']
}): PersonAgentAnswerPack | null {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  if (!personAgent || personAgent.status !== 'active') {
    return null
  }

  const factSummary = getPersonAgentFactMemorySummary(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  if (!factSummary) {
    return null
  }

  const classification = classifyPersonAgentQuestion(input.question)
  const interactionMemories = listPersonAgentInteractionMemories(db, {
    personAgentId: personAgent.personAgentId
  })
  const strategyProfile = personAgent.strategyProfile ?? createDefaultPersonAgentStrategyProfile()
  const conflicts = factSummary.conflicts.map((record) => ({
    fieldKey: record.memoryKey.replace(/^conflict\./, ''),
    summary: record.summaryValue
  }))
  const coverageGaps = factSummary.coverageGaps.map((record) => ({
    gapKey: record.memoryKey.replace(/^coverage\./, ''),
    summary: record.summaryValue
  }))
  const runtimePromptArtifacts = input.capsulePromptBundle !== undefined || input.capsuleRuntimeContext !== undefined
    ? {
        runtimeContext: input.capsuleRuntimeContext ?? null,
        promptBundle: input.capsulePromptBundle ?? null
      }
    : buildPersonAgentCapsuleRuntimePromptArtifacts(db, {
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: input.canonicalPersonId,
        operationKind: 'consultation',
        promptInput: input.question
      })
  const capsuleRuntimeContext = runtimePromptArtifacts.runtimeContext
  const capsulePromptBundle = runtimePromptArtifacts.promptBundle

  let candidateAnswer = ''
  let supportingFacts: PersonAgentAnswerPack['supportingFacts'] = []
  let supportingCitations: MemoryWorkspaceCitation[] = []
  let generationReason = ''

  if (classification === 'quote_request') {
    const excerpts = listPersonAgentCommunicationEvidence(db, {
      canonicalPersonId: input.canonicalPersonId,
      question: input.question,
      limit: strategyProfile.evidencePreference === 'quote_first' ? 3 : 2
    })

    if (excerpts.length > 0) {
      candidateAnswer = `Direct excerpts are available for this quote request: ${excerpts.map((excerpt) => `${excerpt.speakerDisplayName ?? 'Unknown'}: ${excerpt.text}`).join(' ')}`
      supportingCitations = dedupeCitations(
        excerpts.map((excerpt, index) =>
          createCitation('person-agent-answer-pack', index, 'file', excerpt.fileId, excerpt.fileName)
        )
      )
      generationReason = 'Resolved through communication evidence for a quote request.'
      if (strategyProfile.evidencePreference === 'quote_first') {
        generationReason = `${generationReason} Applied quote-first strategy.`
      }
    } else {
      candidateAnswer = `Current approved chat evidence is insufficient to answer “${input.question}” with direct excerpts.`
      supportingCitations = []
      generationReason = 'Communication evidence was insufficient for this quote request.'
      coverageGaps.unshift({
        gapKey: 'communication.quote_evidence',
        summary: 'No matching direct communication excerpts were found.'
      })
    }
  } else {
    const rankedFacts = rankFactsForClassification({
      question: input.question,
      facts: [
        ...factSummary.facts,
        ...factSummary.relationships,
        ...factSummary.timeline
      ],
      classification
    }).slice(0, 2)

    supportingFacts = rankedFacts.map((record) => ({
      memoryKey: record.memoryKey,
      label: record.displayLabel,
      value: record.summaryValue,
      memoryKind: record.memoryKind
    }))
    supportingCitations = dedupeCitations(
      rankedFacts.flatMap((record, index) => refsToCitations(record.sourceRefs, `person-agent-answer-pack-${index}`))
    )
    candidateAnswer = buildFactAnswer(classification, supportingFacts)
      ?? `Current person-agent memory does not yet contain a stable answer for “${input.question}”.`
    generationReason = supportingFacts.length > 0
      ? 'Resolved through active person-agent fact memory.'
      : 'No stable fact-memory match was available for this question.'

    if (
      strategyProfile.conflictBehavior === 'conflict_forward'
      && conflicts.length > 0
      && (classification === 'general' || classification === 'profile_fact')
    ) {
      candidateAnswer = `${candidateAnswer} Open conflicts remain on ${conflicts.slice(0, 2).map((conflict) => conflict.fieldKey).join(', ')}.`
      generationReason = `${generationReason} Applied conflict-forward strategy.`
    }
  }

  return {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    strategyProfile,
    question: input.question,
    questionClassification: classification,
    candidateAnswer,
    supportingFacts,
    supportingCitations,
    conflicts,
    coverageGaps,
    recentInteractionTopics: buildRecentInteractionTopics(strategyProfile, classification, interactionMemories),
    generationReason,
    memoryVersions: {
      factsVersion: personAgent.factsVersion,
      interactionVersion: personAgent.interactionVersion
    },
    capsulePromptBundle,
    capsuleRuntimeContext
  }
}
