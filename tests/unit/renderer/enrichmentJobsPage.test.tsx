import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnrichmentJobsPage } from '../../../src/renderer/pages/EnrichmentJobsPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EnrichmentJobsPage', () => {
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
