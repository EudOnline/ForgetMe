import type {
  AskMemoryWorkspaceInput,
  MemoryWorkspaceCitation,
  MemoryWorkspaceContextCard,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceResponse,
  MemoryWorkspaceWorkflowKind
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getGroupPortrait, listGroupPortraits } from './groupPortraitService'
import { listDecisionJournal } from './journalService'
import {
  createCard,
  createCitation,
  createResponse,
  type MemoryWorkspacePriorTurnContext,
  toMemoryCitationFromEvidenceRef
} from './memoryWorkspaceResponseService'
import { getPersonDossier } from './personDossierService'
import {
  resolvePersonAgentRoute,
  type PersonAgentRouteDecoration
} from './personAgentRoutingService'
import { listReviewConflictGroups, listReviewWorkbenchItems } from './reviewWorkbenchReadService'
import { getPeopleList } from './timelineService'

type AskMemoryWorkspaceInternalInput = AskMemoryWorkspaceInput & {
  priorTurnContext?: MemoryWorkspacePriorTurnContext[]
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
  question: string,
  expressionMode?: MemoryWorkspaceExpressionMode,
  workflowKind?: MemoryWorkspaceWorkflowKind,
  priorTurnContext?: MemoryWorkspacePriorTurnContext[],
  routeDecoration?: PersonAgentRouteDecoration | null
): MemoryWorkspaceResponse | null {
  const dossier = getPersonDossier(db, { canonicalPersonId })
  if (!dossier) {
    return null
  }

  const contextCards = [
    ...(routeDecoration?.injectedContextCards ?? []),
    buildPersonSummaryCard(db, canonicalPersonId),
    buildPersonTimelineCard(db, canonicalPersonId),
    buildPersonConflictCard(db, canonicalPersonId)
  ].filter((card): card is MemoryWorkspaceContextCard => Boolean(card))

  const response = createResponse({
    db,
    scope: { kind: 'person', canonicalPersonId },
    question,
    expressionMode,
    workflowKind,
    title: `Memory Workspace · ${dossier.identityCard.primaryDisplayName}`,
    contextCards,
    communicationEvidenceScope: routeDecoration?.communicationEvidenceScope,
    priorTurnContext
  })

  return routeDecoration
    ? {
        ...response,
        personAgentContext: routeDecoration.personAgentContext
      }
    : response
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
  question: string,
  expressionMode?: MemoryWorkspaceExpressionMode,
  workflowKind?: MemoryWorkspaceWorkflowKind,
  priorTurnContext?: MemoryWorkspacePriorTurnContext[]
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
    db,
    scope: { kind: 'group', anchorPersonId },
    question,
    expressionMode,
    workflowKind,
    title: `Memory Workspace · ${anchorDisplayName} Group`,
    contextCards,
    priorTurnContext
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

export function buildGlobalContextPack(
  db: ArchiveDatabase,
  question: string,
  expressionMode?: MemoryWorkspaceExpressionMode,
  workflowKind?: MemoryWorkspaceWorkflowKind,
  priorTurnContext?: MemoryWorkspacePriorTurnContext[],
  routeDecoration?: PersonAgentRouteDecoration | null
): MemoryWorkspaceResponse {
  const contextCards = [
    ...(routeDecoration?.injectedContextCards ?? []),
    buildGlobalPeopleCard(db),
    buildGlobalGroupCard(db),
    buildGlobalReviewPressureCard(db),
    buildGlobalDecisionCard(db)
  ]

  const response = createResponse({
    db,
    scope: { kind: 'global' },
    question,
    expressionMode,
    workflowKind,
    title: 'Memory Workspace · Global',
    contextCards,
    communicationEvidenceScope: routeDecoration?.communicationEvidenceScope,
    priorTurnContext
  })

  return routeDecoration
    ? {
        ...response,
        personAgentContext: routeDecoration.personAgentContext
      }
    : response
}

export function askMemoryWorkspace(
  db: ArchiveDatabase,
  input: AskMemoryWorkspaceInternalInput
): MemoryWorkspaceResponse | null {
  if (input.scope.kind === 'global') {
    const routeDecoration = resolvePersonAgentRoute(db, {
      scope: input.scope,
      question: input.question
    })

    return buildGlobalContextPack(
      db,
      input.question,
      input.expressionMode,
      input.workflowKind,
      input.priorTurnContext,
      routeDecoration
    )
  }

  if (input.scope.kind === 'person') {
    const routeDecoration = resolvePersonAgentRoute(db, {
      scope: input.scope,
      question: input.question
    })

    return buildPersonContextPack(
      db,
      input.scope.canonicalPersonId,
      input.question,
      input.expressionMode,
      input.workflowKind,
      input.priorTurnContext,
      routeDecoration
    )
  }

  return buildGroupContextPack(
    db,
    input.scope.anchorPersonId,
    input.question,
    input.expressionMode,
    input.workflowKind,
    input.priorTurnContext
  )
}
