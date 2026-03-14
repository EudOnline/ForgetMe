import type {
  AskMemoryWorkspaceInput,
  DossierDisplayType,
  MemoryWorkspaceAnswer,
  MemoryWorkspaceCitation,
  MemoryWorkspaceContextCard,
  MemoryWorkspaceGuardrail,
  MemoryWorkspaceGuardrailDecision,
  MemoryWorkspaceGuardrailReasonCode,
  MemoryWorkspaceResponse,
  PersonDossierEvidenceRef
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getGroupPortrait, listGroupPortraits } from './groupPortraitService'
import { listDecisionJournal } from './journalService'
import { getPersonDossier } from './personDossierService'
import { listReviewConflictGroups, listReviewWorkbenchItems } from './reviewWorkbenchReadService'
import { getPeopleList } from './timelineService'

const CONFLICT_KEYWORDS = ['冲突', 'conflict', '不确定', 'ambigu', 'gap', '矛盾']
const RECENT_KEYWORDS = ['最近', 'timeline', '时间', '发生', 'recent', 'latest']
const PRIORITY_KEYWORDS = ['优先', '关注', 'pending', 'review', 'pressure', '值得']
const PERSONA_REQUEST_KEYWORDS = ['像她本人', '像他本人', '像本人', '模仿', '口吻', '语气', '会怎么说', '会怎么建议', 'voice', 'style']

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase()
}

function hasKeyword(question: string, keywords: string[]) {
  const normalizedQuestion = normalizeQuestion(question)
  return keywords.some((keyword) => normalizedQuestion.includes(keyword))
}

function createCitation(
  cardId: string,
  index: number,
  kind: MemoryWorkspaceCitation['kind'],
  targetId: string,
  label: string
): MemoryWorkspaceCitation {
  return {
    citationId: `${cardId}:${kind}:${targetId}:${index}`,
    kind,
    targetId,
    label
  }
}

function dedupeCitations(citations: MemoryWorkspaceCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.kind}:${citation.targetId}:${citation.label}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function createCard(input: {
  cardId: string
  title: string
  body: string
  displayType: DossierDisplayType
  citations?: MemoryWorkspaceCitation[]
}): MemoryWorkspaceContextCard {
  return {
    cardId: input.cardId,
    title: input.title,
    body: input.body,
    displayType: input.displayType,
    citations: dedupeCitations(input.citations ?? [])
  }
}

function createAnswerFromCard(card: MemoryWorkspaceContextCard): MemoryWorkspaceAnswer {
  return {
    summary: card.body,
    displayType: card.displayType,
    citations: card.citations
  }
}

function createCoverageAnswer(question: string): MemoryWorkspaceAnswer {
  return {
    summary: `Current evidence is insufficient to answer “${question}” confidently from the approved archive reads.`,
    displayType: 'coverage_gap',
    citations: []
  }
}

function createPersonaFallbackAnswer(
  cards: MemoryWorkspaceContextCard[],
  question: string
): MemoryWorkspaceAnswer {
  const fallbackCard = cards.find((card) => card.title === 'Summary' || card.title === 'People Overview') ?? cards[0] ?? null
  const groundedSummary = fallbackCard ? ` Grounded archive summary: ${fallbackCard.body}` : ''

  return {
    summary: `This memory workspace cannot answer as if it were the archived person or imitate their voice/advice for “${question}”. It can only summarize grounded archive material.${groundedSummary}`,
    displayType: 'coverage_gap',
    citations: fallbackCard?.citations ?? []
  }
}

function toMemoryCitationFromEvidenceRef(
  cardId: string,
  index: number,
  ref: PersonDossierEvidenceRef
): MemoryWorkspaceCitation | null {
  if (ref.kind === 'file') {
    return createCitation(cardId, index, 'file', ref.id, ref.label)
  }

  if (ref.kind === 'journal') {
    return createCitation(cardId, index, 'journal', ref.id, ref.label)
  }

  return null
}

function pickAnswerCard(question: string, cards: MemoryWorkspaceContextCard[]) {
  const conflictsCard = cards.find((card) => card.title === 'Conflicts & Gaps' || card.title === 'Review Pressure' || card.title === 'Ambiguity')
  const timelineCard = cards.find((card) => card.title === 'Timeline Windows')
  const summaryCard = cards.find((card) => card.title === 'Summary' || card.title === 'People Overview')

  if (hasKeyword(question, PRIORITY_KEYWORDS) && conflictsCard) {
    return conflictsCard
  }

  if (hasKeyword(question, CONFLICT_KEYWORDS) && conflictsCard) {
    return conflictsCard
  }

  if (hasKeyword(question, RECENT_KEYWORDS) && timelineCard) {
    return timelineCard
  }

  return summaryCard ?? conflictsCard ?? timelineCard ?? cards[0] ?? null
}

