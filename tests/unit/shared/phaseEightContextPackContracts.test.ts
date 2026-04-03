import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  ContextPackAmbiguitySummary,
  ContextPackExportMode,
  ContextPackExportResult,
  ContextPackNarrativeEntry,
  ContextPackRelationshipEntry,
  ContextPackScope,
  ContextPackSection,
  ContextPackSourceRef,
  ContextPackTimelineEntry,
  GroupContextPack,
  PersonContextPack
} from '../../../src/shared/archiveContracts'
import {
  contextPackDestinationSchema,
  contextPackExportModeSchema,
  groupContextPackExportInputSchema,
  groupContextPackInputSchema,
  personContextPackExportInputSchema,
  personContextPackInputSchema
} from '../../../src/shared/schemas/workspace'

describe('phase-eight context pack contracts', () => {
  it('exports person and group context pack shapes', () => {
    const sourceRef: ContextPackSourceRef = {
      kind: 'file',
      id: 'f-1',
      label: 'chat-1.json'
    }
    const section: ContextPackSection = {
      sectionKey: 'education',
      title: 'Education',
      displayType: 'approved_fact',
      items: [{
        id: 'item-1',
        label: 'school_name',
        value: '北京大学',
        displayType: 'approved_fact',
        sourceRefs: [sourceRef]
      }]
    }
    const timelineEntry: ContextPackTimelineEntry = {
      id: 'timeline-1',
      title: 'Trip planning',
      timeStart: '2026-03-13T08:00:00.000Z',
      timeEnd: '2026-03-13T08:30:00.000Z',
      summary: 'shared planning',
      displayType: 'approved_fact',
      sourceRefs: [sourceRef]
    }
    const relationship: ContextPackRelationshipEntry = {
      personId: 'cp-2',
      label: 'Bob Li',
      sharedFileCount: 2,
      displayType: 'approved_fact',
      sourceRefs: [sourceRef]
    }
    const ambiguity: ContextPackAmbiguitySummary = {
      id: 'ambiguity-1',
      title: 'School conflict',
      detail: 'Open school_name conflict remains.',
      displayType: 'open_conflict',
      sourceRefs: [sourceRef]
    }
    const narrative: ContextPackNarrativeEntry = {
      id: 'narrative-1',
      text: 'Alice Chen anchors the group.',
      displayType: 'derived_summary',
      sourceRefs: [sourceRef]
    }
    const personScope: ContextPackScope = { kind: 'person', canonicalPersonId: 'cp-1' }
    const groupScope: ContextPackScope = { kind: 'group', anchorPersonId: 'cp-1' }
    const mode: ContextPackExportMode = 'approved_plus_derived'

    const personPack: PersonContextPack = {
      formatVersion: 'phase8c1',
      exportedAt: null,
      mode,
      scope: personScope,
      title: 'Person Context Pack · Alice Chen',
      identity: {
        primaryDisplayName: 'Alice Chen',
        aliases: ['Alice C.'],
        manualLabels: ['college-friend'],
        firstSeenAt: '2026-03-13T00:00:00.000Z',
        lastSeenAt: '2026-03-13T00:00:00.000Z',
        evidenceCount: 3
      },
      sections: [section],
      timelineHighlights: [timelineEntry],
      relationships: [relationship],
      ambiguity: [ambiguity],
      sourceRefs: [sourceRef],
      shareEnvelope: {
        requestShape: 'local_json_context_pack',
        policyKey: 'context_pack.local_export_baseline'
      }
    }

    const groupPack: GroupContextPack = {
      formatVersion: 'phase8c1',
      exportedAt: null,
      mode,
      scope: groupScope,
      title: 'Group Context Pack · Alice Chen Group',
      members: [{
        personId: 'cp-1',
        displayName: 'Alice Chen',
        isAnchor: true,
        sharedFileCount: 2,
        sharedEventCount: 1,
        displayType: 'approved_fact'
      }],
      timelineWindows: [timelineEntry],
      sharedEvidenceSources: [sourceRef],
      narrative: [narrative],
      ambiguity: [ambiguity],
      sourceRefs: [sourceRef],
      shareEnvelope: {
        requestShape: 'local_json_context_pack',
        policyKey: 'context_pack.local_export_baseline'
      }
    }

    const exportResult: ContextPackExportResult = {
      status: 'exported',
      filePath: '/tmp/person-cp-1-context-pack.json',
      fileName: 'person-cp-1-context-pack.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-14T00:00:00.000Z',
      mode,
      scope: personScope
    }

    expect(personPack.sections[0]?.items[0]?.value).toBe('北京大学')
    expect(groupPack.members[0]?.isAnchor).toBe(true)
    expect(exportResult.scope.kind).toBe('person')

    expectTypeOf<ArchiveApi['selectContextPackExportDestination']>().toEqualTypeOf<
      () => Promise<string | null>
    >()
    expectTypeOf<ArchiveApi['getPersonContextPack']>().toEqualTypeOf<
      (input: { canonicalPersonId: string; mode?: ContextPackExportMode }) => Promise<PersonContextPack | null>
    >()
    expectTypeOf<ArchiveApi['getGroupContextPack']>().toEqualTypeOf<
      (input: { anchorPersonId: string; mode?: ContextPackExportMode }) => Promise<GroupContextPack | null>
    >()
    expectTypeOf<ArchiveApi['exportPersonContextPack']>().toEqualTypeOf<
      (input: { canonicalPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
    >()
    expectTypeOf<ArchiveApi['exportGroupContextPack']>().toEqualTypeOf<
      (input: { anchorPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
    >()
  })

  it('exports context pack input schemas', () => {
    expect(contextPackExportModeSchema.parse('approved_only')).toBe('approved_only')
    expect(contextPackDestinationSchema.parse({ destinationRoot: '/tmp/context-packs' })).toEqual({
      destinationRoot: '/tmp/context-packs'
    })

    expect(personContextPackInputSchema.parse({
      canonicalPersonId: 'cp-1',
      mode: 'approved_plus_derived'
    })).toEqual({
      canonicalPersonId: 'cp-1',
      mode: 'approved_plus_derived'
    })

    expect(groupContextPackInputSchema.parse({
      anchorPersonId: 'cp-1'
    })).toEqual({
      anchorPersonId: 'cp-1'
    })

    expect(personContextPackExportInputSchema.parse({
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs',
      mode: 'approved_only'
    })).toEqual({
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs',
      mode: 'approved_only'
    })

    expect(groupContextPackExportInputSchema.parse({
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs'
    })).toEqual({
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs'
    })
  })
})
