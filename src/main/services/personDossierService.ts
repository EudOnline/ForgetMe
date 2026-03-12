import type {
  CanonicalPersonDetail,
  PersonDossier,
  PersonDossierEvidenceRef,
  PersonDossierRelationshipSummary,
  PersonDossierSection,
  PersonDossierSectionItem,
  PersonDossierTimelineHighlight,
  PersonGraph,
  PersonProfileAttribute,
  PersonTimelineEvent
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getPersonGraph } from './graphService'
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

  return {
    person,
    identityCard: buildIdentityCard(person),
    thematicSections,
    timelineHighlights,
    relationshipSummary,
    evidenceBacktrace: buildEvidenceBacktrace(thematicSections, timelineHighlights, relationshipSummary)
  }
}