function collectResponseCitations(
  answer: MemoryWorkspaceAnswer,
  contextCards: MemoryWorkspaceContextCard[]
) {
  return dedupeCitations([
    ...answer.citations,
    ...contextCards.flatMap((card) => card.citations)
  ])
}

function uniqueSourceKinds(citations: MemoryWorkspaceCitation[]) {
  const seen = new Set<MemoryWorkspaceCitation['kind']>()
  const kinds: MemoryWorkspaceCitation['kind'][] = []

  for (const citation of citations) {
    if (!seen.has(citation.kind)) {
      seen.add(citation.kind)
      kinds.push(citation.kind)
    }
  }

  return kinds
}

function dedupeReasonCodes(reasonCodes: MemoryWorkspaceGuardrailReasonCode[]) {
  return [...new Set(reasonCodes)]
}

function buildGuardrail(input: {
  question: string
  answer: MemoryWorkspaceAnswer
  contextCards: MemoryWorkspaceContextCard[]
}): MemoryWorkspaceGuardrail {
  const citations = collectResponseCitations(input.answer, input.contextCards)
  const reasonCodes: MemoryWorkspaceGuardrailReasonCode[] = []
  const hasPersonaRequest = hasKeyword(input.question, PERSONA_REQUEST_KEYWORDS)
  const hasConflict = input.answer.displayType === 'open_conflict'
    || input.contextCards.some((card) => card.displayType === 'open_conflict')
  const answerIsConflict = input.answer.displayType === 'open_conflict'
  const hasCoverageGap = input.answer.displayType === 'coverage_gap'
    || input.contextCards.some((card) => card.displayType === 'coverage_gap')
  const hasReviewPressure = input.contextCards.some((card) => card.title === 'Review Pressure' && card.displayType === 'open_conflict')

  if (hasPersonaRequest) {
    reasonCodes.push('persona_request')
  }
  if (hasConflict) {
    reasonCodes.push('open_conflict_present')
  }
  if (hasCoverageGap) {
    reasonCodes.push('coverage_gap_present')
  }
  if (citations.length === 0) {
    reasonCodes.push('insufficient_citations')
  }
  if (citations.length > 1) {
    reasonCodes.push('multi_source_synthesis')
  }
  if (hasReviewPressure) {
    reasonCodes.push('review_pressure_present')
  }

  let decision: MemoryWorkspaceGuardrailDecision = 'grounded_answer'
  if (hasPersonaRequest) {
    decision = 'fallback_unsupported_request'
  } else if (answerIsConflict) {
    decision = 'fallback_to_conflict'
  } else if (hasCoverageGap || citations.length === 0) {
    decision = 'fallback_insufficient_evidence'
  }

  return {
    decision,
    reasonCodes: dedupeReasonCodes(reasonCodes),
    citationCount: citations.length,
    sourceKinds: uniqueSourceKinds(citations),
    fallbackApplied: decision !== 'grounded_answer'
  }
}

function createResponse(input: {
  scope: MemoryWorkspaceResponse['scope']
  question: string
  title: string
  contextCards: MemoryWorkspaceContextCard[]
}) {
  const selectedCard = pickAnswerCard(input.question, input.contextCards)
  const answer = hasKeyword(input.question, PERSONA_REQUEST_KEYWORDS)
    ? createPersonaFallbackAnswer(input.contextCards, input.question)
    : selectedCard
      ? createAnswerFromCard(selectedCard)
      : createCoverageAnswer(input.question)

  return {
    scope: input.scope,
    question: input.question,
    title: input.title,
    answer,
    contextCards: input.contextCards,
    guardrail: buildGuardrail({
      question: input.question,
      answer,
      contextCards: input.contextCards
    })
  } satisfies MemoryWorkspaceResponse
}

