import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ContextPackAmbiguitySummary,
  ContextPackExportMode,
  ContextPackExportResult,
  ContextPackGroupMember,
  ContextPackNarrativeEntry,
  ContextPackRelationshipEntry,
  ContextPackSection,
  ContextPackSectionItem,
  ContextPackSourceRef,
  ContextPackTimelineEntry,
  GroupContextPack,
  GroupPortrait,
  PersonContextPack,
  PersonDossier,
  PersonDossierEvidenceRef
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getGroupPortrait } from './groupPortraitService'
import { getPersonDossier } from './personDossierService'

const DEFAULT_CONTEXT_PACK_MODE: ContextPackExportMode = 'approved_plus_derived'

function shareEnvelope() {
  return {
    requestShape: 'local_json_context_pack' as const,
    policyKey: 'context_pack.local_export_baseline' as const
  }
}

function toSourceRef(ref: PersonDossierEvidenceRef): ContextPackSourceRef {
  return {
    kind: ref.kind,
    id: ref.id,
    label: ref.label
  }
}

function dedupeSourceRefs(sourceRefs: ContextPackSourceRef[]) {
  const byKey = new Map<string, ContextPackSourceRef>()

  for (const sourceRef of sourceRefs) {
    const key = `${sourceRef.kind}:${sourceRef.id}`
    const existing = byKey.get(key)
    if (!existing || existing.label === existing.id && sourceRef.label !== sourceRef.id) {
      byKey.set(key, sourceRef)
    }
  }

  return [...byKey.values()]
}

function createPersonOverviewSection(dossier: PersonDossier): ContextPackSection {
  const overviewRefs = dedupeSourceRefs(dossier.evidenceBacktrace.map(toSourceRef))
  return {
    sectionKey: 'overview',
    title: 'Overview',
    displayType: 'derived_summary',
    items: [{
      id: 'overview:summary',
      label: 'summary',
      value: `${dossier.identityCard.primaryDisplayName} has ${dossier.identityCard.evidenceCount} linked evidence sources and ${dossier.timelineHighlights.length} approved timeline highlight(s).`,
      displayType: 'derived_summary',
      sourceRefs: overviewRefs
    }]
  }
}

function mapSectionItem(item: PersonDossier['thematicSections'][number]['items'][number]): ContextPackSectionItem {
  return {
    id: item.id,
    label: item.label,
    value: item.value,
    displayType: item.displayType,
    sourceRefs: item.evidenceRefs.map(toSourceRef)
  }
}

function buildPersonAmbiguity(dossier: PersonDossier): ContextPackAmbiguitySummary[] {
  const conflictRefs: ContextPackSourceRef[] = dossier.reviewShortcuts.map((shortcut) => ({
    kind: 'review',
    id: shortcut.queueItemId ?? `${shortcut.canonicalPersonId}:${shortcut.fieldKey ?? 'review'}`,
    label: shortcut.label
  }))

  const conflicts = dossier.conflictSummary.map((conflict, index) => ({
    id: `conflict:${conflict.fieldKey ?? index}`,
    title: conflict.title,
    detail: `${conflict.pendingCount} pending value(s): ${conflict.distinctValues.join(' / ')}`,
    displayType: 'open_conflict' as const,
    sourceRefs: conflictRefs
  }))

  const gaps = dossier.coverageGaps.map((gap) => ({
    id: `gap:${gap.gapKey}`,
    title: gap.title,
    detail: gap.detail,
    displayType: 'coverage_gap' as const,
    sourceRefs: [] as ContextPackSourceRef[]
  }))

  return [...conflicts, ...gaps]
}

