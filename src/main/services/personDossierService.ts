import type {
  CanonicalPersonDetail,
  PersonDossier,
  PersonDossierConflictSummary,
  PersonDossierEvidenceRef,
  PersonDossierGapSummary,
  PersonDossierRelationshipSummary,
  PersonDossierReviewShortcut,
  PersonDossierSection,
  PersonDossierSectionItem,
  PersonDossierTimelineHighlight,
  PersonGraph,
  PersonProfileAttribute,
  PersonTimelineEvent
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getPersonGraph } from './graphService'
import { listReviewWorkbenchItems } from './reviewWorkbenchReadService'
import { getCanonicalPerson, getPersonTimeline } from './timelineService'

const PREFERRED_SECTION_ORDER = [
  'identity',
  'education',
  'work',
  'family',
  'location',
  'account',
  'device',
  'habit',
  'routine'
] as const

function titleCase(input: string) {
  return input
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildProfileEvidenceRefs(attribute: PersonProfileAttribute): PersonDossierEvidenceRef[] {
  const refs: PersonDossierEvidenceRef[] = []

  if (attribute.sourceFileId) {
    refs.push({
      kind: 'file',
      id: attribute.sourceFileId,
      label: attribute.sourceFileId
    })
  }
  if (attribute.sourceEvidenceId) {
    refs.push({
      kind: 'evidence',
      id: attribute.sourceEvidenceId,
      label: attribute.sourceEvidenceId
    })
  }
  if (attribute.sourceCandidateId) {
    refs.push({
      kind: 'candidate',
      id: attribute.sourceCandidateId,
      label: attribute.sourceCandidateId
    })
  }
  if (attribute.approvedJournalId) {
    refs.push({
      kind: 'journal',
      id: attribute.approvedJournalId,
      label: attribute.approvedJournalId
    })
  }

  return refs
}

function buildIdentityCard(person: CanonicalPersonDetail): PersonDossier['identityCard'] {
  return {
    primaryDisplayName: person.primaryDisplayName,
    aliases: [...new Set(person.aliases.map((alias) => alias.displayName))],
    manualLabels: person.manualLabels,
    firstSeenAt: person.firstSeenAt,
    lastSeenAt: person.lastSeenAt,
    evidenceCount: person.evidenceCount,
    displayType: 'approved_fact'
  }
}

function buildCoverageGapSection(sectionKey: string): PersonDossierSection {
  return {
    sectionKey,
    title: titleCase(sectionKey),
    displayType: 'coverage_gap',
    items: [{
      id: `${sectionKey}:coverage-gap`,
      label: 'coverage_gap',
      value: `No approved ${titleCase(sectionKey).toLowerCase()} facts yet.`,
      displayType: 'coverage_gap',
      evidenceRefs: []
    }]
  }
}

function buildApprovedSection(sectionKey: string, attributes: PersonProfileAttribute[]): PersonDossierSection {
  const items: PersonDossierSectionItem[] = attributes.map((attribute) => ({
    id: attribute.id,
    label: attribute.attributeKey,
    value: attribute.displayValue,
    displayType: 'approved_fact',
    evidenceRefs: buildProfileEvidenceRefs(attribute)
  }))

  return {
    sectionKey,
    title: titleCase(sectionKey),
    displayType: 'approved_fact',
    items
  }
}

function buildThematicSections(person: CanonicalPersonDetail): PersonDossierSection[] {
  const approvedProfile = person.approvedProfile ?? {}
  const extraSectionKeys = Object.keys(approvedProfile)
    .filter((sectionKey) => !PREFERRED_SECTION_ORDER.includes(sectionKey as (typeof PREFERRED_SECTION_ORDER)[number]))
    .sort((left, right) => left.localeCompare(right))
  const orderedSectionKeys = [...PREFERRED_SECTION_ORDER, ...extraSectionKeys]

  return orderedSectionKeys.map((sectionKey) => {
    const attributes = approvedProfile[sectionKey] ?? []
    return attributes.length > 0
      ? buildApprovedSection(sectionKey, attributes)
      : buildCoverageGapSection(sectionKey)
  })
}

function buildTimelineHighlights(timeline: PersonTimelineEvent[]): PersonDossierTimelineHighlight[] {
  return timeline.map((event) => ({
    eventId: event.eventId,
    title: event.title,
    timeStart: event.timeStart,
    timeEnd: event.timeEnd,
    summary: event.summary,
    displayType: 'approved_fact',
    evidenceRefs: event.evidence.map((evidence) => ({
      kind: 'file',
      id: evidence.fileId,
      label: evidence.fileName
    }))
  }))
}

function buildRelationshipSummary(graph: PersonGraph): PersonDossierRelationshipSummary[] {
  const nodeLabels = new Map(graph.nodes.map((node) => [node.id, node.primaryDisplayName]))

  return graph.edges
    .map((edge) => ({
      personId: edge.toPersonId,
      displayName: nodeLabels.get(edge.toPersonId) ?? edge.toPersonId,
      sharedFileCount: edge.sharedFileCount,
      manualLabel: edge.manualLabel ?? null,
      displayType: 'approved_fact' as const,
      evidenceRefs: edge.evidenceFileIds.map((fileId) => ({
        kind: 'file' as const,
        id: fileId,
        label: fileId
      }))
    }))
    .sort((left, right) => right.sharedFileCount - left.sharedFileCount || left.displayName.localeCompare(right.displayName))
}

function buildEvidenceBacktrace(
  thematicSections: PersonDossierSection[],
  timelineHighlights: PersonDossierTimelineHighlight[],
  relationshipSummary: PersonDossierRelationshipSummary[]
) {
  const refs = [
    ...thematicSections.flatMap((section) => section.items.flatMap((item) => item.evidenceRefs)),
    ...timelineHighlights.flatMap((highlight) => highlight.evidenceRefs),
    ...relationshipSummary.flatMap((summary) => summary.evidenceRefs)
  ]

  const uniqueRefs = new Map<string, PersonDossierEvidenceRef>()

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`
    const existing = uniqueRefs.get(key)
    if (!existing) {
      uniqueRefs.set(key, ref)
      continue
    }

    const existingIsOpaque = existing.label === existing.id
    const incomingIsReadable = ref.label !== ref.id
    if (existingIsOpaque && incomingIsReadable) {
      uniqueRefs.set(key, ref)
    }
  }

  return [...uniqueRefs.values()]
}

function buildConflictSummary(db: ArchiveDatabase, canonicalPersonId: string): PersonDossierConflictSummary[] {
  const pendingItems = listReviewWorkbenchItems(db, {
    status: 'pending',
    canonicalPersonId
  })
  const grouped = new Map<string, {
    fieldKey: string | null
    pendingCount: number
    distinctValues: Set<string>
    hasConflict: boolean
  }>()

  for (const item of pendingItems) {
    const key = item.fieldKey ?? '__unkeyed__'
    const existing = grouped.get(key) ?? {
      fieldKey: item.fieldKey,
      pendingCount: 0,
      distinctValues: new Set<string>(),
      hasConflict: false
    }

    existing.pendingCount += 1
    if (item.displayValue) {
      existing.distinctValues.add(item.displayValue)
    }
    existing.hasConflict = existing.hasConflict || item.hasConflict
    grouped.set(key, existing)
  }

  return [...grouped.values()]
    .map((group) => ({
      fieldKey: group.fieldKey,
      title: group.fieldKey ? `${titleCase(group.fieldKey)} conflict` : 'Open conflict',
      pendingCount: group.pendingCount,
      distinctValues: [...group.distinctValues].sort((left, right) => left.localeCompare(right)),
      displayType: 'open_conflict' as const,
      hasConflict: group.hasConflict || group.distinctValues.size > 1
    }))
    .filter((group) => group.hasConflict)
    .map(({ hasConflict: _hasConflict, ...group }) => group)
}

function buildCoverageGaps(
  thematicSections: PersonDossierSection[],
  timelineHighlights: PersonDossierTimelineHighlight[],
  relationshipSummary: PersonDossierRelationshipSummary[]
): PersonDossierGapSummary[] {
  const gaps = thematicSections
    .filter((section) => section.displayType === 'coverage_gap')
    .map((section) => ({
      gapKey: `section.${section.sectionKey}`,
      title: `${section.title} coverage gap`,
      detail: section.items[0]?.value ?? `No approved ${section.title.toLowerCase()} facts yet.`,
      displayType: 'coverage_gap' as const
    }))

  if (timelineHighlights.length === 0) {
    gaps.push({
      gapKey: 'timeline.empty',
      title: 'Timeline coverage gap',
      detail: 'No approved timeline highlights yet.',
      displayType: 'coverage_gap'
    })
  }

  if (relationshipSummary.length === 0) {
    gaps.push({
      gapKey: 'relationships.empty',
      title: 'Relationship coverage gap',
      detail: 'No approved relationship context yet.',
      displayType: 'coverage_gap'
    })
  }

  return gaps
}

function buildReviewShortcuts(
  db: ArchiveDatabase,
  canonicalPersonId: string,
  conflictSummary: PersonDossierConflictSummary[]
): PersonDossierReviewShortcut[] {
  const pendingItems = listReviewWorkbenchItems(db, {
    status: 'pending',
    canonicalPersonId
  })

  const shortcuts: PersonDossierReviewShortcut[] = []

  if (pendingItems.length > 0) {
    shortcuts.push({
      label: `Open pending review (${pendingItems.length})`,
      canonicalPersonId,
      queueItemId: pendingItems[0]?.queueItemId
    })
  }

  for (const conflict of conflictSummary) {
    const matchingItem = pendingItems.find((item) => item.fieldKey === conflict.fieldKey && item.hasConflict)
    shortcuts.push({
      label: `Open ${conflict.fieldKey ?? 'field'} conflicts`,
      canonicalPersonId,
      fieldKey: conflict.fieldKey ?? undefined,
      hasConflict: true,
      queueItemId: matchingItem?.queueItemId
    })
  }

  return shortcuts
}

export function getPersonDossier(db: ArchiveDatabase, input: { canonicalPersonId: string }): PersonDossier | null {
  const person = getCanonicalPerson(db, input)
  if (!person) {
    return null
  }

  const timeline = getPersonTimeline(db, input)
  const graph = getPersonGraph(db, input)
  const thematicSections = buildThematicSections(person)
  const timelineHighlights = buildTimelineHighlights(timeline)
  const relationshipSummary = buildRelationshipSummary(graph)
  const conflictSummary = buildConflictSummary(db, input.canonicalPersonId)
  const coverageGaps = buildCoverageGaps(thematicSections, timelineHighlights, relationshipSummary)
  const reviewShortcuts = buildReviewShortcuts(db, input.canonicalPersonId, conflictSummary)

  return {
    person,
    identityCard: buildIdentityCard(person),
    thematicSections,
    timelineHighlights,
    relationshipSummary,
    conflictSummary,
    coverageGaps,
    reviewShortcuts,
    evidenceBacktrace: buildEvidenceBacktrace(thematicSections, timelineHighlights, relationshipSummary)
  }
}