function buildPersonSummaryCard(db: ArchiveDatabase, canonicalPersonId: string) {
  const dossier = getPersonDossier(db, { canonicalPersonId })
  if (!dossier) {
    return null
  }

  const firstApprovedFacts = dossier.thematicSections
    .flatMap((section) => section.items)
    .filter((item) => item.displayType === 'approved_fact')
    .slice(0, 3)

  const factSummary = firstApprovedFacts.length > 0
    ? `Approved facts include ${firstApprovedFacts.map((item) => `${item.label}: ${item.value}`).join('; ')}.`
    : 'No approved profile facts have been promoted yet.'

  const summaryCitations = [
    createCitation('person-summary', 0, 'person', canonicalPersonId, dossier.identityCard.primaryDisplayName),
    ...firstApprovedFacts
      .flatMap((item, index) =>
        item.evidenceRefs
          .map((ref, refIndex) => toMemoryCitationFromEvidenceRef('person-summary', index + refIndex + 1, ref))
          .filter((citation): citation is MemoryWorkspaceCitation => Boolean(citation))
      )
  ]

  return createCard({
    cardId: 'person-summary',
    title: 'Summary',
    body: `${dossier.identityCard.primaryDisplayName} has ${dossier.identityCard.evidenceCount} linked evidence sources. ${factSummary}`,
    displayType: firstApprovedFacts.length > 0 ? 'derived_summary' : 'coverage_gap',
    citations: summaryCitations
  })
}

function buildPersonTimelineCard(db: ArchiveDatabase, canonicalPersonId: string) {
  const dossier = getPersonDossier(db, { canonicalPersonId })
  if (!dossier) {
    return null
  }

  if (dossier.timelineHighlights.length === 0) {
    return createCard({
      cardId: 'person-timeline',
      title: 'Timeline Windows',
      body: 'No approved timeline highlights are currently available for this person.',
      displayType: 'coverage_gap'
    })
  }

  const citations = dossier.timelineHighlights
    .slice(0, 3)
    .flatMap((highlight, index) =>
      highlight.evidenceRefs
        .map((ref, refIndex) => toMemoryCitationFromEvidenceRef('person-timeline', index + refIndex, ref))
        .filter((citation): citation is MemoryWorkspaceCitation => Boolean(citation))
    )

  return createCard({
    cardId: 'person-timeline',
    title: 'Timeline Windows',
    body: dossier.timelineHighlights
      .slice(0, 3)
      .map((highlight) => `${highlight.title} (${highlight.timeStart} → ${highlight.timeEnd})`)
      .join(' · '),
    displayType: dossier.timelineHighlights[0]?.displayType ?? 'approved_fact',
    citations
  })
}

function buildPersonConflictCard(db: ArchiveDatabase, canonicalPersonId: string) {
  const dossier = getPersonDossier(db, { canonicalPersonId })
  if (!dossier) {
    return null
  }

  const conflictText = dossier.conflictSummary.length > 0
    ? `Open conflicts: ${dossier.conflictSummary
      .map((conflict) => `${conflict.fieldKey ?? 'unknown_field'} (${conflict.pendingCount} pending values: ${conflict.distinctValues.join(' / ')})`)
      .join('; ')}.`
    : 'No open approved-person conflicts are currently tracked.'

  const gapText = dossier.coverageGaps.length > 0
    ? `Coverage gaps: ${dossier.coverageGaps.map((gap) => gap.title).join('; ')}.`
    : ''

  const citations = dossier.reviewShortcuts
    .map((shortcut, index) =>
      createCitation(
        'person-conflicts',
        index,
        'review',
        shortcut.queueItemId ?? `${shortcut.canonicalPersonId}:${shortcut.fieldKey ?? 'review'}`,
        shortcut.label
      )
    )

  return createCard({
    cardId: 'person-conflicts',
    title: 'Conflicts & Gaps',
    body: [conflictText, gapText].filter(Boolean).join(' '),
    displayType: dossier.conflictSummary.length > 0
      ? 'open_conflict'
      : dossier.coverageGaps.length > 0
        ? 'coverage_gap'
        : 'derived_summary',
    citations
  })
}

export function buildPersonContextPack(
  db: ArchiveDatabase,
  canonicalPersonId: string,
  question: string
): MemoryWorkspaceResponse | null {
  const dossier = getPersonDossier(db, { canonicalPersonId })
  if (!dossier) {
    return null
  }

  const contextCards = [
    buildPersonSummaryCard(db, canonicalPersonId),
    buildPersonTimelineCard(db, canonicalPersonId),
    buildPersonConflictCard(db, canonicalPersonId)
  ].filter((card): card is MemoryWorkspaceContextCard => Boolean(card))

  const answerCard = pickAnswerCard(question, contextCards)
  void answerCard

  return createResponse({
    scope: { kind: 'person', canonicalPersonId },
    question,
    title: `Memory Workspace · ${dossier.identityCard.primaryDisplayName}`,
    contextCards
  })
}

