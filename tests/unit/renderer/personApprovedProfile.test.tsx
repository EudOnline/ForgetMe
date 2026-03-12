import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonDetailPage } from '../../../src/renderer/pages/PersonDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PersonDetailPage approved profile', () => {
  it('shows dossier thematic portrait sections', async () => {
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
            aliases: [],
            manualLabels: [],
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
              id: 'ppa-1',
              label: 'school_name',
              value: '北京大学',
              displayType: 'approved_fact',
              evidenceRefs: []
            }]
          }],
          timelineHighlights: [],
          relationshipSummary: [],
          evidenceBacktrace: []
        })
      }
    })

    render(<PersonDetailPage canonicalPersonId="cp-1" />)

    expect(await screen.findByRole('heading', { name: 'Person Dossier' })).toBeInTheDocument()
    expect(await screen.findByText('Thematic Portrait')).toBeInTheDocument()
    expect(await screen.findByText(/北京大学/)).toBeInTheDocument()
  })
})
