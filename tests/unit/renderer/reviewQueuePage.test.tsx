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

  it('renders automatic retry-aware approved draft send history entries in replay detail', async () => {
    const listReviewQueue = vi.fn().mockResolvedValue([])
    const listDecisionJournal = vi.fn().mockResolvedValue([
      {
        id: 'journal-send-1',
        decisionType: 'send_approved_persona_draft_to_provider',
        targetType: 'persona_draft_review',
        targetId: 'review-send-1',
        replaySummary: 'Approved draft auto-retried to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct',
        targetLabel: 'Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct',
        decisionLabel: 'Approved draft auto-retried to provider',
        operationPayload: {
          draftReviewId: 'review-send-1',
          sourceTurnId: 'turn-1',
          providerSendArtifactId: 'artifact-1',
          provider: 'openrouter',
          model: 'qwen/qwen-2.5-72b-instruct',
          policyKey: 'persona_draft.remote_send_approved',
          destinationId: 'openrouter-qwen25-72b',
          destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
          attemptKind: 'automatic_retry',
          retryOfArtifactId: 'artifact-failed-1',
          requestHash: 'hash-1',
          sentAt: '2026-03-16T08:00:00.000Z'
        },
        undoPayload: {},
        actor: 'local-user',
        createdAt: '2026-03-16T08:00:00.000Z',
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

    expect(await screen.findByText('Approved draft auto-retried to provider')).toBeInTheDocument()
    expect(screen.getByText('Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    })

    expect(await screen.findByText('Replay Detail')).toBeInTheDocument()
    expect(screen.getByText('Approved draft auto-retried to provider · Persona draft review · turn-1 · OpenRouter / qwen-2.5-72b-instruct')).toBeInTheDocument()
    expect(screen.getByText(/providerSendArtifactId/i)).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('persona_draft.remote_send_approved'))).toBeInTheDocument()
  })

  it('renders hosted share create and revoke history entries in the undo history list and replay detail', async () => {
    const listReviewQueue = vi.fn().mockResolvedValue([])
    const listDecisionJournal = vi.fn().mockResolvedValue([
      {
        id: 'journal-hosted-create-1',
        decisionType: 'create_approved_persona_draft_share_link',
        targetType: 'persona_draft_review',
        targetId: 'review-hosted-1',
        replaySummary: 'Hosted share link created for approved draft · Persona draft review · turn-1 · hosted share link',
        targetLabel: 'Persona draft review · turn-1 · hosted share link',
        decisionLabel: 'Hosted share link created for approved draft',
        operationPayload: {
          shareLinkId: 'share-link-1',
          draftReviewId: 'review-hosted-1',
          publicationId: 'publication-hosted-1',
          sourceTurnId: 'turn-1',
          hostKind: 'configured_remote_host',
          hostLabel: 'https://share.example.test',
          remoteShareId: 'remote-share-1',
          shareUrl: 'https://share.example.test/s/remote-share-1',
          publicArtifactSha256: 'hash-publication-hosted-1'
        },
        undoPayload: {},
        actor: 'local-user',
        createdAt: '2026-03-16T09:00:00.000Z',
        undoneAt: null,
        undoneBy: null
      },
      {
        id: 'journal-hosted-revoke-1',
        decisionType: 'revoke_approved_persona_draft_share_link',
        targetType: 'persona_draft_review',
        targetId: 'review-hosted-1',
        replaySummary: 'Hosted share link revoked · Persona draft review · turn-1 · hosted share link',
        targetLabel: 'Persona draft review · turn-1 · hosted share link',
        decisionLabel: 'Hosted share link revoked',
        operationPayload: {
          shareLinkId: 'share-link-1',
          draftReviewId: 'review-hosted-1',
          publicationId: 'publication-hosted-1',
          sourceTurnId: 'turn-1',
          hostKind: 'configured_remote_host',
          hostLabel: 'https://share.example.test',
          remoteShareId: 'remote-share-1',
          shareUrl: 'https://share.example.test/s/remote-share-1',
          publicArtifactSha256: 'hash-publication-hosted-1'
        },
        undoPayload: {},
        actor: 'local-user',
        createdAt: '2026-03-16T09:05:00.000Z',
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

    expect(await screen.findByText('Hosted share link created for approved draft')).toBeInTheDocument()
    expect(screen.getAllByText('Persona draft review · turn-1 · hosted share link')).toHaveLength(2)
    expect(screen.getByText('Hosted share link revoked')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Replay' })[1]!)
    })

    expect(await screen.findByText('Replay Detail')).toBeInTheDocument()
    expect(screen.getByText('Hosted share link revoked · Persona draft review · turn-1 · hosted share link')).toBeInTheDocument()
    expect(screen.getByText(/publicArtifactSha256/i)).toBeInTheDocument()
  })
})
