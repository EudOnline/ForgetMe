import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonDetailPage } from '../../../src/renderer/pages/PersonDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PersonDetailPage dossier baseline', () => {
  it('renders dossier sections, conflicts, gaps, and review shortcut actions', async () => {
    const onOpenEvidenceFile = vi.fn()
    const onOpenReviewWorkbench = vi.fn()
    const onOpenGroupPortrait = vi.fn()
    const onOpenMemoryWorkspace = vi.fn()

    vi.stubGlobal('window', {
      archiveApi: {
        getPersonDossier: vi.fn().mockResolvedValue({
          person: {
            id: 'cp-1',
            primaryDisplayName: 'Alice Chen',
            normalizedName: 'alice chen',
            aliasCount: 1,
            firstSeenAt: null,
            lastSeenAt: null,
            status: 'approved',
            evidenceCount: 1,
            manualLabels: [],
            aliases: [],
            approvedFields: [],
            approvedProfile: {}
          },
          identityCard: {
            primaryDisplayName: 'Alice Chen',
            aliases: ['Alice C.'],
            manualLabels: ['college-friend'],
            firstSeenAt: null,
            lastSeenAt: null,
            evidenceCount: 1,
            displayType: 'approved_fact'
          },
          thematicSections: [{
            sectionKey: 'education',
            title: 'Education',
            displayType: 'approved_fact',
            items: [{
              id: 'attr-1',
              label: 'school_name',
              value: '北京大学',
              displayType: 'approved_fact',
              evidenceRefs: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
            }]
          }],
          timelineHighlights: [{
            eventId: 'ec-1',
            title: 'Approved event',
            timeStart: '2026-03-12T10:00:00.000Z',
            timeEnd: '2026-03-12T10:05:00.000Z',
            summary: 'approved summary',
            displayType: 'approved_fact',
            evidenceRefs: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
          }],
          relationshipSummary: [{
            personId: 'cp-2',
            displayName: 'Bob Li',
            sharedFileCount: 1,
            manualLabel: 'friend',
            displayType: 'approved_fact',
            evidenceRefs: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
          }],
          conflictSummary: [{
            fieldKey: 'school_name',
            title: 'School name conflict',
            pendingCount: 2,
            distinctValues: ['北京大学', '清华大学'],
            displayType: 'open_conflict'
          }],
          coverageGaps: [{
            gapKey: 'timeline.empty',
            title: 'Timeline coverage gap',
            detail: 'No approved timeline highlights yet.',
            displayType: 'coverage_gap'
          }],
          reviewShortcuts: [{
            label: 'Open school_name conflicts',
            canonicalPersonId: 'cp-1',
            fieldKey: 'school_name',
            hasConflict: true,
            queueItemId: 'rq-3'
          }],
          evidenceBacktrace: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
        })
      }
    })

    render(
      <PersonDetailPage
        canonicalPersonId="cp-1"
        onOpenEvidenceFile={onOpenEvidenceFile}
        onOpenReviewWorkbench={onOpenReviewWorkbench}
        onOpenGroupPortrait={onOpenGroupPortrait}
        onOpenMemoryWorkspace={onOpenMemoryWorkspace}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()
    expect(screen.getByText('Identity Card')).toBeInTheDocument()
    expect(screen.getByText('Thematic Portrait')).toBeInTheDocument()
    expect(screen.getByText('Timeline Highlights')).toBeInTheDocument()
    expect(screen.getByText('Relationship Context')).toBeInTheDocument()
    expect(screen.getByText('Conflicts & Gaps')).toBeInTheDocument()
    expect(screen.getByText(/School name conflict/)).toBeInTheDocument()
    expect(screen.getByText('Evidence Backtrace')).toBeInTheDocument()
    expect(screen.getAllByText(/北京大学/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'transcript.pdf' })[0]!)
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
    fireEvent.click(screen.getByRole('button', { name: 'Open school_name conflicts' }))
    expect(onOpenReviewWorkbench).toHaveBeenCalledWith(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      fieldKey: 'school_name',
      hasConflict: true,
      queueItemId: 'rq-3'
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Open group portrait' }))
    expect(onOpenGroupPortrait).toHaveBeenCalledWith('cp-1')
    fireEvent.click(screen.getByRole('button', { name: 'Open memory workspace' }))
    expect(onOpenMemoryWorkspace).toHaveBeenCalledWith({
      kind: 'person',
      canonicalPersonId: 'cp-1'
    })
  })

  it('renders coverage-gap sections explicitly instead of blank blocks', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        getPersonDossier: vi.fn().mockResolvedValue({
          person: {
            id: 'cp-empty',
            primaryDisplayName: 'Sparse Person',
            normalizedName: 'sparse person',
            aliasCount: 0,
            firstSeenAt: null,
            lastSeenAt: null,
            status: 'approved',
            evidenceCount: 0,
            manualLabels: [],
            aliases: [],
            approvedFields: [],
            approvedProfile: {}
          },
          identityCard: {
            primaryDisplayName: 'Sparse Person',
            aliases: [],
            manualLabels: [],
            firstSeenAt: null,
            lastSeenAt: null,
            evidenceCount: 0,
            displayType: 'approved_fact'
          },
          thematicSections: [{
            sectionKey: 'education',
            title: 'Education',
            displayType: 'coverage_gap',
            items: [{
              id: 'education:coverage-gap',
              label: 'coverage_gap',
              value: 'No approved education facts yet.',
              displayType: 'coverage_gap',
              evidenceRefs: []
            }]
          }],
          timelineHighlights: [],
          relationshipSummary: [],
          conflictSummary: [],
          coverageGaps: [{
            gapKey: 'timeline.empty',
            title: 'Timeline coverage gap',
            detail: 'No approved timeline highlights yet.',
            displayType: 'coverage_gap'
          }],
          reviewShortcuts: [],
          evidenceBacktrace: []
        })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-empty" />)

    expect(await screen.findByText('No approved education facts yet.')).toBeInTheDocument()
  })

  it('exports a person context pack with the selected mode', async () => {
    const selectContextPackExportDestination = vi.fn().mockResolvedValue('/tmp/context-pack-exports')
    const exportPersonContextPack = vi.fn().mockResolvedValue({
      status: 'exported',
      filePath: '/tmp/context-pack-exports/person-cp-1-context-pack.json',
      fileName: 'person-cp-1-context-pack.json',
      sha256: 'hash-person',
      exportedAt: '2026-03-14T00:00:00.000Z',
      mode: 'approved_only',
      scope: {
        kind: 'person',
        canonicalPersonId: 'cp-1'
      }
    })

    vi.stubGlobal('window', {
      archiveApi: {
        getPersonDossier: vi.fn().mockResolvedValue({
          person: {
            id: 'cp-1',
            primaryDisplayName: 'Alice Chen',
            normalizedName: 'alice chen',
            aliasCount: 1,
            firstSeenAt: null,
            lastSeenAt: null,
            status: 'approved',
            evidenceCount: 1,
            manualLabels: [],
            aliases: [],
            approvedFields: [],
            approvedProfile: {}
          },
          identityCard: {
            primaryDisplayName: 'Alice Chen',
            aliases: ['Alice C.'],
            manualLabels: ['college-friend'],
            firstSeenAt: null,
            lastSeenAt: null,
            evidenceCount: 1,
            displayType: 'approved_fact'
          },
          thematicSections: [],
          timelineHighlights: [],
          relationshipSummary: [],
          conflictSummary: [],
          coverageGaps: [],
          reviewShortcuts: [],
          evidenceBacktrace: []
        }),
        selectContextPackExportDestination,
        exportPersonContextPack
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-1" />)

    expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()

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
    expect(exportPersonContextPack).toHaveBeenCalledWith({
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-pack-exports',
      mode: 'approved_only'
    })
    expect(await screen.findByText('Exported person-cp-1-context-pack.json')).toBeInTheDocument()
  })
})