export function buildPersonContextPackFromDossier(input: {
  dossier: PersonDossier
  mode?: ContextPackExportMode
}): PersonContextPack {
  const mode = input.mode ?? DEFAULT_CONTEXT_PACK_MODE
  const sections = input.dossier.thematicSections.map((section) => ({
    sectionKey: section.sectionKey,
    title: section.title,
    displayType: section.displayType,
    items: section.items.map(mapSectionItem)
  }))

  const nextSections = mode === 'approved_plus_derived'
    ? [createPersonOverviewSection(input.dossier), ...sections]
    : sections.filter((section) => section.displayType !== 'derived_summary')

  const timelineHighlights: ContextPackTimelineEntry[] = input.dossier.timelineHighlights.map((highlight) => ({
    id: highlight.eventId,
    title: highlight.title,
    timeStart: highlight.timeStart,
    timeEnd: highlight.timeEnd,
    summary: highlight.summary,
    displayType: highlight.displayType,
    sourceRefs: highlight.evidenceRefs.map(toSourceRef)
  }))

  const relationships: ContextPackRelationshipEntry[] = input.dossier.relationshipSummary.map((relationship) => ({
    personId: relationship.personId,
    label: relationship.displayName,
    sharedFileCount: relationship.sharedFileCount,
    displayType: relationship.displayType,
    sourceRefs: relationship.evidenceRefs.map(toSourceRef)
  }))

  const ambiguity = buildPersonAmbiguity(input.dossier)
  const sourceRefs = dedupeSourceRefs([
    ...nextSections.flatMap((section) => section.items.flatMap((item) => item.sourceRefs)),
    ...timelineHighlights.flatMap((entry) => entry.sourceRefs),
    ...relationships.flatMap((entry) => entry.sourceRefs),
    ...ambiguity.flatMap((entry) => entry.sourceRefs),
    ...input.dossier.evidenceBacktrace.map(toSourceRef)
  ])

  return {
    formatVersion: 'phase8c1',
    exportedAt: null,
    mode,
    scope: {
      kind: 'person',
      canonicalPersonId: input.dossier.person.id
    },
    title: `Person Context Pack · ${input.dossier.identityCard.primaryDisplayName}`,
    identity: {
      primaryDisplayName: input.dossier.identityCard.primaryDisplayName,
      aliases: input.dossier.identityCard.aliases,
      manualLabels: input.dossier.identityCard.manualLabels,
      firstSeenAt: input.dossier.identityCard.firstSeenAt,
      lastSeenAt: input.dossier.identityCard.lastSeenAt,
      evidenceCount: input.dossier.identityCard.evidenceCount
    },
    sections: nextSections,
    timelineHighlights,
    relationships,
    ambiguity,
    sourceRefs,
    shareEnvelope: shareEnvelope()
  }
}

function groupTimelineSourceRefs(portrait: GroupPortrait, windowTitle: string) {
  return dedupeSourceRefs(
    portrait.sharedEvents
      .filter((event) => event.title === windowTitle)
      .flatMap((event) => event.evidenceRefs.map((ref) => ({
        kind: ref.kind,
        id: ref.id,
        label: ref.label
      } satisfies ContextPackSourceRef)))
  )
}

function buildGroupAmbiguity(portrait: GroupPortrait): ContextPackAmbiguitySummary[] {
  const sourceRefs = portrait.ambiguitySummary.reviewShortcut
    ? [{
        kind: 'review' as const,
        id: portrait.ambiguitySummary.reviewShortcut.queueItemId
          ?? `${portrait.ambiguitySummary.reviewShortcut.canonicalPersonId}:${portrait.ambiguitySummary.reviewShortcut.fieldKey ?? 'review'}`,
        label: portrait.ambiguitySummary.reviewShortcut.label
      }]
    : []

  return [{
    id: 'group-ambiguity',
    title: 'Unresolved ambiguity',
    detail: `Pending review ${portrait.ambiguitySummary.pendingReviewCount}; conflict groups ${portrait.ambiguitySummary.conflictGroupCount}; affected members ${portrait.ambiguitySummary.affectedMemberCount}.`,
    displayType: portrait.ambiguitySummary.displayType === 'open_conflict'
      ? 'open_conflict'
      : 'coverage_gap',
    sourceRefs
  }]
}

