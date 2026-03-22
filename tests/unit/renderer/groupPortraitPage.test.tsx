import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupPortraitPage } from '../../../src/renderer/pages/GroupPortraitPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GroupPortraitPage', () => {
  it('renders browse cards when no anchor person is selected', async () => {
    const onOpenGroupPortrait = vi.fn()

    vi.stubGlobal('window', {
      archiveApi: {
        listGroupPortraits: vi.fn().mockResolvedValue([
          {
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
        ]),
        getGroupPortrait: vi.fn().mockResolvedValue(null)
      }
    })

    render(
      <GroupPortraitPage
        canonicalPersonId={null}
        onOpenGroupPortrait={onOpenGroupPortrait}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Group Portraits' })).toBeInTheDocument()
    expect(screen.getByText('Alice Chen Group Portrait')).toBeInTheDocument()
    expect(screen.getByText(/3 members · 1 shared events · 2 shared sources/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alice Chen Group Portrait' }))
    expect(onOpenGroupPortrait).toHaveBeenCalledWith('cp-1')
  })

  it('renders the baseline group portrait sections', async () => {
    const onOpenEvidenceFile = vi.fn()
    const onOpenPerson = vi.fn()
    const onOpenReviewWorkbench = vi.fn()
    const onOpenReplayHistory = vi.fn()
    const onOpenMemoryWorkspace = vi.fn()

    vi.stubGlobal('window', {
      archiveApi: {
        getGroupPortrait: vi.fn().mockResolvedValue({
          anchorPersonId: 'cp-1',
          title: 'Alice Chen Group Portrait',
          members: [
            {
              personId: 'cp-1',
              displayName: 'Alice Chen',
              sharedFileCount: 2,
              sharedEventCount: 1,
              connectionCount: 2,
              manualLabel: null,
              isAnchor: true,
              displayType: 'approved_fact'
            },
            {
              personId: 'cp-2',
              displayName: 'Bob Li',
              sharedFileCount: 1,
              sharedEventCount: 1,
              connectionCount: 1,
              manualLabel: 'friend',
              isAnchor: false,
              displayType: 'approved_fact'
            }
          ],
          relationshipDensity: {
            memberCount: 2,
            actualEdgeCount: 1,
            possibleEdgeCount: 1,
            densityRatio: 1,
            displayType: 'derived_summary'
          },
          sharedEvents: [
            {
              eventId: 'ec-1',
              title: 'Trip planning',
              timeStart: '2026-03-13T08:00:00.000Z',
              timeEnd: '2026-03-13T08:30:00.000Z',
              memberCount: 2,
              members: ['Alice Chen', 'Bob Li'],
              evidenceRefs: [{ kind: 'file', id: 'f-1', label: 'chat-1.json' }],
              displayType: 'approved_fact'
            }
          ],
          timelineWindows: [
            {
              windowId: 'window:ec-1',
              title: 'Trip planning',
              timeStart: '2026-03-13T08:00:00.000Z',
              timeEnd: '2026-03-13T08:30:00.000Z',
              eventCount: 1,
              memberCount: 2,
              members: ['Alice Chen', 'Bob Li'],
              eventTitles: ['Trip planning'],
              displayType: 'approved_fact'
            }
          ],
          narrativeSummary: [
            {
              summaryId: 'group-size',
              text: 'Alice Chen anchors a 2-person group with Bob Li.',
              displayType: 'derived_summary'
            },
            {
              summaryId: 'shared-evidence',
              text: 'The group shares 1 approved event and 1 shared evidence source.',
              displayType: 'derived_summary'
            },
            {
              summaryId: 'ambiguity',
              text: 'Review ambiguity remains: 2 pending items across 1 conflict group.',
              displayType: 'open_conflict'
            }
          ],
          sharedEvidenceSources: [
            {
              fileId: 'f-1',
              fileName: 'chat-1.json',
              memberCount: 2,
              members: ['Alice Chen', 'Bob Li'],
              displayType: 'approved_fact'
            }
          ],
          replayShortcuts: [
            {
              journalId: 'journal-1',
              label: 'Safe batch approve · Bob Li · school_name · 2 items',
              query: 'journal-1',
              displayType: 'approved_fact'
            }
          ],
          centralPeople: [
            {
              personId: 'cp-1',
              displayName: 'Alice Chen',
              connectionCount: 2,
              sharedFileCount: 2,
              sharedEventCount: 1,
              displayType: 'derived_summary'
            }
          ],
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
        })
      }
    })

    render(
      <GroupPortraitPage
        canonicalPersonId="cp-1"
        onOpenGroupPortrait={vi.fn()}
        onOpenEvidenceFile={onOpenEvidenceFile}
        onOpenPerson={onOpenPerson}
        onOpenReviewWorkbench={onOpenReviewWorkbench}
        onOpenReplayHistory={onOpenReplayHistory}
        onOpenMemoryWorkspace={onOpenMemoryWorkspace}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Group Portrait' })).toBeInTheDocument()
    expect(screen.getByText('Alice Chen Group Portrait')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getAllByText(/Alice Chen/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Open member Bob Li' }))
    expect(onOpenPerson).toHaveBeenCalledWith('cp-2')
    expect(screen.getByText('Relationship Density')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByText('Shared Events')).toBeInTheDocument()
    const sharedEventsSection = screen.getByRole('region', { name: 'Shared Events' })
    expect(within(sharedEventsSection).getByText(/Trip planning/)).toBeInTheDocument()
    fireEvent.click(within(sharedEventsSection).getByRole('button', { name: 'Open event evidence chat-1.json' }))
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
    expect(screen.getByText('Timeline Windows')).toBeInTheDocument()
    const timelineSection = screen.getByRole('region', { name: 'Timeline Windows' })
    expect(within(timelineSection).getByText(/1 events · 2 members/)).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Alice Chen anchors a 2-person group with Bob Li.')).toBeInTheDocument()
    expect(screen.getByText('Shared Evidence Sources')).toBeInTheDocument()
    const sharedEvidenceSection = screen.getByRole('region', { name: 'Shared Evidence Sources' })
    const evidenceButton = within(sharedEvidenceSection).getByRole('button', { name: 'chat-1.json' })
    fireEvent.click(evidenceButton)
    expect(onOpenEvidenceFile).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Replay Shortcuts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Safe batch approve · Bob Li · school_name · 2 items' }))
    expect(onOpenReplayHistory).toHaveBeenCalledWith(expect.objectContaining({
      journalId: 'journal-1',
      query: 'journal-1'
    }))
    expect(screen.getByText('Central People')).toBeInTheDocument()
    expect(screen.getByText('Unresolved Ambiguity')).toBeInTheDocument()
    expect(screen.getByText('Pending review: 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open school_name conflicts' }))
    expect(onOpenReviewWorkbench).toHaveBeenCalledWith(expect.objectContaining({
      canonicalPersonId: 'cp-2',
      fieldKey: 'school_name',
      queueItemId: 'rq-1'
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memory workspace' }))
    expect(onOpenMemoryWorkspace).toHaveBeenCalledWith({
      kind: 'group',
      anchorPersonId: 'cp-1'
    })
  })

  it('exports a group context pack with the selected mode', async () => {
    const selectContextPackExportDestination = vi.fn().mockResolvedValue('/tmp/context-pack-exports')
    const exportGroupContextPack = vi.fn().mockResolvedValue({
      status: 'exported',
      filePath: '/tmp/context-pack-exports/group-cp-1-context-pack.json',
      fileName: 'group-cp-1-context-pack.json',
      sha256: 'hash-group',
      exportedAt: '2026-03-14T00:00:00.000Z',
      mode: 'approved_only',
      scope: {
        kind: 'group',
        anchorPersonId: 'cp-1'
      }
    })

    vi.stubGlobal('window', {
      archiveApi: {
        getGroupPortrait: vi.fn().mockResolvedValue({
          anchorPersonId: 'cp-1',
          title: 'Alice Chen Group Portrait',
          members: [
            {
              personId: 'cp-1',
              displayName: 'Alice Chen',
              sharedFileCount: 2,
              sharedEventCount: 1,
              connectionCount: 2,
              manualLabel: null,
              isAnchor: true,
              displayType: 'approved_fact'
            }
          ],
          relationshipDensity: {
            memberCount: 1,
            actualEdgeCount: 0,
            possibleEdgeCount: 0,
            densityRatio: 0,
            displayType: 'derived_summary'
          },
          sharedEvents: [],
          timelineWindows: [],
          narrativeSummary: [],
          sharedEvidenceSources: [],
          replayShortcuts: [],
          centralPeople: [],
          ambiguitySummary: {
            pendingReviewCount: 0,
            conflictGroupCount: 0,
            affectedMemberCount: 0,
            displayType: 'coverage_gap',
            reviewShortcut: null
          }
        }),
        selectContextPackExportDestination,
        exportGroupContextPack
      }
    })

    render(<GroupPortraitPage canonicalPersonId="cp-1" />)

    expect(await screen.findByRole('heading', { name: 'Group Portrait' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Context pack mode'), {
      target: { value: 'approved_only' }
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose context pack destination' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export context pack' }))
    })

    expect(selectContextPackExportDestination).toHaveBeenCalledTimes(1)
    expect(exportGroupContextPack).toHaveBeenCalledWith({
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-pack-exports',
      mode: 'approved_only'
    })
    expect(await screen.findByText('Exported group-cp-1-context-pack.json')).toBeInTheDocument()
  })
})