function buildGroupSummaryCard(db: ArchiveDatabase, anchorPersonId: string) {
  const portrait = getGroupPortrait(db, { canonicalPersonId: anchorPersonId })
  if (!portrait) {
    return null
  }

  const anchorDisplayName = portrait.members.find((member) => member.isAnchor)?.displayName ?? anchorPersonId

  return createCard({
    cardId: 'group-summary',
    title: 'Summary',
    body: portrait.narrativeSummary.map((item) => item.text).join(' '),
    displayType: portrait.narrativeSummary.some((item) => item.displayType === 'open_conflict')
      ? 'open_conflict'
      : portrait.narrativeSummary[0]?.displayType ?? 'coverage_gap',
    citations: [
      createCitation('group-summary', 0, 'group', anchorPersonId, `${anchorDisplayName} Group Portrait`),
      ...portrait.members.slice(0, 3).map((member, index) => createCitation('group-summary', index + 1, 'person', member.personId, member.displayName))
    ]
  })
}

function buildGroupTimelineCard(db: ArchiveDatabase, anchorPersonId: string) {
  const portrait = getGroupPortrait(db, { canonicalPersonId: anchorPersonId })
  if (!portrait) {
    return null
  }

  if (portrait.timelineWindows.length === 0) {
    return createCard({
      cardId: 'group-timeline',
      title: 'Timeline Windows',
      body: 'No approved shared timeline windows are currently available for this group.',
      displayType: 'coverage_gap'
    })
  }

  const citations = portrait.sharedEvents
    .slice(0, 3)
    .flatMap((event, index) =>
      event.evidenceRefs
        .map((ref, refIndex) => toMemoryCitationFromEvidenceRef('group-timeline', index + refIndex, ref))
        .filter((citation): citation is MemoryWorkspaceCitation => Boolean(citation))
    )

  return createCard({
    cardId: 'group-timeline',
    title: 'Timeline Windows',
    body: portrait.timelineWindows
      .slice(0, 3)
      .map((window) => `${window.title} (${window.timeStart} → ${window.timeEnd}; ${window.eventCount} event)`)
      .join(' · '),
    displayType: portrait.timelineWindows[0]?.displayType ?? 'coverage_gap',
    citations
  })
}

function buildGroupAmbiguityCard(db: ArchiveDatabase, anchorPersonId: string) {
  const portrait = getGroupPortrait(db, { canonicalPersonId: anchorPersonId })
  if (!portrait) {
    return null
  }

  const citations = portrait.ambiguitySummary.reviewShortcut
    ? [
        createCitation(
          'group-ambiguity',
          0,
          'review',
          portrait.ambiguitySummary.reviewShortcut.queueItemId ?? portrait.ambiguitySummary.reviewShortcut.canonicalPersonId,
          portrait.ambiguitySummary.reviewShortcut.label
        )
      ]
    : portrait.replayShortcuts.slice(0, 2).map((shortcut, index) =>
        createCitation('group-ambiguity', index, 'journal', shortcut.journalId, shortcut.label)
      )

  return createCard({
    cardId: 'group-ambiguity',
    title: 'Ambiguity',
    body: `Pending review items: ${portrait.ambiguitySummary.pendingReviewCount}; conflict groups: ${portrait.ambiguitySummary.conflictGroupCount}; affected members: ${portrait.ambiguitySummary.affectedMemberCount}.`,
    displayType: portrait.ambiguitySummary.displayType,
    citations
  })
}

export function buildGroupContextPack(
  db: ArchiveDatabase,
  anchorPersonId: string,
  question: string
): MemoryWorkspaceResponse | null {
  const portrait = getGroupPortrait(db, { canonicalPersonId: anchorPersonId })
  if (!portrait) {
    return null
  }

  const anchorDisplayName = portrait.members.find((member) => member.isAnchor)?.displayName ?? anchorPersonId
  const contextCards = [
    buildGroupSummaryCard(db, anchorPersonId),
    buildGroupTimelineCard(db, anchorPersonId),
    buildGroupAmbiguityCard(db, anchorPersonId)
  ].filter((card): card is MemoryWorkspaceContextCard => Boolean(card))

  return createResponse({
    scope: { kind: 'group', anchorPersonId },
    question,
    title: `Memory Workspace · ${anchorDisplayName} Group`,
    contextCards
  })
}

