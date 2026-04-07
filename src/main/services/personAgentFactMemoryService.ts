import crypto from 'node:crypto'
import type {
  PersonAgentFactMemoryConflictState,
  PersonAgentFactMemoryKind,
  PersonAgentFactMemoryRecord,
  PersonAgentMemoryRef,
  PersonDossier,
  PersonDossierEvidenceRef,
  PersonDossierRelationshipSummary,
  PersonDossierTimelineHighlight
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentFactMemories,
  replacePersonAgentFactMemories,
  upsertPersonAgent
} from './governancePersistenceService'
import { getPersonDossier } from './personDossierService'

export type PersonAgentFactMemoryProjectionRow = {
  personAgentId: string
  canonicalPersonId: string
  memoryKey: string
  sectionKey: string
  displayLabel: string
  summaryValue: string
  memoryKind: PersonAgentFactMemoryKind
  confidence: number | null
  conflictState: PersonAgentFactMemoryConflictState
  freshnessAt: string | null
  sourceRefs: PersonAgentMemoryRef[]
  sourceHash: string
}

export type PersonAgentFactMemorySummary = {
  personAgentId: string
  canonicalPersonId: string
  factsVersion: number
  counts: {
    facts: number
    timeline: number
    relationships: number
    conflicts: number
    coverageGaps: number
  }
  facts: PersonAgentFactMemoryRecord[]
  timeline: PersonAgentFactMemoryRecord[]
  relationships: PersonAgentFactMemoryRecord[]
  conflicts: PersonAgentFactMemoryRecord[]
  coverageGaps: PersonAgentFactMemoryRecord[]
}

function titleCase(input: string) {
  return input
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeMemoryRefs(refs: PersonDossierEvidenceRef[] | PersonAgentMemoryRef[]) {
  const seen = new Set<string>()
  const normalized: PersonAgentMemoryRef[] = []

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push({
      kind: ref.kind,
      id: ref.id,
      label: ref.label
    })
  }

  return normalized.sort((left, right) => {
    const leftKey = `${left.kind}:${left.id}`
    const rightKey = `${right.kind}:${right.id}`
    return leftKey.localeCompare(rightKey)
  })
}

function hashProjectionRow(input: Omit<PersonAgentFactMemoryProjectionRow, 'sourceHash'>) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      memoryKey: input.memoryKey,
      sectionKey: input.sectionKey,
      displayLabel: input.displayLabel,
      summaryValue: input.summaryValue,
      memoryKind: input.memoryKind,
      confidence: input.confidence,
      conflictState: input.conflictState,
      freshnessAt: input.freshnessAt,
      sourceRefs: normalizeMemoryRefs(input.sourceRefs)
    }))
    .digest('hex')
}

function withSourceHash(input: Omit<PersonAgentFactMemoryProjectionRow, 'sourceHash'>): PersonAgentFactMemoryProjectionRow {
  return {
    ...input,
    sourceRefs: normalizeMemoryRefs(input.sourceRefs),
    sourceHash: hashProjectionRow(input)
  }
}

function buildTimelineSummary(highlight: PersonDossierTimelineHighlight) {
  return `${highlight.title} (${highlight.timeStart} -> ${highlight.timeEnd})${highlight.summary ? `; ${highlight.summary}` : ''}`
}

function buildRelationshipSummary(relationship: PersonDossierRelationshipSummary) {
  const relationshipLabel = relationship.manualLabel ?? 'related'
  return `${relationshipLabel}; shared evidence files: ${relationship.sharedFileCount}`
}

function buildConflictSummaryValues(values: string[]) {
  return values.join(' / ')
}

function buildConflictSourceRefs(dossier: PersonDossier, fieldKey: string | null) {
  const matchingShortcuts = dossier.reviewShortcuts.filter((shortcut) => shortcut.fieldKey === (fieldKey ?? undefined))

  return matchingShortcuts.map((shortcut) => ({
    kind: 'review' as const,
    id: shortcut.queueItemId ?? `${shortcut.canonicalPersonId}:${shortcut.fieldKey ?? 'review'}`,
    label: shortcut.label
  }))
}

function sortProjectionRows(rows: PersonAgentFactMemoryProjectionRow[]) {
  return [...rows].sort((left, right) => left.memoryKey.localeCompare(right.memoryKey))
}

function projectionRowsEqual(
  existingRows: PersonAgentFactMemoryRecord[],
  projectedRows: PersonAgentFactMemoryProjectionRow[]
) {
  if (existingRows.length !== projectedRows.length) {
    return false
  }

  const projectedByKey = new Map(projectedRows.map((row) => [row.memoryKey, row]))

  return existingRows.every((row) => projectedByKey.get(row.memoryKey)?.sourceHash === row.sourceHash)
}

