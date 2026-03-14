import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('renders a safe batch journal row and undoes it from the existing history entry point', async () => {
    const listReviewQueue = vi.fn().mockResolvedValue([])
    const listDecisionJournal = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'journal-batch-1',
          decisionType: 'approve_safe_review_group',
          targetType: 'decision_batch',
          targetId: 'batch-1',
          operationPayload: {
            batchId: 'batch-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            itemCount: 2
          },
          undoPayload: {
            batchId: 'batch-1',
            memberJournalIds: ['journal-1', 'journal-2']
          },
          actor: 'reviewer',
          createdAt: '2026-03-12T00:00:00.000Z',
          undoneAt: null,
          undoneBy: null
        }
      ])
      .mockResolvedValueOnce([])
    const undoDecision = vi.fn().mockResolvedValue({ status: 'undone', journalId: 'journal-batch-1' })

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewQueue,
        listDecisionJournal,
        approveReviewItem: vi.fn(),
        rejectReviewItem: vi.fn(),
        undoDecision
      }
    })

    render(<ReviewQueuePage />)

    expect(await screen.findByText('Safe batch approve')).toBeInTheDocument()
    expect(screen.getByText('Alice Chen · school_name · 2 items')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo Batch' }))
    })

    expect(undoDecision).toHaveBeenCalledWith('journal-batch-1')
    expect(await screen.findByText('No review history yet.')).toBeInTheDocument()
    expect(listDecisionJournal).toHaveBeenCalledTimes(2)
    expect(listReviewQueue).toHaveBeenCalledTimes(2)
  })

  it('filters journal history and opens a replay detail pane', async () => {
    const listReviewQueue = vi.fn().mockResolvedValue([])
    const listDecisionJournal = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'journal-batch-1',
          decisionType: 'approve_safe_review_group',
          targetType: 'decision_batch',
          targetId: 'batch-1',
          replaySummary: 'Safe batch approve · Alice Chen · school_name · 2 items',
          targetLabel: 'Alice Chen · school_name · 2 items',
          decisionLabel: 'Safe batch approve',
          operationPayload: {
            batchId: 'batch-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            itemCount: 2
          },
          undoPayload: {
            batchId: 'batch-1',
            memberJournalIds: ['journal-1', 'journal-2']
          },
          actor: 'reviewer',
          createdAt: '2026-03-12T00:00:00.000Z',
          undoneAt: null,
          undoneBy: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'journal-batch-1',
          decisionType: 'approve_safe_review_group',
          targetType: 'decision_batch',
          targetId: 'batch-1',
          replaySummary: 'Safe batch approve · Alice Chen · school_name · 2 items',
          targetLabel: 'Alice Chen · school_name · 2 items',
          decisionLabel: 'Safe batch approve',
          operationPayload: {
            batchId: 'batch-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            itemCount: 2
          },
          undoPayload: {
            batchId: 'batch-1',
            memberJournalIds: ['journal-1', 'journal-2']
          },
          actor: 'reviewer',
          createdAt: '2026-03-12T00:00:00.000Z',
          undoneAt: null,
          undoneBy: null
        }
      ])

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewQueue,
        listDecisionJournal,
        approveReviewItem: vi.fn(),
        rejectReviewItem: vi.fn(),
        undoDecision: vi.fn()
      }
    })

    render(<ReviewQueuePage />)

    expect(await screen.findByText('Safe batch approve')).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'Alice Chen' } })
      fireEvent.click(screen.getByRole('button', { name: 'Filter History' }))
    })

    expect(listDecisionJournal).toHaveBeenLastCalledWith({ query: 'Alice Chen' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    })

    expect(await screen.findByText('Replay Detail')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText(/memberJournalIds/i)).toBeInTheDocument()
  })

  it('accepts an initial replay shortcut and opens the matching replay detail immediately', async () => {
    const listReviewQueue = vi.fn().mockResolvedValue([])
    const listDecisionJournal = vi.fn().mockResolvedValue([
      {
        id: 'journal-batch-1',
        decisionType: 'approve_safe_review_group',
        targetType: 'decision_batch',
        targetId: 'batch-1',
        replaySummary: 'Safe batch approve · Bob Li · school_name · 2 items',
        targetLabel: 'Bob Li · school_name · 2 items',
        decisionLabel: 'Safe batch approve',
        operationPayload: {
          batchId: 'batch-1',
          canonicalPersonName: 'Bob Li',
          fieldKey: 'school_name',
          itemCount: 2
        },
        undoPayload: {
          batchId: 'batch-1',
          memberJournalIds: ['journal-1', 'journal-2']
        },
        actor: 'reviewer',
        createdAt: '2026-03-12T00:00:00.000Z',
        undoneAt: null,
        undoneBy: null
      }
    ])

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewQueue,
        listDecisionJournal,
        approveReviewItem: vi.fn(),
        rejectReviewItem: vi.fn(),
        undoDecision: vi.fn()
      }
    })

    render(
      <ReviewQueuePage
        initialJournalQuery="journal-batch-1"
        initialSelectedJournalId="journal-batch-1"
      />
    )

    expect(await screen.findByText('Replay Detail')).toBeInTheDocument()
    expect(listDecisionJournal).toHaveBeenCalledWith({ query: 'journal-batch-1' })
    expect(screen.getByDisplayValue('journal-batch-1')).toBeInTheDocument()
    expect(screen.getByText('Safe batch approve · Bob Li · school_name · 2 items')).toBeInTheDocument()
  })
})
