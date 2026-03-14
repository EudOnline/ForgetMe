import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  GroupPortraitBrowseSummary,
  GroupPortrait,
  GroupPortraitAmbiguitySummary,
  GroupPortraitCentralPersonSummary,
  GroupPortraitMemberSummary,
  GroupPortraitNarrativeSummary,
  GroupPortraitReplayShortcut,
  GroupPortraitRelationshipDensity,
  GroupPortraitSharedEvidenceSource,
  GroupPortraitSharedEvent,
  GroupPortraitTimelineWindow,
  PersonDossierConflictSummary,
  PersonDossierGapSummary,
  PersonDossierReviewShortcut
} from '../../../src/shared/archiveContracts'
import { DOSSIER_DISPLAY_TYPES } from '../../../src/shared/archiveContracts'

describe('phase-seven dossier contracts', () => {
  it('exports stable dossier display types', () => {
    expect(DOSSIER_DISPLAY_TYPES).toEqual([
      'approved_fact',
      'derived_summary',
      'open_conflict',
      'coverage_gap'
    ])
  })

  it('exports conflict, gap, and shortcut dossier summary shapes', () => {
    const conflictSummary: PersonDossierConflictSummary = {
      fieldKey: 'school_name',
      title: 'School name conflict',
      pendingCount: 2,
      distinctValues: ['北京大学', '清华大学'],
      displayType: 'open_conflict'
    }
    const gapSummary: PersonDossierGapSummary = {
      gapKey: 'timeline.empty',
      title: 'Timeline coverage gap',
      detail: 'No approved timeline highlights yet.',
      displayType: 'coverage_gap'
    }
    const shortcut: PersonDossierReviewShortcut = {
      label: 'Open school_name conflicts',
      canonicalPersonId: 'cp-1',
      fieldKey: 'school_name',
      hasConflict: true
    }

    expect(conflictSummary.displayType).toBe('open_conflict')
    expect(gapSummary.displayType).toBe('coverage_gap')
    expect(shortcut).toMatchObject({
      canonicalPersonId: 'cp-1',
      fieldKey: 'school_name',
      hasConflict: true
    })

    expectTypeOf(conflictSummary.pendingCount).toEqualTypeOf<number>()
    expectTypeOf(gapSummary.gapKey).toEqualTypeOf<string>()
    expectTypeOf(shortcut.label).toEqualTypeOf<string>()
  })

  it('exports group portrait contract shapes', () => {
    const member: GroupPortraitMemberSummary = {
      personId: 'cp-1',
      displayName: 'Alice Chen',
      sharedFileCount: 3,
      sharedEventCount: 1,
      connectionCount: 2,
      manualLabel: null,
      isAnchor: true,
      displayType: 'approved_fact'
    }
    const browseSummary: GroupPortraitBrowseSummary = {
      anchorPersonId: 'cp-1',
      anchorDisplayName: 'Alice Chen',
      title: 'Alice Chen Group Portrait',
      memberCount: 3,
      sharedEventCount: 1,
      sharedEvidenceSourceCount: 2,
      densityRatio: 2 / 3,
      membersPreview: ['Alice Chen', 'Bob Li', 'Carol Xu'],
      displayType: 'derived_summary'
    }
    const density: GroupPortraitRelationshipDensity = {
      memberCount: 3,
      actualEdgeCount: 2,
      possibleEdgeCount: 3,
      densityRatio: 2 / 3,
      displayType: 'derived_summary'
    }
    const sharedEvent: GroupPortraitSharedEvent = {
      eventId: 'ec-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T00:00:00.000Z',
      timeEnd: '2026-03-13T01:00:00.000Z',
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      evidenceRefs: [],
      displayType: 'approved_fact'
    }
    const timelineWindow: GroupPortraitTimelineWindow = {
      windowId: 'window:ec-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T00:00:00.000Z',
      timeEnd: '2026-03-13T01:00:00.000Z',
      eventCount: 1,
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      eventTitles: ['Trip planning'],
      displayType: 'approved_fact'
    }
    const centralPerson: GroupPortraitCentralPersonSummary = {
      personId: 'cp-1',
      displayName: 'Alice Chen',
      connectionCount: 2,
      sharedFileCount: 3,
      sharedEventCount: 1,
      displayType: 'derived_summary'
    }
    const sharedEvidenceSource: GroupPortraitSharedEvidenceSource = {
      fileId: 'file-1',
      fileName: 'chat-1.json',
      memberCount: 2,
      members: ['Alice Chen', 'Bob Li'],
      displayType: 'approved_fact'
    }
    const narrativeSummary: GroupPortraitNarrativeSummary = {
      summaryId: 'summary-1',
      text: 'Alice Chen anchors a 3-person group with Bob Li and Carol Xu.',
      displayType: 'derived_summary'
    }
    const replayShortcut: GroupPortraitReplayShortcut = {
      journalId: 'journal-1',
      label: 'Safe batch approve · Bob Li · school_name · 2 items',
      query: 'journal-1',
      displayType: 'approved_fact'
    }
    const ambiguity: GroupPortraitAmbiguitySummary = {
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
    const portrait: GroupPortrait = {
      anchorPersonId: 'cp-1',
      title: 'Alice Chen group portrait',
      members: [member],
      relationshipDensity: density,
      sharedEvents: [sharedEvent],
      timelineWindows: [timelineWindow],
      narrativeSummary: [narrativeSummary],
      sharedEvidenceSources: [sharedEvidenceSource],
      replayShortcuts: [replayShortcut],
      centralPeople: [centralPerson],
      ambiguitySummary: ambiguity
    }

    expect(member.displayType).toBe('approved_fact')
    expect(browseSummary.displayType).toBe('derived_summary')
    expect(density.displayType).toBe('derived_summary')
    expect(sharedEvent.displayType).toBe('approved_fact')
    expect(timelineWindow.displayType).toBe('approved_fact')
    expect(narrativeSummary.displayType).toBe('derived_summary')
    expect(sharedEvidenceSource.displayType).toBe('approved_fact')
    expect(replayShortcut.displayType).toBe('approved_fact')
    expect(centralPerson.displayType).toBe('derived_summary')
    expect(ambiguity.displayType).toBe('open_conflict')
    expect(portrait.members[0]?.isAnchor).toBe(true)
    expect(ambiguity.reviewShortcut).toMatchObject({
      canonicalPersonId: 'cp-2',
      fieldKey: 'school_name',
      hasConflict: true
    })

    expectTypeOf(portrait.members).toEqualTypeOf<GroupPortraitMemberSummary[]>()
    expectTypeOf(browseSummary.membersPreview).toEqualTypeOf<string[]>()
    expectTypeOf(portrait.relationshipDensity.densityRatio).toEqualTypeOf<number>()
    expectTypeOf(portrait.timelineWindows).toEqualTypeOf<GroupPortraitTimelineWindow[]>()
    expectTypeOf(portrait.narrativeSummary).toEqualTypeOf<GroupPortraitNarrativeSummary[]>()
    expectTypeOf(portrait.sharedEvidenceSources).toEqualTypeOf<GroupPortraitSharedEvidenceSource[]>()
    expectTypeOf(portrait.replayShortcuts).toEqualTypeOf<GroupPortraitReplayShortcut[]>()
    expectTypeOf<ArchiveApi['listGroupPortraits']>().toEqualTypeOf<() => Promise<GroupPortraitBrowseSummary[]>>()
    expectTypeOf<ArchiveApi['getGroupPortrait']>().toEqualTypeOf<(canonicalPersonId: string) => Promise<GroupPortrait | null>>()
  })
})