export function buildGroupContextPackFromPortrait(input: {
  portrait: GroupPortrait
  mode?: ContextPackExportMode
}): GroupContextPack {
  const mode = input.mode ?? DEFAULT_CONTEXT_PACK_MODE

  const members: ContextPackGroupMember[] = input.portrait.members.map((member) => ({
    personId: member.personId,
    displayName: member.displayName,
    isAnchor: member.isAnchor,
    sharedFileCount: member.sharedFileCount,
    sharedEventCount: member.sharedEventCount,
    displayType: member.displayType
  }))

  const timelineWindows: ContextPackTimelineEntry[] = input.portrait.timelineWindows.map((window) => ({
    id: window.windowId,
    title: window.title,
    timeStart: window.timeStart,
    timeEnd: window.timeEnd,
    summary: `${window.eventCount} event(s); ${window.memberCount} member(s); ${window.members.join(', ')}`,
    displayType: window.displayType,
    sourceRefs: groupTimelineSourceRefs(input.portrait, window.title)
  }))

  const sharedEvidenceSources = input.portrait.sharedEvidenceSources.map((source) => ({
    kind: 'file' as const,
    id: source.fileId,
    label: source.fileName
  }))

  const narrative: ContextPackNarrativeEntry[] = input.portrait.narrativeSummary
    .filter((entry) => mode === 'approved_plus_derived' || entry.displayType !== 'derived_summary')
    .map((entry) => ({
      id: entry.summaryId,
      text: entry.text,
      displayType: entry.displayType,
      sourceRefs: [] as ContextPackSourceRef[]
    }))

  const ambiguity = buildGroupAmbiguity(input.portrait)
  const sourceRefs = dedupeSourceRefs([
    ...timelineWindows.flatMap((entry) => entry.sourceRefs),
    ...sharedEvidenceSources,
    ...narrative.flatMap((entry) => entry.sourceRefs),
    ...ambiguity.flatMap((entry) => entry.sourceRefs)
  ])

  return {
    formatVersion: 'phase8c1',
    exportedAt: null,
    mode,
    scope: {
      kind: 'group',
      anchorPersonId: input.portrait.anchorPersonId
    },
    title: `Group Context Pack · ${input.portrait.title}`,
    members,
    timelineWindows,
    sharedEvidenceSources,
    narrative,
    ambiguity,
    sourceRefs,
    shareEnvelope: shareEnvelope()
  }
}

export function buildPersonContextPack(
  db: ArchiveDatabase,
  input: { canonicalPersonId: string; mode?: ContextPackExportMode }
): PersonContextPack | null {
  const dossier = getPersonDossier(db, { canonicalPersonId: input.canonicalPersonId })
  if (!dossier) {
    return null
  }

  return buildPersonContextPackFromDossier({
    dossier,
    mode: input.mode
  })
}

export function buildGroupContextPack(
  db: ArchiveDatabase,
  input: { anchorPersonId: string; mode?: ContextPackExportMode }
): GroupContextPack | null {
  const portrait = getGroupPortrait(db, { canonicalPersonId: input.anchorPersonId })
  if (!portrait) {
    return null
  }

  return buildGroupContextPackFromPortrait({
    portrait,
    mode: input.mode
  })
}

function fileNameForPack(pack: PersonContextPack | GroupContextPack) {
  if (pack.scope.kind === 'person') {
    return `person-${pack.scope.canonicalPersonId}-context-pack.json`
  }

  return `group-${pack.scope.anchorPersonId}-context-pack.json`
}

function sha256Text(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function exportContextPackToDirectory(input: {
  destinationRoot: string
  pack: PersonContextPack | GroupContextPack
  exportedAt?: string
}): ContextPackExportResult {
  const exportedAt = input.exportedAt ?? new Date().toISOString()
  const fileName = fileNameForPack(input.pack)
  const filePath = path.join(input.destinationRoot, fileName)
  const nextPack = {
    ...input.pack,
    exportedAt
  }
  const payload = `${JSON.stringify(nextPack, null, 2)}\n`

  fs.mkdirSync(input.destinationRoot, { recursive: true })
  fs.writeFileSync(filePath, payload, 'utf8')

  return {
    status: 'exported',
    filePath,
    fileName,
    sha256: sha256Text(payload),
    exportedAt,
    mode: input.pack.mode,
    scope: input.pack.scope
  }
}