export function buildPersonAgentFactMemoryProjection(input: {
  personAgentId: string
  canonicalPersonId: string
  dossier: PersonDossier
}): PersonAgentFactMemoryProjectionRow[] {
  const rows: PersonAgentFactMemoryProjectionRow[] = []

  for (const section of input.dossier.thematicSections) {
    if (section.displayType !== 'approved_fact') {
      continue
    }

    for (const item of section.items) {
      if (item.displayType !== 'approved_fact') {
        continue
      }

      rows.push(withSourceHash({
        personAgentId: input.personAgentId,
        canonicalPersonId: input.canonicalPersonId,
        memoryKey: `${section.sectionKey}.${item.label}`,
        sectionKey: section.sectionKey,
        displayLabel: titleCase(item.label),
        summaryValue: item.value,
        memoryKind: 'fact',
        confidence: 1,
        conflictState: 'none',
        freshnessAt: input.dossier.identityCard.lastSeenAt,
        sourceRefs: item.evidenceRefs
      }))
    }
  }

  for (const highlight of input.dossier.timelineHighlights) {
    rows.push(withSourceHash({
      personAgentId: input.personAgentId,
      canonicalPersonId: input.canonicalPersonId,
      memoryKey: `timeline.${highlight.eventId}`,
      sectionKey: 'timeline',
      displayLabel: highlight.title,
      summaryValue: buildTimelineSummary(highlight),
      memoryKind: 'timeline',
      confidence: 1,
      conflictState: 'none',
      freshnessAt: highlight.timeEnd,
      sourceRefs: highlight.evidenceRefs
    }))
  }

  for (const relationship of input.dossier.relationshipSummary) {
    rows.push(withSourceHash({
      personAgentId: input.personAgentId,
      canonicalPersonId: input.canonicalPersonId,
      memoryKey: `relationship.${relationship.personId}`,
      sectionKey: 'relationship',
      displayLabel: relationship.displayName,
      summaryValue: buildRelationshipSummary(relationship),
      memoryKind: 'relationship',
      confidence: 1,
      conflictState: 'none',
      freshnessAt: input.dossier.identityCard.lastSeenAt,
      sourceRefs: relationship.evidenceRefs
    }))
  }

  for (const conflict of input.dossier.conflictSummary) {
    rows.push(withSourceHash({
      personAgentId: input.personAgentId,
      canonicalPersonId: input.canonicalPersonId,
      memoryKey: `conflict.${conflict.fieldKey ?? 'unknown'}`,
      sectionKey: 'conflict',
      displayLabel: conflict.title,
      summaryValue: `Pending values: ${buildConflictSummaryValues(conflict.distinctValues)} (${conflict.pendingCount} pending)`,
      memoryKind: 'conflict',
      confidence: null,
      conflictState: 'open',
      freshnessAt: null,
      sourceRefs: buildConflictSourceRefs(input.dossier, conflict.fieldKey)
    }))
  }

  for (const gap of input.dossier.coverageGaps) {
    rows.push(withSourceHash({
      personAgentId: input.personAgentId,
      canonicalPersonId: input.canonicalPersonId,
      memoryKey: `coverage.${gap.gapKey}`,
      sectionKey: 'coverage',
      displayLabel: gap.title,
      summaryValue: gap.detail,
      memoryKind: 'coverage_gap',
      confidence: null,
      conflictState: 'none',
      freshnessAt: null,
      sourceRefs: []
    }))
  }

  return sortProjectionRows(rows)
}

export function syncPersonAgentFactMemory(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  dossier?: PersonDossier
}) {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (!personAgent) {
    throw new Error(`Person agent not found for canonical person: ${input.canonicalPersonId}`)
  }

  if (personAgent.personAgentId !== input.personAgentId) {
    throw new Error(
      `Person-agent mismatch: expected ${personAgent.personAgentId} for ${input.canonicalPersonId}, got ${input.personAgentId}`
    )
  }

  const dossier = input.dossier ?? getPersonDossier(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  if (!dossier) {
    throw new Error(`Person dossier not found for canonical person: ${input.canonicalPersonId}`)
  }

  const projectedRows = buildPersonAgentFactMemoryProjection({
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    dossier
  })
  const existingRows = listPersonAgentFactMemories(db, {
    personAgentId: input.personAgentId
  })

  if (projectionRowsEqual(existingRows, projectedRows)) {
    return {
      didChange: false,
      factsVersion: personAgent.factsVersion,
      records: existingRows
    }
  }

  const records = replacePersonAgentFactMemories(db, {
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    rows: projectedRows.map(({ personAgentId: _personAgentId, canonicalPersonId: _canonicalPersonId, ...row }) => row)
  })

  const updatedPersonAgent = upsertPersonAgent(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: personAgent.canonicalPersonId,
    status: personAgent.status,
    promotionTier: personAgent.promotionTier,
    promotionScore: personAgent.promotionScore,
    promotionReasonSummary: personAgent.promotionReasonSummary,
    factsVersion: personAgent.factsVersion + 1,
    interactionVersion: personAgent.interactionVersion,
    lastRefreshedAt: personAgent.lastRefreshedAt,
    lastActivatedAt: personAgent.lastActivatedAt
  })

  return {
    didChange: true,
    factsVersion: updatedPersonAgent.factsVersion,
    records
  }
}

export function getPersonAgentFactMemorySummary(
  db: ArchiveDatabase,
  input: { canonicalPersonId: string }
): PersonAgentFactMemorySummary | null {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  if (!personAgent) {
    return null
  }

  const rows = listPersonAgentFactMemories(db, {
    personAgentId: personAgent.personAgentId
  })

  const facts = rows.filter((row) => row.memoryKind === 'fact')
  const timeline = rows.filter((row) => row.memoryKind === 'timeline')
  const relationships = rows.filter((row) => row.memoryKind === 'relationship')
  const conflicts = rows.filter((row) => row.memoryKind === 'conflict')
  const coverageGaps = rows.filter((row) => row.memoryKind === 'coverage_gap')

  return {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    factsVersion: personAgent.factsVersion,
    counts: {
      facts: facts.length,
      timeline: timeline.length,
      relationships: relationships.length,
      conflicts: conflicts.length,
      coverageGaps: coverageGaps.length
    },
    facts,
    timeline,
    relationships,
    conflicts,
    coverageGaps
  }
}
