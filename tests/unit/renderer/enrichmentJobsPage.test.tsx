import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnrichmentJobsPage } from '../../../src/renderer/pages/EnrichmentJobsPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EnrichmentJobsPage', () => {

  it('shows provider boundary audit for a selected job', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listEnrichmentJobs: vi.fn().mockResolvedValue([
          { id: 'job-1', fileId: 'file-1', fileName: 'transcript.pdf', status: 'completed', enhancerType: 'document_ocr', provider: 'siliconflow', model: 'model-a', attemptCount: 1, errorMessage: null, startedAt: null, finishedAt: null, createdAt: '2026-03-12T00:00:00.000Z', updatedAt: '2026-03-12T00:00:00.000Z' }
        ]),
        listProviderEgressArtifacts: vi.fn().mockResolvedValue([
          {
            artifactId: 'pea-1',
            jobId: 'job-1',
            fileId: 'file-1',
            fileName: 'transcript.pdf',
            provider: 'siliconflow',
            model: 'model-a',
            enhancerType: 'document_ocr',
            policyKey: 'document_ocr.remote_baseline',
            requestHash: 'request-hash-1',
            redactionSummary: { removedFields: ['frozenPath'] },
            createdAt: '2026-03-12T00:00:00.000Z',
            events: [
              { id: 'pee-1', eventType: 'request', payload: { fileRef: 'vault://file/file-1' }, createdAt: '2026-03-12T00:00:00.000Z' }
            ]
          }
        ]),
        rerunEnrichmentJob: vi.fn().mockResolvedValue(null)
      }
    })

    render(<EnrichmentJobsPage />)

    await screen.findByText('document_ocr')
    fireEvent.click(screen.getByRole('button', { name: 'Boundary' }))

    expect(await screen.findByText('Provider Boundary Audit')).toBeInTheDocument()
    expect(await screen.findByText('document_ocr.remote_baseline')).toBeInTheDocument()
    expect(await screen.findByText('vault://file/file-1')).toBeInTheDocument()
  })
  it('shows queued and completed enrichment jobs', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listEnrichmentJobs: vi.fn().mockResolvedValue([
          { id: 'job-1', fileId: 'file-1', fileName: 'id-card.jpg', status: 'failed', enhancerType: 'document_ocr', provider: 'siliconflow', model: 'model-a', attemptCount: 2, errorMessage: 'provider timeout', startedAt: null, finishedAt: null, createdAt: '2026-03-11T00:00:00.000Z', updatedAt: '2026-03-11T00:00:00.000Z' },
          { id: 'job-2', fileId: 'file-2', fileName: 'chat.png', status: 'completed', enhancerType: 'chat_screenshot', provider: 'openrouter', model: 'model-b', attemptCount: 1, errorMessage: null, startedAt: null, finishedAt: null, createdAt: '2026-03-11T01:00:00.000Z', updatedAt: '2026-03-11T01:00:00.000Z' }
        ]),
        rerunEnrichmentJob: vi.fn().mockResolvedValue(null)
      }
    })

    render(<EnrichmentJobsPage />)

    expect(await screen.findByText('document_ocr')).toBeInTheDocument()
    expect(await screen.findByText('chat_screenshot')).toBeInTheDocument()
    expect(await screen.findByText('provider timeout')).toBeInTheDocument()
    expect(await screen.findByText('Attempts')).toBeInTheDocument()
  })
})
