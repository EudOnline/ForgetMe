import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewQueuePage } from '../../../src/renderer/pages/ReviewQueuePage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviewQueuePage', () => {
  it('shows pending review items only', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listReviewQueue: vi.fn().mockResolvedValue([
          { id: 'rq-1', itemType: 'person_merge_candidate', candidateId: 'mc-1', status: 'pending', priority: 0, confidence: 0.95, summary: {}, createdAt: '2026-03-10T00:00:00.000Z', reviewedAt: null }
        ]),
        listDecisionJournal: vi.fn().mockResolvedValue([]),
        approveReviewItem: vi.fn(),
        rejectReviewItem: vi.fn(),
        undoDecision: vi.fn()
      }
    })

    render(<ReviewQueuePage />)

    expect(await screen.findByText('person_merge_candidate')).toBeInTheDocument()
  })
})
