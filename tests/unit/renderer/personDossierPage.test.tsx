import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonDetailPage } from '../../../src/renderer/pages/PersonDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PersonDetailPage dossier baseline', () => {
  it('renders dossier sections and file-level evidence backtrace actions', async () => {
    const onOpenEvidenceFile = vi.fn()

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
          evidenceBacktrace: [{ kind: 'file', id: 'f-1', label: 'transcript.pdf' }]
        })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-1" onOpenEvidenceFile={onOpenEvidenceFile} />)

    expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()
    expect(screen.getByText('Identity Card')).toBeInTheDocument()
    expect(screen.getByText('Thematic Portrait')).toBeInTheDocument()
    expect(screen.getByText('Timeline Highlights')).toBeInTheDocument()
    expect(screen.getByText('Relationship Context')).toBeInTheDocument()
    expect(screen.getByText('Evidence Backtrace')).toBeInTheDocument()
    expect(screen.getByText(/北京大学/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'transcript.pdf' })[0]!)
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
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
          evidenceBacktrace: []
        })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-empty" />)

    expect(await screen.findByText('No approved education facts yet.')).toBeInTheDocument()
  })
})