function buildGlobalPeopleCard(db: ArchiveDatabase) {
  const people = getPeopleList(db)

  return createCard({
    cardId: 'global-people',
    title: 'People Overview',
    body: people.length > 0
      ? `${people.length} approved people: ${people.slice(0, 5).map((person) => person.primaryDisplayName).join(', ')}.`
      : 'No approved people are currently available in the archive.',
    displayType: people.length > 0 ? 'approved_fact' : 'coverage_gap',
    citations: people.slice(0, 5).map((person, index) => createCitation('global-people', index, 'person', person.id, person.primaryDisplayName))
  })
}

function buildGlobalGroupCard(db: ArchiveDatabase) {
  const groups = listGroupPortraits(db)

  if (groups.length === 0) {
    return createCard({
      cardId: 'global-groups',
      title: 'Group Overview',
      body: 'No multi-person group portraits are currently available.',
      displayType: 'coverage_gap'
    })
  }

  const leadingGroup = groups[0]!
  return createCard({
    cardId: 'global-groups',
    title: 'Group Overview',
    body: `${groups.length} group portraits are available. Leading group: ${leadingGroup.title} with ${leadingGroup.memberCount} members and ${leadingGroup.sharedEventCount} shared events.`,
    displayType: 'derived_summary',
    citations: groups.slice(0, 3).map((group, index) => createCitation('global-groups', index, 'group', group.anchorPersonId, group.title))
  })
}

function buildGlobalReviewPressureCard(db: ArchiveDatabase) {
  const pendingItems = listReviewWorkbenchItems(db, { status: 'pending' })
  const conflictGroups = listReviewConflictGroups(db)
  const leadingConflict = conflictGroups[0] ?? null

  return createCard({
    cardId: 'global-review-pressure',
    title: 'Review Pressure',
    body: pendingItems.length > 0
      ? `${pendingItems.length} pending review items remain across ${conflictGroups.length} conflict groups. Highest pressure is ${leadingConflict?.canonicalPersonName ?? 'the archive'}${leadingConflict?.fieldKey ? ` · ${leadingConflict.fieldKey}` : ''}.`
      : 'There is no pending review pressure right now.',
    displayType: pendingItems.length > 0 ? 'open_conflict' : 'derived_summary',
    citations: [
      ...(leadingConflict
        ? [createCitation('global-review-pressure', 0, 'review', leadingConflict.nextQueueItemId, `Open ${leadingConflict.fieldKey ?? 'review'} conflicts`)]
        : []),
      ...(leadingConflict?.canonicalPersonId
        ? [createCitation('global-review-pressure', 1, 'person', leadingConflict.canonicalPersonId, leadingConflict.canonicalPersonName)]
        : [])
    ]
  })
}

function buildGlobalDecisionCard(db: ArchiveDatabase) {
  const entries = listDecisionJournal(db).slice(0, 3)

  return createCard({
    cardId: 'global-decisions',
    title: 'Recent Decisions',
    body: entries.length > 0
      ? entries.map((entry) => entry.replaySummary ?? `${entry.decisionType} · ${entry.targetType}`).join(' · ')
      : 'No decision journal entries have been recorded yet.',
    displayType: entries.length > 0 ? 'approved_fact' : 'coverage_gap',
    citations: entries.map((entry, index) => createCitation('global-decisions', index, 'journal', entry.id, entry.replaySummary ?? entry.id))
  })
}

export function buildGlobalContextPack(db: ArchiveDatabase, question: string): MemoryWorkspaceResponse {
  const contextCards = [
    buildGlobalPeopleCard(db),
    buildGlobalGroupCard(db),
    buildGlobalReviewPressureCard(db),
    buildGlobalDecisionCard(db)
  ]

  return createResponse({
    scope: { kind: 'global' },
    question,
    title: 'Memory Workspace · Global',
    contextCards
  })
}

export function askMemoryWorkspace(
  db: ArchiveDatabase,
  input: AskMemoryWorkspaceInput
): MemoryWorkspaceResponse | null {
  if (input.scope.kind === 'global') {
    return buildGlobalContextPack(db, input.question)
  }

  if (input.scope.kind === 'person') {
    return buildPersonContextPack(db, input.scope.canonicalPersonId, input.question)
  }

  return buildGroupContextPack(db, input.scope.anchorPersonId, input.question)
}
