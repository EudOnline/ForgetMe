import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonDetailPage } from '../../../src/renderer/pages/PersonDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PersonDetailPage approved profile', () => {
  it('shows formal approved profile sections', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        getCanonicalPerson: vi.fn().mockResolvedValue({
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
          approvedProfile: {
            education: [{
              id: 'ppa-1',
              canonicalPersonId: 'cp-1',
              attributeGroup: 'education',
              attributeKey: 'school_name',
              valueJson: '{"value":"北京大学"}',
              displayValue: '北京大学',
              sourceFileId: 'f-1',
              sourceEvidenceId: 'ee-1',
              sourceCandidateId: 'fc-1',
              provenance: {},
              confidence: 1,
              status: 'active',
              approvedJournalId: 'dj-1',
              createdAt: '2026-03-11T00:00:00.000Z',
              updatedAt: '2026-03-11T00:00:00.000Z'
            }]
          }
        }),
        getPersonTimeline: vi.fn().mockResolvedValue([]),
        getPersonGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-1" />)

    expect(await screen.findByText('Approved Profile')).toBeInTheDocument()
    expect(await screen.findByText(/北京大学/)).toBeInTheDocument()
  })
})
