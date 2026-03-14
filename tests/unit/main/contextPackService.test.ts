import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  GroupPortrait,
  PersonDossier
} from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  buildGroupContextPack,
  buildGroupContextPackFromPortrait,
  buildPersonContextPack,
  buildPersonContextPackFromDossier,
  exportContextPackToDirectory
} from '../../../src/main/services/contextPackService'

function createPersonDossierFixture(): PersonDossier {
  return {
    person: {
      id: 'cp-1',
      primaryDisplayName: 'Alice Chen',
      normalizedName: 'alice chen',
      aliasCount: 1,
      firstSeenAt: '2026-03-13T00:00:00.000Z',
      lastSeenAt: '2026-03-13T00:00:00.000Z',
      status: 'approved',
      evidenceCount: 3,
      manualLabels: ['college-friend'],
      aliases: [{
        displayName: 'Alice C.',
        sourceType: 'manual',
        confidence: 1
      }],
      approvedProfile: {
        education: [{
          id: 'attr-1',
          canonicalPersonId: 'cp-1',
          attributeGroup: 'education',
          attributeKey: 'school_name',
          valueJson: '{"value":"北京大学"}',
          displayValue: '北京大学',
          sourceFileId: 'f-1',
          sourceEvidenceId: null,
          sourceCandidateId: null,
          provenance: {},
          confidence: 1,
          status: 'active',
          approvedJournalId: 'journal-1',
          createdAt: '2026-03-13T00:00:00.000Z',
          updatedAt: '2026-03-13T00:00:00.000Z'
        }]
      }
    },
    identityCard: {
      primaryDisplayName: 'Alice Chen',
      aliases: ['Alice C.'],
      manualLabels: ['college-friend'],
      firstSeenAt: '2026-03-13T00:00:00.000Z',
      lastSeenAt: '2026-03-13T00:00:00.000Z',
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
        }]
      }]
    }, {
      sectionKey: 'work',
      title: 'Work',
      displayType: 'coverage_gap',
      items: [{
        id: 'gap-1',
        label: 'coverage_gap',
        value: 'No approved work facts yet.',
        displayType: 'coverage_gap',
        evidenceRefs: []
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
    }, {
      kind: 'journal',
      id: 'journal-1',
      label: 'journal-1'
    }]
  }
}

function createGroupPortraitFixture(): GroupPortrait {
  return {
    anchorPersonId: 'cp-1',
    title: 'Alice Chen Group Portrait',
    members: [{
      personId: 'cp-1',
      displayName: 'Alice Chen',
      sharedFileCount: 2,
      sharedEventCount: 1,
      connectionCount: 1,
      manualLabel: null,
      isAnchor: true,
      displayType: 'approved_fact'
    }, {
      personId: 'cp-2',
      displayName: 'Bob Li',
      sharedFileCount: 2,
      sharedEventCount: 1,
      connectionCount: 1,
      manualLabel: 'friend',
      isAnchor: false,
      displayType: 'derived_summary'
    }],
    relationshipDensity: {
      memberCount: 2,
      actualEdgeCount: 1,
      possibleEdgeCount: 1,
      densityRatio: 1,
      displayType: 'derived_summary'
    },
    sharedEvents: [{
      eventId: 'event-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T08:00:00.000Z',
      timeEnd: '2026-03-13T08:30:00.000Z',
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      evidenceRefs: [{
        kind: 'file',
        id: 'f-2',
        label: 'chat-1.json'
      }],
      displayType: 'approved_fact'
    }],
    timelineWindows: [{
      windowId: 'window-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T08:00:00.000Z',
      timeEnd: '2026-03-13T08:30:00.000Z',
      eventCount: 1,
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      eventTitles: ['Trip planning'],
      displayType: 'approved_fact'
    }],
    narrativeSummary: [{
      summaryId: 'summary-1',
      text: 'Alice Chen anchors a 2-person group with Bob Li.',
      displayType: 'derived_summary'
    }],
    sharedEvidenceSources: [{
      fileId: 'f-2',
      fileName: 'chat-1.json',
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      displayType: 'approved_fact'
    }],
    replayShortcuts: [{
      journalId: 'journal-1',
      label: 'Safe batch approve · Bob Li · school_name · 2 items',
      query: 'journal-1',
      displayType: 'approved_fact'
    }],
    centralPeople: [{
      personId: 'cp-1',
      displayName: 'Alice Chen',
      connectionCount: 1,
      sharedFileCount: 2,
      sharedEventCount: 1,
      displayType: 'derived_summary'
    }],
    ambiguitySummary: {
      pendingReviewCount: 2,
      conflictGroupCount: 1,
      affectedMemberCount: 1,
      displayType: 'open_conflict',
      reviewShortcut: {
        label: 'Open school_name conflicts',
        canonicalPersonId: 'cp-2',
        fieldKey: 'school_name',
        hasConflict: true,
        queueItemId: 'rq-1'
      }
    }
  }
}

describe('contextPackService', () => {
  it('builds approved-only person packs without derived overview sections', () => {
    const pack = buildPersonContextPackFromDossier({
      dossier: createPersonDossierFixture(),
      mode: 'approved_only'
    })

    expect(pack.mode).toBe('approved_only')
    expect(pack.sections.some((section) => section.displayType === 'derived_summary')).toBe(false)
    expect(pack.ambiguity[0]?.displayType).toBe('open_conflict')
  })

  it('builds approved-plus-derived person packs with overview and timeline data', () => {
    const pack = buildPersonContextPackFromDossier({
      dossier: createPersonDossierFixture(),
      mode: 'approved_plus_derived'
    })

    expect(pack.sections.some((section) => section.sectionKey === 'overview')).toBe(true)
    expect(pack.timelineHighlights[0]?.title).toBe('Trip planning')
    expect(pack.relationships[0]?.label).toBe('Bob Li')
  })

  it('builds group packs with members, timeline, narrative, and ambiguity', () => {
    const pack = buildGroupContextPackFromPortrait({
      portrait: createGroupPortraitFixture(),
      mode: 'approved_plus_derived'
    })

    expect(pack.members).toHaveLength(2)
    expect(pack.timelineWindows[0]?.title).toBe('Trip planning')
    expect(pack.narrative[0]?.text).toContain('Alice Chen')
    expect(pack.ambiguity[0]?.displayType).toBe('open_conflict')
  })

  it('exports context packs as deterministic json artifacts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-context-pack-export-'))
    const result = exportContextPackToDirectory({
      destinationRoot: root,
      pack: buildPersonContextPackFromDossier({
        dossier: createPersonDossierFixture(),
        mode: 'approved_plus_derived'
      })
    })

    expect(result.status).toBe('exported')
    expect(fs.existsSync(result.filePath)).toBe(true)
    expect(fs.readFileSync(result.filePath, 'utf8')).toContain('"formatVersion": "phase8c1"')
  })

  it('returns null when the requested person or group does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-context-pack-empty-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    runMigrations(db)

    expect(buildPersonContextPack(db, { canonicalPersonId: 'missing' })).toBeNull()
    expect(buildGroupContextPack(db, { anchorPersonId: 'missing' })).toBeNull()

    db.close()
  })
})
