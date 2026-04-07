import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PersonDossier } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentFactMemories,
  upsertPersonAgent
} from '../../../src/main/services/governancePersistenceService'
import {
  buildPersonAgentFactMemoryProjection,
  getPersonAgentFactMemorySummary,
  syncPersonAgentFactMemory
} from '../../../src/main/services/personAgentFactMemoryService'

const NOW = '2026-04-06T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-fact-memory-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  displayName: string
}) {
  db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.canonicalPersonId,
    input.displayName,
    input.displayName.toLowerCase(),
    1,
    3,
    '[]',
    'approved',
    NOW,
    NOW
  )
}

function createPersonDossierFixture(): PersonDossier {
  return {
    person: {
      id: 'cp-1',
      primaryDisplayName: 'Alice Chen',
      normalizedName: 'alice chen',
      aliasCount: 1,
      firstSeenAt: '2026-03-13T00:00:00.000Z',
      lastSeenAt: '2026-04-05T00:00:00.000Z',
      status: 'approved',
      evidenceCount: 3,
      manualLabels: ['college-friend'],
      aliases: [{
        displayName: 'Alice C.',
        sourceType: 'manual',
        confidence: 1
      }],
      approvedProfile: {}
    },
    identityCard: {
      primaryDisplayName: 'Alice Chen',
      aliases: ['Alice C.'],
      manualLabels: ['college-friend'],
      firstSeenAt: '2026-03-13T00:00:00.000Z',
      lastSeenAt: '2026-04-05T00:00:00.000Z',
      evidenceCount: 3,
      displayType: 'approved_fact'
    },
    thematicSections: [{
      sectionKey: 'education',
      title: 'Education',
      displayType: 'approved_fact',
      items: [{
        id: 'item-1',
        label: 'school_name',
        value: '北京大学',
        displayType: 'approved_fact',
        evidenceRefs: [{
          kind: 'file',
          id: 'f-1',
          label: 'transcript-1.pdf'
        }, {
          kind: 'evidence',
          id: 'ee-1',
          label: 'ee-1'
        }, {
          kind: 'candidate',
          id: 'fc-1',
          label: 'fc-1'
        }, {
          kind: 'journal',
          id: 'journal-1',
          label: 'journal-1'
        }]
      }]
    }],
    timelineHighlights: [{
      eventId: 'event-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T08:00:00.000Z',
      timeEnd: '2026-03-13T08:30:00.000Z',
      summary: 'shared planning',
      displayType: 'approved_fact',
      evidenceRefs: [{
        kind: 'file',
        id: 'f-2',
        label: 'chat-1.json'
      }]
    }],
    relationshipSummary: [{
      personId: 'cp-2',
      displayName: 'Bob Li',
      sharedFileCount: 2,
      manualLabel: 'friend',
      displayType: 'approved_fact',
      evidenceRefs: [{
        kind: 'file',
        id: 'f-2',
        label: 'chat-1.json'
      }]
    }],
    conflictSummary: [{
      fieldKey: 'school_name',
      title: 'School name conflict',
      pendingCount: 2,
      distinctValues: ['北京大学', '清华大学'],
      displayType: 'open_conflict'
    }],
    coverageGaps: [{
      gapKey: 'work.empty',
      title: 'Work coverage gap',
      detail: 'No approved work facts yet.',
      displayType: 'coverage_gap'
    }],
    reviewShortcuts: [{
      label: 'Open school_name conflicts',
      canonicalPersonId: 'cp-1',
      fieldKey: 'school_name',
      hasConflict: true,
      queueItemId: 'rq-1'
    }],
    evidenceBacktrace: [{
      kind: 'file',
      id: 'f-1',
      label: 'transcript-1.pdf'
    }]
  }
}

describe('personAgentFactMemoryService', () => {
  it('projects dossier facts, timeline, relationships, conflicts, and gaps into fact-memory rows', () => {
    const rows = buildPersonAgentFactMemoryProjection({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      dossier: createPersonDossierFixture()
    })
    const factRow = rows.find((row) => row.memoryKey === 'education.school_name')
    const timelineRow = rows.find((row) => row.memoryKey === 'timeline.event-1')
    const relationshipRow = rows.find((row) => row.memoryKey === 'relationship.cp-2')
    const conflictRow = rows.find((row) => row.memoryKey === 'conflict.school_name')
    const coverageRow = rows.find((row) => row.memoryKey === 'coverage.work.empty')

    expect(rows).toHaveLength(5)
    expect(new Set(rows.map((row) => row.memoryKind))).toEqual(new Set([
      'fact',
      'timeline',
      'relationship',
      'conflict',
      'coverage_gap'
    ]))

    expect(factRow).toMatchObject({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      memoryKey: 'education.school_name',
      sectionKey: 'education',
      displayLabel: 'School Name',
      summaryValue: '北京大学',
      memoryKind: 'fact',
      conflictState: 'none'
    })
    expect(factRow?.sourceRefs).toEqual(expect.arrayContaining([
        { kind: 'file', id: 'f-1', label: 'transcript-1.pdf' },
        { kind: 'evidence', id: 'ee-1', label: 'ee-1' },
        { kind: 'candidate', id: 'fc-1', label: 'fc-1' },
        { kind: 'journal', id: 'journal-1', label: 'journal-1' }
      ]))

    expect(timelineRow).toMatchObject({
      memoryKey: 'timeline.event-1',
      sectionKey: 'timeline',
      displayLabel: 'Trip planning',
      memoryKind: 'timeline',
      freshnessAt: '2026-03-13T08:30:00.000Z'
    })

    expect(relationshipRow).toMatchObject({
      memoryKey: 'relationship.cp-2',
      sectionKey: 'relationship',
      displayLabel: 'Bob Li',
      memoryKind: 'relationship',
      summaryValue: 'friend; shared evidence files: 2'
    })

    expect(conflictRow).toMatchObject({
      memoryKey: 'conflict.school_name',
      sectionKey: 'conflict',
      memoryKind: 'conflict',
      conflictState: 'open'
    })
    expect(conflictRow?.sourceRefs).toEqual([{
      kind: 'review',
      id: 'rq-1',
      label: 'Open school_name conflicts'
    }])

    expect(coverageRow).toMatchObject({
      memoryKey: 'coverage.work.empty',
      sectionKey: 'coverage',
      memoryKind: 'coverage_gap',
      summaryValue: 'No approved work facts yet.',
      conflictState: 'none',
      sourceRefs: []
    })

    expect(rows.every((row) => typeof row.sourceHash === 'string' && row.sourceHash.length > 10)).toBe(true)
  })

  it('syncs projected fact memory into persistence and exposes a compact summary', () => {
    const db = setupDatabase()
    seedCanonicalPerson(db, {
      canonicalPersonId: 'cp-1',
      displayName: 'Alice Chen'
    })

    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: 52,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 0,
      interactionVersion: 0
    })

    const result = syncPersonAgentFactMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      dossier: createPersonDossierFixture()
    })

    expect(result.didChange).toBe(true)
    expect(result.factsVersion).toBe(1)
    expect(result.records).toHaveLength(5)

    const storedRows = listPersonAgentFactMemories(db, {
      personAgentId: personAgent.personAgentId
    })
    expect(storedRows).toHaveLength(5)

    const summary = getPersonAgentFactMemorySummary(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(summary).toMatchObject({
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      factsVersion: 1,
      counts: {
        facts: 1,
        timeline: 1,
        relationships: 1,
        conflicts: 1,
        coverageGaps: 1
      }
    })
    if (!summary) {
      throw new Error('Expected fact memory summary to exist')
    }
    expect(summary.facts[0]?.memoryKey).toBe('education.school_name')
    expect(summary.conflicts[0]?.conflictState).toBe('open')
    expect(summary.coverageGaps[0]?.memoryKey).toBe('coverage.work.empty')

    db.close()
  })

  it('skips rewriting fact-memory rows when source hashes have not changed', () => {
    const db = setupDatabase()
    seedCanonicalPerson(db, {
      canonicalPersonId: 'cp-1',
      displayName: 'Alice Chen'
    })

    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: 52,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 0,
      interactionVersion: 0
    })

    const firstSync = syncPersonAgentFactMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      dossier: createPersonDossierFixture()
    })
    const firstRows = new Map(
      listPersonAgentFactMemories(db, {
        personAgentId: personAgent.personAgentId
      }).map((row) => [row.memoryKey, row])
    )

    const secondSync = syncPersonAgentFactMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      dossier: createPersonDossierFixture()
    })
    const secondRows = new Map(
      listPersonAgentFactMemories(db, {
        personAgentId: personAgent.personAgentId
      }).map((row) => [row.memoryKey, row])
    )
    const refreshedAgent = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: 'cp-1'
    })

    expect(firstSync.didChange).toBe(true)
    expect(secondSync.didChange).toBe(false)
    expect(firstSync.factsVersion).toBe(1)
    expect(secondSync.factsVersion).toBe(1)
    expect(refreshedAgent?.factsVersion).toBe(1)
    expect(secondRows.get('education.school_name')?.memoryId).toBe(firstRows.get('education.school_name')?.memoryId)
    expect(secondRows.get('education.school_name')?.updatedAt).toBe(firstRows.get('education.school_name')?.updatedAt)

    db.close()
  })
})
