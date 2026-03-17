import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryWorkspacePage } from '../../../src/renderer/pages/MemoryWorkspacePage'

function createStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    }
  }
}

const localStorageMock = createStorageMock()
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true
})

function stubArchiveWindow(archiveApi: Record<string, unknown>) {
  Object.assign(window, { archiveApi })
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  delete (window as Window & { archiveApi?: unknown }).archiveApi
  delete process.env.FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS
  localStorageMock.clear()
})

describe('MemoryWorkspacePage', () => {
  it('asks the global memory workspace and renders the grounded response', async () => {
    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue({
        turnId: 'turn-1',
        sessionId: 'session-1',
        ordinal: 1,
        question: '现在最值得关注什么？',
        provider: null,
        model: null,
        contextHash: 'context-hash-1',
        promptHash: 'prompt-hash-1',
        createdAt: '2026-03-13T12:30:00.000Z',
        response: {
          scope: { kind: 'global' },
          question: '现在最值得关注什么？',
          expressionMode: 'grounded',
          title: 'Memory Workspace · Global',
          answer: {
            summary: '2 pending review items remain across 1 conflict group.',
            displayType: 'open_conflict',
            citations: []
          },
          guardrail: {
            decision: 'fallback_to_conflict',
            reasonCodes: ['open_conflict_present', 'review_pressure_present'],
            citationCount: 0,
            sourceKinds: [],
            fallbackApplied: true
          },
          contextCards: [
            {
              cardId: 'review-pressure',
              title: 'Review Pressure',
              body: '2 pending review items remain across 1 conflict group.',
              displayType: 'open_conflict',
              citations: []
            }
          ]
        }
      })
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '现在最值得关注什么？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('heading', { name: 'Memory Workspace' })).toBeInTheDocument()
    expect(screen.getByText('Memory Workspace · Global')).toBeInTheDocument()
    expect(screen.getByText('Mode: grounded')).toBeInTheDocument()
    expect(screen.getByText('Review Pressure')).toBeInTheDocument()
    expect(screen.getByText('Guardrails')).toBeInTheDocument()
    expect(screen.getByText('fallback_to_conflict')).toBeInTheDocument()
  })

  it('forwards advice mode asks and renders the mode label', async () => {
    const askMemoryWorkspacePersisted = vi.fn().mockResolvedValue({
      turnId: 'turn-advice-1',
      sessionId: 'session-advice-1',
      ordinal: 1,
      question: '这个群体最近一起发生过什么？',
      provider: null,
      model: null,
      contextHash: 'context-hash-advice-1',
      promptHash: 'prompt-hash-advice-1',
      createdAt: '2026-03-15T00:20:00.000Z',
      response: {
        scope: { kind: 'global' },
        question: '这个群体最近一起发生过什么？',
        expressionMode: 'advice',
        title: 'Memory Workspace · Global',
        answer: {
          summary: 'Based on the archive, the safest next step is to review the recent shared timeline first.',
          displayType: 'derived_summary',
          citations: []
        },
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: ['multi_source_synthesis'],
          citationCount: 2,
          sourceKinds: ['group', 'journal'],
          fallbackApplied: false
        },
        contextCards: []
      }
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.change(screen.getByLabelText('Response mode'), {
      target: { value: 'advice' }
    })
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '这个群体最近一起发生过什么？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Mode: advice')).toBeInTheDocument()
    expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith({
      scope: { kind: 'global' },
      question: '这个群体最近一起发生过什么？',
      expressionMode: 'advice'
    })
  })

  it('renders citation buttons when navigation handlers are supplied', async () => {
    const onOpenPerson = vi.fn()
    const onOpenGroup = vi.fn()
    const onOpenEvidenceFile = vi.fn()

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue({
        turnId: 'turn-1',
        sessionId: 'session-1',
        ordinal: 1,
        question: '谁和哪些资料最相关？',
        provider: null,
        model: null,
        contextHash: 'context-hash-1',
        promptHash: 'prompt-hash-1',
        createdAt: '2026-03-13T12:30:00.000Z',
        response: {
          scope: { kind: 'global' },
          question: '谁和哪些资料最相关？',
          title: 'Memory Workspace · Global',
          answer: {
            summary: 'Alice Chen and her group appear most often in the cited evidence.',
            displayType: 'derived_summary',
            citations: [
              {
                citationId: 'answer-person',
                kind: 'person',
                targetId: 'cp-1',
                label: 'Alice Chen'
              }
            ]
          },
          guardrail: {
            decision: 'grounded_answer',
            reasonCodes: ['multi_source_synthesis'],
            citationCount: 3,
            sourceKinds: ['person', 'group', 'file'],
            fallbackApplied: false
          },
          contextCards: [
            {
              cardId: 'summary',
              title: 'Summary',
              body: 'Alice Chen Group is linked to chat-1.json.',
              displayType: 'derived_summary',
              citations: [
                {
                  citationId: 'card-group',
                  kind: 'group',
                  targetId: 'cp-1',
                  label: 'Alice Chen Group'
                },
                {
                  citationId: 'card-file',
                  kind: 'file',
                  targetId: 'f-1',
                  label: 'chat-1.json'
                }
              ]
            }
          ]
        }
      })
    })

    render(
      <MemoryWorkspacePage
        scope={{ kind: 'global' }}
        onOpenPerson={onOpenPerson}
        onOpenGroup={onOpenGroup}
        onOpenEvidenceFile={onOpenEvidenceFile}
      />
    )

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '谁和哪些资料最相关？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Memory Workspace · Global')).toBeInTheDocument()
    expect(screen.getByText('multi_source_synthesis')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Alice Chen' }))
    expect(onOpenPerson).toHaveBeenCalledWith('cp-1')
    fireEvent.click(screen.getByRole('button', { name: 'Alice Chen Group' }))
    expect(onOpenGroup).toHaveBeenCalledWith('cp-1')
    fireEvent.click(screen.getByRole('button', { name: 'chat-1.json' }))
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
  })

  it('renders communication evidence for active quote-backed responses', async () => {
    const onOpenEvidenceFile = vi.fn()

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue({
        turnId: 'turn-quote-1',
        sessionId: 'session-quote-1',
        ordinal: 1,
        question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
        provider: null,
        model: null,
        contextHash: 'context-hash-quote-1',
        promptHash: 'prompt-hash-quote-1',
        createdAt: '2026-03-15T00:30:00.000Z',
        response: {
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
          expressionMode: 'grounded',
          title: 'Memory Workspace · Alice Chen',
          answer: {
            summary: 'Direct chat excerpts in the approved archive address this ask.',
            displayType: 'derived_summary',
            citations: []
          },
          guardrail: {
            decision: 'grounded_answer',
            reasonCodes: ['multi_source_synthesis'],
            citationCount: 2,
            sourceKinds: ['file'],
            fallbackApplied: false
          },
          contextCards: [],
          boundaryRedirect: null,
          communicationEvidence: {
            title: 'Communication Evidence',
            summary: 'Direct archive-backed excerpts related to this ask.',
            excerpts: [
              {
                excerptId: 'ce-1',
                fileId: 'f-1',
                fileName: 'chat-1.json',
                ordinal: 1,
                speakerDisplayName: 'Alice Chen',
                text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
              }
            ]
          }
        }
      })
    })

    render(
      <MemoryWorkspacePage
        scope={{ kind: 'person', canonicalPersonId: 'cp-1' }}
        onOpenEvidenceFile={onOpenEvidenceFile}
      />
    )

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '她过去是怎么表达记录和归档这类事的？给我看原话。' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    const evidenceSection = await screen.findByRole('region', { name: 'Communication Evidence' })
    expect(within(evidenceSection).getByText('Alice Chen')).toBeInTheDocument()
    expect(within(evidenceSection).getByText('我们还是把这些记录留在归档里，后面查起来更稳妥。')).toBeInTheDocument()

    fireEvent.click(within(evidenceSection).getByRole('button', { name: 'chat-1.json' }))
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
  })

  it('renders an active persona draft sandbox response', async () => {
    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue({
        turnId: 'turn-sandbox-1',
        sessionId: 'session-sandbox-1',
        ordinal: 1,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        provider: null,
        model: null,
        contextHash: 'context-hash-sandbox-1',
        promptHash: 'prompt-hash-sandbox-1',
        createdAt: '2026-03-15T00:35:00.000Z',
        response: {
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          question: '如果她来写一段关于记录和归档的回复，会怎么写？',
          expressionMode: 'grounded',
          workflowKind: 'persona_draft_sandbox',
          title: 'Memory Workspace · Alice Chen',
          answer: {
            summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
            displayType: 'derived_summary',
            citations: []
          },
          guardrail: {
            decision: 'sandbox_review_required',
            reasonCodes: ['persona_draft_sandbox', 'quote_trace_required'],
            citationCount: 2,
            sourceKinds: ['file'],
            fallbackApplied: false
          },
          contextCards: [],
          boundaryRedirect: null,
          communicationEvidence: {
            title: 'Communication Evidence',
            summary: 'Direct archive-backed excerpts related to this ask.',
            excerpts: [
              {
                excerptId: 'ce-1',
                fileId: 'f-1',
                fileName: 'chat-1.json',
                ordinal: 1,
                speakerDisplayName: 'Alice Chen',
                text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
              }
            ]
          },
          personaDraft: {
            title: 'Reviewed draft sandbox',
            disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
            draft: '可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。',
            reviewState: 'review_required',
            supportingExcerpts: ['ce-1'],
            trace: [
              {
                traceId: 'trace-1',
                excerptIds: ['ce-1'],
                explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
              }
            ]
          }
        }
      })
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Workflow: persona draft sandbox')).toBeInTheDocument()
    expect(screen.getByText('Simulation draft based on archived expressions. Not a statement from the person.')).toBeInTheDocument()
    expect(screen.getByText('可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。')).toBeInTheDocument()
    expect(screen.getByText('review_required')).toBeInTheDocument()
    expect(screen.getByText('Draft segment 1 stays grounded in Alice Chen excerpt ce-1.')).toBeInTheDocument()
  })

  it('starts, edits, reviews, and approves a persona draft review from the active sandbox turn', async () => {
    const sandboxTurn = {
      turnId: 'turn-sandbox-review-1',
      sessionId: 'session-sandbox-review-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-review-1',
      promptHash: 'prompt-hash-sandbox-review-1',
      createdAt: '2026-03-15T00:35:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: {
          title: 'Communication Evidence',
          summary: 'Direct archive-backed excerpts related to this ask.',
          excerpts: [
            {
              excerptId: 'ce-1',
              fileId: 'f-1',
              fileName: 'chat-1.json',
              ordinal: 1,
              speakerDisplayName: 'Alice Chen',
              text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
            }
          ]
        },
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档。',
          reviewState: 'review_required' as const,
          supportingExcerpts: ['ce-1'],
          trace: [
            {
              traceId: 'trace-1',
              excerptIds: ['ce-1'],
              explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
            }
          ]
        }
      }
    }

    let currentReview: Record<string, unknown> | null = null
    const getPersonaDraftReviewByTurn = vi.fn().mockImplementation(async () => currentReview)
    const createPersonaDraftReviewFromTurn = vi.fn().mockImplementation(async () => {
      currentReview = {
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-sandbox-review-1',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        workflowKind: 'persona_draft_sandbox',
        status: 'draft',
        baseDraft: '可审阅草稿：先把关键记录整理进归档。',
        editedDraft: '可审阅草稿：先把关键记录整理进归档。',
        reviewNotes: '',
        supportingExcerpts: ['ce-1'],
        trace: [
          {
            traceId: 'trace-1',
            excerptIds: ['ce-1'],
            explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
          }
        ],
        approvedJournalId: null,
        rejectedJournalId: null,
        createdAt: '2026-03-16T01:00:00.000Z',
        updatedAt: '2026-03-16T01:00:00.000Z'
      }

      return currentReview
    })
    const updatePersonaDraftReview = vi.fn().mockImplementation(async (input: {
      draftReviewId: string
      editedDraft?: string
      reviewNotes?: string
    }) => {
      currentReview = {
        ...currentReview,
        draftReviewId: input.draftReviewId,
        editedDraft: input.editedDraft ?? (currentReview as { editedDraft?: string } | null)?.editedDraft ?? '',
        reviewNotes: input.reviewNotes ?? (currentReview as { reviewNotes?: string } | null)?.reviewNotes ?? '',
        updatedAt: '2026-03-16T01:05:00.000Z'
      }

      return currentReview
    })
    const transitionPersonaDraftReview = vi.fn().mockImplementation(async (input: {
      draftReviewId: string
      status: 'draft' | 'in_review' | 'approved' | 'rejected'
    }) => {
      currentReview = {
        ...currentReview,
        draftReviewId: input.draftReviewId,
        status: input.status,
        approvedJournalId: input.status === 'approved' ? 'journal-approved-1' : null,
        rejectedJournalId: input.status === 'rejected' ? 'journal-rejected-1' : null,
        updatedAt: input.status === 'approved'
          ? '2026-03-16T01:07:00.000Z'
          : '2026-03-16T01:06:00.000Z'
      }

      return currentReview
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      getPersonaDraftReviewByTurn,
      createPersonaDraftReviewFromTurn,
      updatePersonaDraftReview,
      transitionPersonaDraftReview
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('button', { name: 'Start draft review' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start draft review' }))

    const bodyField = await screen.findByLabelText('Draft review body')
    const notesField = screen.getByLabelText('Draft review notes')
    expect(bodyField).toHaveValue('可审阅草稿：先把关键记录整理进归档。')
    expect(screen.queryByRole('heading', { name: 'Approved Draft Handoff' })).not.toBeInTheDocument()

    fireEvent.change(bodyField, {
      target: { value: '可审阅草稿：先把关键记录整理进归档，再补齐细节。' }
    })
    fireEvent.change(notesField, {
      target: { value: 'Sharper and easier to reuse.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft edits' }))

    await waitFor(() => {
      expect(updatePersonaDraftReview).toHaveBeenCalledWith({
        draftReviewId: 'review-1',
        editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
        reviewNotes: 'Sharper and easier to reuse.'
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mark in review' }))
    expect(await screen.findByText('Status: in review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }))
    expect(await screen.findByText('Status: approved')).toBeInTheDocument()
    expect(screen.getByLabelText('Draft review body')).toBeDisabled()
    expect(screen.getByLabelText('Draft review notes')).toBeDisabled()
    expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
  })

  it('exports an approved draft after choosing an export destination', async () => {
    const sandboxTurn = {
      turnId: 'turn-sandbox-approved-1',
      sessionId: 'session-sandbox-approved-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-approved-1',
      promptHash: 'prompt-hash-sandbox-approved-1',
      createdAt: '2026-03-15T00:35:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: {
          title: 'Communication Evidence',
          summary: 'Direct archive-backed excerpts related to this ask.',
          excerpts: [
            {
              excerptId: 'ce-1',
              fileId: 'f-1',
              fileName: 'chat-1.json',
              ordinal: 1,
              speakerDisplayName: 'Alice Chen',
              text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
            }
          ]
        },
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档。',
          reviewState: 'review_required' as const,
          supportingExcerpts: ['ce-1'],
          trace: [
            {
              traceId: 'trace-1',
              excerptIds: ['ce-1'],
              explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
            }
          ]
        }
      }
    }

    const approvedReview = {
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-sandbox-approved-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      workflowKind: 'persona_draft_sandbox' as const,
      status: 'approved' as const,
      baseDraft: '可审阅草稿：先把关键记录整理进归档。',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Approved for export.',
      supportingExcerpts: ['ce-1'],
      trace: [
        {
          traceId: 'trace-1',
          excerptIds: ['ce-1'],
          explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
        }
      ],
      approvedJournalId: 'journal-approved-1',
      rejectedJournalId: null,
      createdAt: '2026-03-16T01:00:00.000Z',
      updatedAt: '2026-03-16T01:07:00.000Z'
    }

    let currentHandoffs: Array<Record<string, unknown>> = []
    const selectPersonaDraftHandoffDestination = vi.fn().mockResolvedValue('/tmp/persona-draft-exports')
    const listApprovedPersonaDraftHandoffs = vi.fn().mockImplementation(async () => currentHandoffs)
    const exportApprovedPersonaDraft = vi.fn().mockImplementation(async () => {
      currentHandoffs = [{
        journalId: 'journal-export-1',
        draftReviewId: 'review-1',
        sourceTurnId: 'turn-sandbox-approved-1',
        handoffKind: 'local_json_export',
        status: 'exported',
        filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
        fileName: 'persona-draft-review-review-1-approved.json',
        sha256: 'hash-1',
        exportedAt: '2026-03-16T03:30:00.000Z'
      }]

      return {
        status: 'exported',
        journalId: 'journal-export-1',
        draftReviewId: 'review-1',
        handoffKind: 'local_json_export',
        filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
        fileName: 'persona-draft-review-review-1-approved.json',
        sha256: 'hash-1',
        exportedAt: '2026-03-16T03:30:00.000Z'
      }
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue(approvedReview),
      listApprovedPersonaDraftHandoffs,
      selectPersonaDraftHandoffDestination,
      exportApprovedPersonaDraft
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
    expect(screen.getByText('No export destination selected.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose export destination' }))
    expect(await screen.findByText('/tmp/persona-draft-exports')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Export approved draft' }))

    await waitFor(() => {
      expect(exportApprovedPersonaDraft).toHaveBeenCalledWith({
        draftReviewId: 'review-1',
        destinationRoot: '/tmp/persona-draft-exports'
      })
    })

    expect(await screen.findByText('Exported persona-draft-review-review-1-approved.json')).toBeInTheDocument()
  })

  it('sends an approved draft through the provider boundary and renders the latest send audit detail', async () => {
    const sandboxTurn = {
      turnId: 'turn-sandbox-send-1',
      sessionId: 'session-sandbox-send-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-send-1',
      promptHash: 'prompt-hash-sandbox-send-1',
      createdAt: '2026-03-15T00:36:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: {
          title: 'Communication Evidence',
          summary: 'Direct archive-backed excerpts related to this ask.',
          excerpts: [
            {
              excerptId: 'ce-1',
              fileId: 'f-1',
              fileName: 'chat-1.json',
              ordinal: 1,
              speakerDisplayName: 'Alice Chen',
              text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
            }
          ]
        },
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档。',
          reviewState: 'review_required' as const,
          supportingExcerpts: ['ce-1'],
          trace: [
            {
              traceId: 'trace-1',
              excerptIds: ['ce-1'],
              explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
            }
          ]
        }
      }
    }

    const approvedReview = {
      draftReviewId: 'review-send-1',
      sourceTurnId: 'turn-sandbox-send-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      workflowKind: 'persona_draft_sandbox' as const,
      status: 'approved' as const,
      baseDraft: '可审阅草稿：先把关键记录整理进归档。',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Approved for provider send.',
      supportingExcerpts: ['ce-1'],
      trace: [
        {
          traceId: 'trace-1',
          excerptIds: ['ce-1'],
          explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
        }
      ],
      approvedJournalId: 'journal-approved-send-1',
      rejectedJournalId: null,
      createdAt: '2026-03-16T01:00:00.000Z',
      updatedAt: '2026-03-16T01:07:00.000Z'
    }

    let currentSends: Array<Record<string, unknown>> = []
    const listApprovedPersonaDraftProviderSends = vi.fn().mockImplementation(async () => currentSends)
    const listApprovedDraftSendDestinations = vi.fn().mockResolvedValue([
      {
        destinationId: 'memory-dialogue-default',
        label: 'Memory Dialogue Default',
        resolutionMode: 'memory_dialogue_default',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        isDefault: true
      },
      {
        destinationId: 'siliconflow-qwen25-72b',
        label: 'SiliconFlow / Qwen2.5-72B-Instruct',
        resolutionMode: 'provider_model',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        isDefault: false
      },
      {
        destinationId: 'openrouter-qwen25-72b',
        label: 'OpenRouter / qwen-2.5-72b-instruct',
        resolutionMode: 'provider_model',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        isDefault: false
      }
    ])
    const sendApprovedPersonaDraftToProvider = vi.fn().mockImplementation(async () => {
      currentSends = [{
        artifactId: 'pdpe-1',
        draftReviewId: 'review-send-1',
        sourceTurnId: 'turn-sandbox-send-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        policyKey: 'persona_draft.remote_send_approved',
        requestHash: 'hash-1',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        attemptKind: 'initial_send',
        retryOfArtifactId: null,
        redactionSummary: {
          requestShape: 'approved_persona_draft_handoff_artifact',
          sourceArtifact: 'approved_persona_draft_handoff',
          removedFields: []
        },
        createdAt: '2026-03-16T08:00:00.000Z',
        events: [
          {
            id: 'event-1',
            eventType: 'request',
            payload: {
              requestShape: 'approved_persona_draft_handoff_artifact'
            },
            createdAt: '2026-03-16T08:00:00.000Z'
          },
          {
            id: 'event-2',
            eventType: 'response',
            payload: {
              acknowledgement: 'received'
            },
            createdAt: '2026-03-16T08:00:01.000Z'
          }
        ]
      }]

      return {
        status: 'responded',
        artifactId: 'pdpe-1',
        draftReviewId: 'review-send-1',
        sourceTurnId: 'turn-sandbox-send-1',
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        policyKey: 'persona_draft.remote_send_approved',
        requestHash: 'hash-1',
        destinationId: 'openrouter-qwen25-72b',
        destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
        attemptKind: 'initial_send',
        retryOfArtifactId: null,
        createdAt: '2026-03-16T08:00:00.000Z'
      }
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      listApprovedDraftSendDestinations,
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue(approvedReview),
      listApprovedPersonaDraftHandoffs: vi.fn().mockResolvedValue([]),
      listApprovedPersonaDraftProviderSends,
      sendApprovedPersonaDraftToProvider
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
    expect(screen.getByText('Provider Boundary Send')).toBeInTheDocument()
    expect(screen.getByText('No provider sends yet.')).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('memory-dialogue-default')
    expect(screen.getByRole('option', { name: 'Memory Dialogue Default' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'SiliconFlow / Qwen2.5-72B-Instruct' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenRouter / qwen-2.5-72b-instruct' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'openrouter-qwen25-72b' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send approved draft' }))

    await waitFor(() => {
      expect(sendApprovedPersonaDraftToProvider).toHaveBeenCalledWith({
        draftReviewId: 'review-send-1',
        destinationId: 'openrouter-qwen25-72b'
      })
    })

    expect(await screen.findByText('response recorded')).toBeInTheDocument()
    expect(screen.getByText('Attempt: initial send')).toBeInTheDocument()
    expect(screen.getByText('Destination: OpenRouter / qwen-2.5-72b-instruct')).toBeInTheDocument()
    expect(screen.getByText('openrouter · qwen/qwen-2.5-72b-instruct')).toBeInTheDocument()
    expect(screen.getByText('persona_draft.remote_send_approved')).toBeInTheDocument()
    expect(screen.getByText('Latest send audit')).toBeInTheDocument()
    expect(screen.getByText('request · 2026-03-16T08:00:00.000Z')).toBeInTheDocument()
    expect(screen.getByText('response · 2026-03-16T08:00:01.000Z')).toBeInTheDocument()
    expect(screen.getByText(/approved_persona_draft_handoff_artifact/)).toBeInTheDocument()
    expect(screen.getByText(/acknowledgement/)).toBeInTheDocument()
    expect(window.localStorage.getItem('forgetme.memoryWorkspace.approvedDraftSendDestinationId')).toBe('openrouter-qwen25-72b')
  })

  it('shows failed send details and retries the latest failed approved draft send', async () => {
    const sandboxTurn = {
      turnId: 'turn-sandbox-retry-1',
      sessionId: 'session-sandbox-retry-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-retry-1',
      promptHash: 'prompt-hash-sandbox-retry-1',
      createdAt: '2026-03-15T00:35:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档。',
          reviewState: 'review_required' as const,
          supportingExcerpts: [],
          trace: []
        }
      }
    }

    const approvedReview = {
      draftReviewId: 'review-retry-1',
      sourceTurnId: 'turn-sandbox-retry-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
      workflowKind: 'persona_draft_sandbox' as const,
      status: 'approved' as const,
      baseDraft: '可审阅草稿：先把关键记录整理进归档。',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Approved for provider send.',
      supportingExcerpts: [],
      trace: [],
      approvedJournalId: 'journal-approved-retry-1',
      rejectedJournalId: null,
      createdAt: '2026-03-16T01:00:00.000Z',
      updatedAt: '2026-03-16T01:07:00.000Z'
    }

    const failedSend = {
      artifactId: 'pdpe-failed-1',
      draftReviewId: 'review-retry-1',
      sourceTurnId: 'turn-sandbox-retry-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-failed-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:00.000Z',
      events: [
        {
          id: 'event-failed-1',
          eventType: 'request',
          payload: {
            requestShape: 'approved_persona_draft_handoff_artifact'
          },
          createdAt: '2026-03-16T08:00:00.000Z'
        },
        {
          id: 'event-failed-2',
          eventType: 'error',
          payload: {
            message: 'provider offline'
          },
          createdAt: '2026-03-16T08:00:01.000Z'
        }
      ]
    }

    const retriedSend = {
      artifactId: 'pdpe-retry-1',
      draftReviewId: 'review-retry-1',
      sourceTurnId: 'turn-sandbox-retry-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-retry-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1',
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:05:00.000Z',
      events: [
        {
          id: 'event-retry-1',
          eventType: 'request',
          payload: {
            requestShape: 'approved_persona_draft_handoff_artifact'
          },
          createdAt: '2026-03-16T08:05:00.000Z'
        },
        {
          id: 'event-retry-2',
          eventType: 'response',
          payload: {
            acknowledgement: 'received'
          },
          createdAt: '2026-03-16T08:05:02.000Z'
        }
      ]
    }

    const listApprovedPersonaDraftProviderSends = vi.fn()
      .mockResolvedValueOnce([failedSend])
      .mockResolvedValue([retriedSend])
    const retryApprovedPersonaDraftProviderSend = vi.fn().mockResolvedValue({
      status: 'responded',
      artifactId: 'pdpe-retry-1',
      draftReviewId: 'review-retry-1',
      sourceTurnId: 'turn-sandbox-retry-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-retry-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1',
      createdAt: '2026-03-16T08:05:00.000Z'
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      listApprovedDraftSendDestinations: vi.fn().mockResolvedValue([
        {
          destinationId: 'memory-dialogue-default',
          label: 'Memory Dialogue Default',
          resolutionMode: 'memory_dialogue_default',
          provider: 'siliconflow',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          isDefault: true
        },
        {
          destinationId: 'openrouter-qwen25-72b',
          label: 'OpenRouter / qwen-2.5-72b-instruct',
          resolutionMode: 'provider_model',
          provider: 'openrouter',
          model: 'qwen/qwen-2.5-72b-instruct',
          isDefault: false
        }
      ]),
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue(approvedReview),
      listApprovedPersonaDraftHandoffs: vi.fn().mockResolvedValue([]),
      listApprovedPersonaDraftProviderSends,
      sendApprovedPersonaDraftToProvider: vi.fn().mockResolvedValue(null),
      retryApprovedPersonaDraftProviderSend
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
    expect(await screen.findByText('error recorded')).toBeInTheDocument()
    expect(screen.getByText('Attempt: initial send')).toBeInTheDocument()
    expect(screen.getByText('Error: provider offline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed send now' }))

    await waitFor(() => {
      expect(retryApprovedPersonaDraftProviderSend).toHaveBeenCalledWith({
        artifactId: 'pdpe-failed-1'
      })
    })

    expect(await screen.findByText('response recorded')).toBeInTheDocument()
    expect(screen.getByText('Attempt: manual retry')).toBeInTheDocument()
    expect(screen.getByText('Destination: OpenRouter / qwen-2.5-72b-instruct')).toBeInTheDocument()
  })

  it('shows queued automatic retry state and refreshes provider sends on a polling interval', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS = '20'

    const sandboxTurn = {
      turnId: 'turn-sandbox-auto-retry-1',
      sessionId: 'session-sandbox-auto-retry-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-auto-retry-1',
      promptHash: 'prompt-hash-sandbox-auto-retry-1',
      createdAt: '2026-03-15T00:35:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '把关键记录整理进归档，再继续补齐细节。',
          reviewState: 'review_required' as const,
          supportingExcerpts: [],
          trace: [],
          evidenceBullets: [],
          caveats: []
        }
      }
    }

    const approvedReview = {
      draftReviewId: 'review-auto-retry-1',
      sourceTurnId: 'turn-sandbox-auto-retry-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
      status: 'approved' as const,
      editedDraft: '把关键记录整理进归档，再继续补齐细节。',
      reviewNotes: 'Approved for provider send.',
      createdAt: '2026-03-15T00:35:10.000Z',
      updatedAt: '2026-03-15T00:35:20.000Z'
    }

    const queuedFailedSend = {
      artifactId: 'pdpe-auto-failed-1',
      draftReviewId: 'review-auto-retry-1',
      sourceTurnId: 'turn-sandbox-auto-retry-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-auto-failed-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'initial_send' as const,
      retryOfArtifactId: null,
      backgroundRetry: {
        status: 'pending' as const,
        autoRetryAttemptIndex: 1,
        maxAutoRetryAttempts: 3,
        nextRetryAt: '2026-03-16T08:00:30.000Z',
        claimedAt: null
      },
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:00.000Z',
      events: [
        {
          id: 'event-auto-failed-1',
          eventType: 'request' as const,
          payload: {
            requestShape: 'approved_persona_draft_handoff_artifact'
          },
          createdAt: '2026-03-16T08:00:00.000Z'
        },
        {
          id: 'event-auto-failed-2',
          eventType: 'error' as const,
          payload: {
            message: 'provider offline'
          },
          createdAt: '2026-03-16T08:00:02.000Z'
        }
      ]
    }

    const automaticRetrySend = {
      artifactId: 'pdpe-auto-retry-1',
      draftReviewId: 'review-auto-retry-1',
      sourceTurnId: 'turn-sandbox-auto-retry-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-auto-retry-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'automatic_retry' as const,
      retryOfArtifactId: 'pdpe-auto-failed-1',
      backgroundRetry: null,
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:30.000Z',
      events: [
        {
          id: 'event-auto-retry-1',
          eventType: 'request' as const,
          payload: {
            requestShape: 'approved_persona_draft_handoff_artifact'
          },
          createdAt: '2026-03-16T08:00:30.000Z'
        },
        {
          id: 'event-auto-retry-2',
          eventType: 'response' as const,
          payload: {
            acknowledgement: 'received'
          },
          createdAt: '2026-03-16T08:00:31.000Z'
        }
      ]
    }

    const listApprovedPersonaDraftProviderSends = vi.fn()
      .mockResolvedValueOnce([queuedFailedSend])
      .mockResolvedValue([automaticRetrySend])

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      listApprovedDraftSendDestinations: vi.fn().mockResolvedValue([
        {
          destinationId: 'memory-dialogue-default',
          label: 'Memory Dialogue Default',
          resolutionMode: 'memory_dialogue_default',
          provider: 'siliconflow',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          isDefault: true
        },
        {
          destinationId: 'openrouter-qwen25-72b',
          label: 'OpenRouter / qwen-2.5-72b-instruct',
          resolutionMode: 'provider_model',
          provider: 'openrouter',
          model: 'qwen/qwen-2.5-72b-instruct',
          isDefault: false
        }
      ]),
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue(approvedReview),
      listApprovedPersonaDraftHandoffs: vi.fn().mockResolvedValue([]),
      listApprovedPersonaDraftProviderSends,
      sendApprovedPersonaDraftToProvider: vi.fn().mockResolvedValue(null),
      retryApprovedPersonaDraftProviderSend: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Auto retry: queued · attempt 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Next retry: 2026-03-16T08:00:30.000Z')).toBeInTheDocument()

    await waitFor(() => {
      expect(listApprovedPersonaDraftProviderSends).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('response recorded')).toBeInTheDocument()
    expect(screen.getByText('Attempt: automatic retry')).toBeInTheDocument()
  })

  it('shows exhausted retry state and disables manual retry while an auto retry is processing', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS = '20'

    const sandboxTurn = {
      turnId: 'turn-sandbox-exhausted-1',
      sessionId: 'session-sandbox-exhausted-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-exhausted-1',
      promptHash: 'prompt-hash-sandbox-exhausted-1',
      createdAt: '2026-03-15T00:35:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '把关键记录整理进归档，再继续补齐细节。',
          reviewState: 'review_required' as const,
          supportingExcerpts: [],
          trace: [],
          evidenceBullets: [],
          caveats: []
        }
      }
    }

    const approvedReview = {
      draftReviewId: 'review-exhausted-1',
      sourceTurnId: 'turn-sandbox-exhausted-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
      status: 'approved' as const,
      editedDraft: '把关键记录整理进归档，再继续补齐细节。',
      reviewNotes: 'Approved for provider send.',
      createdAt: '2026-03-15T00:35:10.000Z',
      updatedAt: '2026-03-15T00:35:20.000Z'
    }

    const processingFailedSend = {
      artifactId: 'pdpe-processing-1',
      draftReviewId: 'review-exhausted-1',
      sourceTurnId: 'turn-sandbox-exhausted-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-processing-1',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'automatic_retry' as const,
      retryOfArtifactId: 'pdpe-failed-root-1',
      backgroundRetry: {
        status: 'processing' as const,
        autoRetryAttemptIndex: 2,
        maxAutoRetryAttempts: 3,
        nextRetryAt: '2026-03-16T09:00:30.000Z',
        claimedAt: '2026-03-16T09:00:30.000Z'
      },
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T09:00:30.000Z',
      events: [
        {
          id: 'event-processing-1',
          eventType: 'request' as const,
          payload: {
            requestShape: 'approved_persona_draft_handoff_artifact'
          },
          createdAt: '2026-03-16T09:00:30.000Z'
        },
        {
          id: 'event-processing-2',
          eventType: 'error' as const,
          payload: {
            message: 'provider still offline'
          },
          createdAt: '2026-03-16T09:00:32.000Z'
        }
      ]
    }

    const exhaustedFailedSend = {
      ...processingFailedSend,
      artifactId: 'pdpe-exhausted-1',
      backgroundRetry: {
        status: 'exhausted' as const,
        autoRetryAttemptIndex: 3,
        maxAutoRetryAttempts: 3,
        nextRetryAt: null,
        claimedAt: null
      }
    }

    const listApprovedPersonaDraftProviderSends = vi.fn()
      .mockResolvedValueOnce([processingFailedSend])
      .mockResolvedValue([exhaustedFailedSend])

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      listApprovedDraftSendDestinations: vi.fn().mockResolvedValue([
        {
          destinationId: 'openrouter-qwen25-72b',
          label: 'OpenRouter / qwen-2.5-72b-instruct',
          resolutionMode: 'provider_model',
          provider: 'openrouter',
          model: 'qwen/qwen-2.5-72b-instruct',
          isDefault: false
        }
      ]),
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue(approvedReview),
      listApprovedPersonaDraftHandoffs: vi.fn().mockResolvedValue([]),
      listApprovedPersonaDraftProviderSends,
      sendApprovedPersonaDraftToProvider: vi.fn().mockResolvedValue(null),
      retryApprovedPersonaDraftProviderSend: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Auto retry: processing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry failed send now' })).toBeDisabled()

    await waitFor(() => {
      expect(listApprovedPersonaDraftProviderSends).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('Auto retry exhausted after 3 attempts')).toBeInTheDocument()
  })

  it('restores the last-used approved draft send destination from localStorage', async () => {
    window.localStorage.setItem('forgetme.memoryWorkspace.approvedDraftSendDestinationId', 'openrouter-qwen25-72b')

    const sandboxTurn = {
      turnId: 'turn-sandbox-restore-1',
      sessionId: 'session-sandbox-restore-1',
      ordinal: 1,
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      provider: null,
      model: null,
      contextHash: 'context-hash-sandbox-restore-1',
      promptHash: 'prompt-hash-sandbox-restore-1',
      createdAt: '2026-03-15T00:36:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她来写一段关于记录和归档的回复，会怎么写？',
        expressionMode: 'grounded' as const,
        workflowKind: 'persona_draft_sandbox' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        guardrail: {
          decision: 'sandbox_review_required' as const,
          reasonCodes: ['persona_draft_sandbox' as const, 'quote_trace_required' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        contextCards: [],
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档。',
          reviewState: 'review_required' as const,
          supportingExcerpts: [],
          trace: []
        }
      }
    }

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(sandboxTurn),
      listApprovedDraftSendDestinations: vi.fn().mockResolvedValue([
        {
          destinationId: 'memory-dialogue-default',
          label: 'Memory Dialogue Default',
          resolutionMode: 'memory_dialogue_default',
          provider: 'siliconflow',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          isDefault: true
        },
        {
          destinationId: 'openrouter-qwen25-72b',
          label: 'OpenRouter / qwen-2.5-72b-instruct',
          resolutionMode: 'provider_model',
          provider: 'openrouter',
          model: 'qwen/qwen-2.5-72b-instruct',
          isDefault: false
        }
      ]),
      getPersonaDraftReviewByTurn: vi.fn().mockResolvedValue({
        draftReviewId: 'review-restore-1',
        sourceTurnId: 'turn-sandbox-restore-1',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        workflowKind: 'persona_draft_sandbox',
        status: 'approved',
        baseDraft: '可审阅草稿：先把关键记录整理进归档。',
        editedDraft: '可审阅草稿：先把关键记录整理进归档。',
        reviewNotes: '',
        supportingExcerpts: [],
        trace: [],
        approvedJournalId: 'journal-approved-restore-1',
        rejectedJournalId: null,
        createdAt: '2026-03-16T01:00:00.000Z',
        updatedAt: '2026-03-16T01:07:00.000Z'
      }),
      listApprovedPersonaDraftHandoffs: vi.fn().mockResolvedValue([]),
      listApprovedPersonaDraftProviderSends: vi.fn().mockResolvedValue([]),
      sendApprovedPersonaDraftToProvider: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '如果她来写一段关于记录和归档的回复，会怎么写？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('heading', { name: 'Approved Draft Handoff' })).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('openrouter-qwen25-72b')
  })

  it('runs compare for an active sandbox response with sandbox workflow metadata and labels', async () => {
    const sandboxQuestion = '如果她来写一段关于记录和归档的回复，会怎么写？'
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([
      {
        sessionId: 'session-sandbox-existing',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        title: 'Memory Workspace · Alice Chen',
        latestQuestion: sandboxQuestion,
        turnCount: 1,
        createdAt: '2026-03-15T01:00:00.000Z',
        updatedAt: '2026-03-15T01:00:00.000Z'
      }
    ])
    const getMemoryWorkspaceSession = vi.fn().mockResolvedValue({
      sessionId: 'session-sandbox-existing',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      title: 'Memory Workspace · Alice Chen',
      latestQuestion: sandboxQuestion,
      turnCount: 1,
      createdAt: '2026-03-15T01:00:00.000Z',
      updatedAt: '2026-03-15T01:00:00.000Z',
      turns: [
        {
          turnId: 'turn-sandbox-existing',
          sessionId: 'session-sandbox-existing',
          ordinal: 1,
          question: sandboxQuestion,
          provider: null,
          model: null,
          contextHash: 'context-sandbox-existing',
          promptHash: 'prompt-sandbox-existing',
          createdAt: '2026-03-15T01:00:00.000Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: sandboxQuestion,
            expressionMode: 'grounded',
            workflowKind: 'persona_draft_sandbox',
            title: 'Memory Workspace · Alice Chen',
            answer: {
              summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'sandbox_review_required',
              reasonCodes: ['persona_draft_sandbox', 'quote_trace_required'],
              citationCount: 2,
              sourceKinds: ['file'],
              fallbackApplied: false
            },
            contextCards: [],
            boundaryRedirect: null,
            communicationEvidence: {
              title: 'Communication Evidence',
              summary: 'Direct archive-backed excerpts related to this ask.',
              excerpts: [
                {
                  excerptId: 'ce-1',
                  fileId: 'f-1',
                  fileName: 'chat-1.json',
                  ordinal: 1,
                  speakerDisplayName: 'Alice Chen',
                  text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
                }
              ]
            },
            personaDraft: {
              title: 'Reviewed draft sandbox',
              disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
              draft: '可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。',
              reviewState: 'review_required',
              supportingExcerpts: ['ce-1'],
              trace: [
                {
                  traceId: 'trace-1',
                  excerptIds: ['ce-1'],
                  explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
                }
              ]
            }
          }
        }
      ]
    })
    const listMemoryWorkspaceCompareSessions = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          compareSessionId: 'compare-session-sandbox-1',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          title: 'Memory Workspace Compare · Alice Chen',
          question: sandboxQuestion,
          expressionMode: 'grounded',
          workflowKind: 'persona_draft_sandbox',
          runCount: 2,
          metadata: {
            targetLabels: ['Local baseline', 'OpenRouter / Sandbox'],
            failedRunCount: 0,
            judge: {
              enabled: true,
              status: 'mixed'
            }
          },
          recommendation: {
            source: 'judge_assisted',
            decision: 'recommend_run',
            recommendedCompareRunId: 'compare-run-sandbox-2',
            recommendedTargetLabel: 'OpenRouter / Sandbox',
            rationale: 'A judge-assisted override selected the reviewed sandbox draft after full quote-trace review.'
          },
          createdAt: '2026-03-15T01:05:00.000Z',
          updatedAt: '2026-03-15T01:05:02.000Z'
        }
      ])
    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue({
      compareSessionId: 'compare-session-sandbox-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      title: 'Memory Workspace Compare · Alice Chen',
      question: sandboxQuestion,
      expressionMode: 'grounded',
      workflowKind: 'persona_draft_sandbox',
      runCount: 2,
      metadata: {
        targetLabels: ['Local baseline', 'OpenRouter / Sandbox'],
        failedRunCount: 0,
        judge: {
          enabled: true,
          status: 'mixed'
        }
      },
      recommendation: {
        source: 'judge_assisted',
        decision: 'recommend_run',
        recommendedCompareRunId: 'compare-run-sandbox-2',
        recommendedTargetLabel: 'OpenRouter / Sandbox',
        rationale: 'A judge-assisted override selected the reviewed sandbox draft after full quote-trace review.'
      },
      createdAt: '2026-03-15T01:05:00.000Z',
      updatedAt: '2026-03-15T01:05:02.000Z',
      runs: [
        {
          compareRunId: 'compare-run-sandbox-1',
          compareSessionId: 'compare-session-sandbox-1',
          ordinal: 1,
          target: {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          },
          provider: null,
          model: null,
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 18,
            maxScore: 20,
            band: 'strong',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 5, maxScore: 5, rationale: 'Draft stays grounded in quote-backed evidence.' },
              { key: 'traceability', label: 'Traceability', score: 4, maxScore: 5, rationale: 'Visible quote trace covers the draft structure.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 5, maxScore: 5, rationale: 'Simulation labeling remains explicit.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Draft is editable and readable.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'openrouter',
            model: 'judge-test-model',
            decision: 'aligned',
            score: 5,
            rationale: 'The sandbox baseline keeps simulation labeling and quote trace intact.',
            strengths: ['Simulation label preserved'],
            concerns: [],
            errorMessage: null,
            createdAt: '2026-03-15T01:05:01.000Z'
          },
          contextHash: 'compare-context-sandbox-1',
          promptHash: 'compare-prompt-sandbox-1',
          createdAt: '2026-03-15T01:05:00.500Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: sandboxQuestion,
            expressionMode: 'grounded',
            workflowKind: 'persona_draft_sandbox',
            title: 'Memory Workspace · Alice Chen',
            answer: {
              summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'sandbox_review_required',
              reasonCodes: ['persona_draft_sandbox', 'quote_trace_required'],
              citationCount: 2,
              sourceKinds: ['file'],
              fallbackApplied: false
            },
            contextCards: [],
            boundaryRedirect: null,
            communicationEvidence: null,
            personaDraft: {
              title: 'Reviewed draft sandbox',
              disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
              draft: '可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。',
              reviewState: 'review_required',
              supportingExcerpts: ['ce-1'],
              trace: [
                {
                  traceId: 'trace-1',
                  excerptIds: ['ce-1'],
                  explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
                }
              ]
            }
          }
        },
        {
          compareRunId: 'compare-run-sandbox-2',
          compareSessionId: 'compare-session-sandbox-1',
          ordinal: 2,
          target: {
            targetId: 'openrouter-sandbox',
            label: 'OpenRouter / Sandbox',
            executionMode: 'provider_model',
            provider: 'openrouter',
            model: 'or-sandbox-model'
          },
          provider: 'openrouter',
          model: 'or-sandbox-model',
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 17,
            maxScore: 20,
            band: 'strong',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 4, maxScore: 5, rationale: 'Draft mostly stays within quote-backed evidence.' },
              { key: 'traceability', label: 'Traceability', score: 4, maxScore: 5, rationale: 'Visible quote trace supports the candidate draft.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 5, maxScore: 5, rationale: 'Simulation labeling remains explicit.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Draft remains readable and editable.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'openrouter',
            model: 'judge-test-model',
            decision: 'aligned',
            score: 5,
            rationale: 'The candidate sandbox draft stays grounded and useful after quote-trace review.',
            strengths: ['Readable simulation draft'],
            concerns: [],
            errorMessage: null,
            createdAt: '2026-03-15T01:05:02.000Z'
          },
          contextHash: 'compare-context-sandbox-2',
          promptHash: 'compare-prompt-sandbox-2',
          createdAt: '2026-03-15T01:05:01.500Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: sandboxQuestion,
            expressionMode: 'grounded',
            workflowKind: 'persona_draft_sandbox',
            title: 'Memory Workspace · Alice Chen',
            answer: {
              summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'sandbox_review_required',
              reasonCodes: ['persona_draft_sandbox', 'quote_trace_required'],
              citationCount: 2,
              sourceKinds: ['file'],
              fallbackApplied: false
            },
            contextCards: [],
            boundaryRedirect: null,
            communicationEvidence: null,
            personaDraft: {
              title: 'Reviewed draft sandbox',
              disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
              draft: '可审阅草稿：先把这些记录整理进归档，再把关键细节补齐，方便后面统一回看。',
              reviewState: 'review_required',
              supportingExcerpts: ['ce-1'],
              trace: [
                {
                  traceId: 'trace-1',
                  excerptIds: ['ce-1'],
                  explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
                }
              ]
            }
          }
        }
      ]
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession,
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    await screen.findByText('Workflow: persona draft sandbox')

    fireEvent.click(screen.getByLabelText('Enable judge review'))
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: sandboxQuestion }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    await waitFor(() => {
      expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: sandboxQuestion,
        expressionMode: 'grounded',
        workflowKind: 'persona_draft_sandbox',
        judge: {
          enabled: true,
          provider: 'siliconflow'
        }
      })
    })

    const recommendationPanel = await screen.findByLabelText('Recommended Compare Result')
    expect(within(recommendationPanel).getByText('Recommendation source: judge-assisted')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('A judge-assisted override selected the reviewed sandbox draft after full quote-trace review.')).toBeInTheDocument()
    expect(screen.getAllByText('Workflow: persona draft sandbox').length).toBeGreaterThan(1)
    const candidateRun = screen.getByLabelText('Compare Run 2')
    expect(within(candidateRun).getByRole('heading', { name: 'OpenRouter / Sandbox' })).toBeInTheDocument()
    expect(screen.getByText('可审阅草稿：先把这些记录整理进归档，再把关键细节补齐，方便后面统一回看。')).toBeInTheDocument()
  })

  it('shows a scope-aware empty state before the first question', async () => {
    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn()
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    expect(screen.getByText('Ask about the whole archive, people, groups, or review pressure.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    expect(await screen.findByText('No saved sessions for this scope yet.')).toBeInTheDocument()
  })

  it('runs compare for the current question and renders compare results', async () => {
    const listMemoryWorkspaceCompareSessions = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          compareSessionId: 'compare-session-1',
          scope: { kind: 'global' },
          title: 'Memory Workspace Compare · Global',
          question: '现在最值得关注什么？',
          expressionMode: 'advice',
          runCount: 2,
          metadata: {
            targetLabels: ['Local baseline', 'SiliconFlow / Compare'],
            failedRunCount: 0,
            judge: {
              enabled: true,
              status: 'completed'
            }
          },
          recommendation: {
            source: 'deterministic',
            decision: 'recommend_run',
            recommendedCompareRunId: 'compare-run-1',
            recommendedTargetLabel: 'Local baseline',
            rationale: 'Highest deterministic rubric score after tie-break to the safer baseline.'
          },
          createdAt: '2026-03-14T05:00:00.000Z',
          updatedAt: '2026-03-14T05:00:02.000Z'
        }
      ])

    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue({
      compareSessionId: 'compare-session-1',
      scope: { kind: 'global' },
      title: 'Memory Workspace Compare · Global',
      question: '现在最值得关注什么？',
      expressionMode: 'advice',
      runCount: 2,
      metadata: {
        targetLabels: ['Local baseline', 'SiliconFlow / Compare'],
        failedRunCount: 0,
        judge: {
          enabled: true,
          status: 'completed'
        }
      },
      createdAt: '2026-03-14T05:00:00.000Z',
      updatedAt: '2026-03-14T05:00:02.000Z',
      recommendation: {
        source: 'deterministic',
        decision: 'recommend_run',
        recommendedCompareRunId: 'compare-run-1',
        recommendedTargetLabel: 'Local baseline',
        rationale: 'Highest deterministic rubric score after tie-break to the safer baseline.'
      },
      runs: [
        {
          compareRunId: 'compare-run-1',
          compareSessionId: 'compare-session-1',
          ordinal: 1,
          target: {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          },
          provider: null,
          model: null,
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 14,
            maxScore: 20,
            band: 'acceptable',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 4, maxScore: 5, rationale: 'Conflict-safe fallback kept.' },
              { key: 'traceability', label: 'Traceability', score: 1, maxScore: 5, rationale: 'No direct citations were attached.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 5, maxScore: 5, rationale: 'Summary preserves conflict framing.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Answer stays readable and actionable.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'siliconflow',
            model: 'judge-test-model',
            decision: 'aligned',
            score: 4,
            rationale: 'The baseline answer stays grounded and keeps the conflict-safe framing.',
            strengths: ['Grounded scope preserved'],
            concerns: [],
            errorMessage: null,
            createdAt: '2026-03-14T05:00:01.500Z'
          },
          contextHash: 'compare-context-1',
          promptHash: 'compare-prompt-1',
          createdAt: '2026-03-14T05:00:01.000Z',
          response: {
            scope: { kind: 'global' },
            question: '现在最值得关注什么？',
            expressionMode: 'advice',
            title: 'Memory Workspace · Global',
            answer: {
              summary: '2 pending review items remain across 1 conflict group.',
              displayType: 'open_conflict',
              citations: []
            },
            guardrail: {
              decision: 'fallback_to_conflict',
              reasonCodes: ['open_conflict_present'],
              citationCount: 0,
              sourceKinds: [],
              fallbackApplied: true
            },
            contextCards: []
          }
        },
        {
          compareRunId: 'compare-run-2',
          compareSessionId: 'compare-session-1',
          ordinal: 2,
          target: {
            targetId: 'siliconflow-default',
            label: 'SiliconFlow / Compare',
            executionMode: 'provider_model',
            provider: 'siliconflow',
            model: 'sf-test-model'
          },
          provider: 'siliconflow',
          model: 'sf-test-model',
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 14,
            maxScore: 20,
            band: 'acceptable',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 4, maxScore: 5, rationale: 'Conflict-safe fallback kept.' },
              { key: 'traceability', label: 'Traceability', score: 1, maxScore: 5, rationale: 'No direct citations were attached.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 5, maxScore: 5, rationale: 'Summary preserves conflict framing.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Answer stays readable and actionable.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'siliconflow',
            model: 'judge-test-model',
            decision: 'needs_review',
            score: 3,
            rationale: 'The provider summary stays grounded but should be reviewed against the baseline wording.',
            strengths: ['Grounded scope preserved'],
            concerns: ['Review summary style against baseline phrasing'],
            errorMessage: null,
            createdAt: '2026-03-14T05:00:02.500Z'
          },
          contextHash: 'compare-context-2',
          promptHash: 'compare-prompt-2',
          createdAt: '2026-03-14T05:00:02.000Z',
          response: {
            scope: { kind: 'global' },
            question: '现在最值得关注什么？',
            expressionMode: 'advice',
            title: 'Memory Workspace · Global',
            answer: {
              summary: '[siliconflow] Keep focus on the remaining conflict group.',
              displayType: 'open_conflict',
              citations: []
            },
            guardrail: {
              decision: 'fallback_to_conflict',
              reasonCodes: ['open_conflict_present'],
              citationCount: 0,
              sourceKinds: [],
              fallbackApplied: true
            },
            contextCards: []
          }
        }
      ]
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    expect(screen.getByLabelText('Include local baseline')).toBeChecked()
    expect(screen.getByLabelText('Include SiliconFlow target')).toBeChecked()
    expect(screen.getByLabelText('Include OpenRouter target')).toBeChecked()
    expect(screen.getByLabelText('Enable judge review')).toBeInTheDocument()
    expect(screen.queryByLabelText('Judge provider')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Judge model override')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Enable judge review'))
    fireEvent.change(screen.getByLabelText('Response mode'), {
      target: { value: 'advice' }
    })
    fireEvent.change(screen.getByLabelText('Judge provider'), {
      target: { value: 'openrouter' }
    })
    fireEvent.change(screen.getByLabelText('Judge model override'), {
      target: { value: 'judge-openrouter-model' }
    })
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '现在最值得关注什么？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    expect(await screen.findByText('Compare Results')).toBeInTheDocument()
    expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice',
      judge: {
        enabled: true,
        provider: 'openrouter',
        model: 'judge-openrouter-model'
      }
    })
    const recommendationPanel = screen.getByLabelText('Recommended Compare Result')
    expect(within(recommendationPanel).getByText('Recommended result')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('Recommendation source: deterministic')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('Highest deterministic rubric score after tie-break to the safer baseline.')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('Local baseline')).toBeInTheDocument()
    expect(screen.getByText('Targets: Local baseline, SiliconFlow / Compare')).toBeInTheDocument()
    expect(screen.getByText('Judge: completed')).toBeInTheDocument()
    expect(screen.getByText('SiliconFlow / Compare')).toBeInTheDocument()
    expect(screen.getByText(/sf-test-model/)).toBeInTheDocument()
    expect(screen.getAllByText('Score: 14/20')).toHaveLength(2)
    expect(screen.getAllByText('Band: acceptable')).toHaveLength(2)
    expect(screen.getAllByText('Mode: advice')).toHaveLength(3)
    expect(screen.getAllByText(/Groundedness/)).toHaveLength(2)
    expect(screen.getAllByText('Judge verdict')).toHaveLength(2)
    const judgePanelOne = screen.getByLabelText('Judge Verdict 1')
    const judgePanelTwo = screen.getByLabelText('Judge Verdict 2')
    expect(within(judgePanelOne).getByText('Judge status: completed')).toBeInTheDocument()
    expect(within(judgePanelOne).getByText('Judge decision: aligned')).toBeInTheDocument()
    expect(within(judgePanelOne).getByText('Judge score: 4/5')).toBeInTheDocument()
    expect(within(judgePanelTwo).getByText('Judge decision: needs_review')).toBeInTheDocument()
    expect(within(judgePanelTwo).getByText('The provider summary stays grounded but should be reviewed against the baseline wording.')).toBeInTheDocument()
    expect(within(judgePanelTwo).getByText('Review summary style against baseline phrasing')).toBeInTheDocument()
    expect(screen.getByText('[siliconflow] Keep focus on the remaining conflict group.')).toBeInTheDocument()
  })

  it('renders judge-assisted recommendation source copy when judge override wins', async () => {
    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            compareSessionId: 'compare-session-judge-assisted',
            scope: { kind: 'global' },
            title: 'Memory Workspace Compare · Global',
            question: '哪个答案更适合发给我？',
            runCount: 1,
            metadata: {
              targetLabels: ['SiliconFlow / Compare'],
              failedRunCount: 0,
              judge: {
                enabled: true,
                status: 'completed'
              }
            },
            recommendation: {
              source: 'judge_assisted',
              decision: 'recommend_run',
              recommendedCompareRunId: 'compare-run-judge-assisted',
              recommendedTargetLabel: 'SiliconFlow / Compare',
              rationale: 'A judge-assisted override selected the only aligned winner after full judge review.'
            },
            createdAt: '2026-03-14T05:30:00.000Z',
            updatedAt: '2026-03-14T05:30:02.000Z'
          }
        ]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue({
        compareSessionId: 'compare-session-judge-assisted',
        scope: { kind: 'global' },
        title: 'Memory Workspace Compare · Global',
        question: '哪个答案更适合发给我？',
        runCount: 1,
        metadata: {
          targetLabels: ['SiliconFlow / Compare'],
          failedRunCount: 0,
          judge: {
            enabled: true,
            status: 'completed'
          }
        },
        recommendation: {
          source: 'judge_assisted',
          decision: 'recommend_run',
          recommendedCompareRunId: 'compare-run-judge-assisted',
          recommendedTargetLabel: 'SiliconFlow / Compare',
          rationale: 'A judge-assisted override selected the only aligned winner after full judge review.'
        },
        createdAt: '2026-03-14T05:30:00.000Z',
        updatedAt: '2026-03-14T05:30:02.000Z',
        runs: [
          {
            compareRunId: 'compare-run-judge-assisted',
            compareSessionId: 'compare-session-judge-assisted',
            ordinal: 1,
            target: {
              targetId: 'siliconflow-default',
              label: 'SiliconFlow / Compare',
              executionMode: 'provider_model',
              provider: 'siliconflow',
              model: 'sf-test-model'
            },
            provider: 'siliconflow',
            model: 'sf-test-model',
            status: 'completed',
            errorMessage: null,
            evaluation: {
              totalScore: 14,
              maxScore: 20,
              band: 'acceptable',
              dimensions: []
            },
            judge: {
              status: 'completed',
              provider: 'siliconflow',
              model: 'judge-test-model',
              decision: 'aligned',
              score: 5,
              rationale: 'Aligned and specific.',
              strengths: ['Grounded'],
              concerns: [],
              errorMessage: null,
              createdAt: '2026-03-14T05:30:01.000Z'
            },
            contextHash: 'compare-context-judge-assisted',
            promptHash: 'compare-prompt-judge-assisted',
            createdAt: '2026-03-14T05:30:00.500Z',
            response: {
              scope: { kind: 'global' },
              question: '哪个答案更适合发给我？',
              title: 'Memory Workspace · Global',
              answer: {
                summary: 'Judge-backed provider answer.',
                displayType: 'derived_summary',
                citations: []
              },
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: false
              },
              contextCards: []
            }
          }
        ]
      })
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.click(screen.getByLabelText('Enable judge review'))
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '哪个答案更适合发给我？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    const recommendationPanel = await screen.findByLabelText('Recommended Compare Result')
    expect(within(recommendationPanel).getByText('Recommendation source: judge-assisted')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('SiliconFlow / Compare')).toBeInTheDocument()
    expect(within(recommendationPanel).getByText('A judge-assisted override selected the only aligned winner after full judge review.')).toBeInTheDocument()
  })

  it('forwards custom compare targets when target selection or model overrides change', async () => {
    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue(null)
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([])
    const listMemoryWorkspaceCompareSessions = vi.fn().mockResolvedValue([])

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(1)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByLabelText('Include local baseline'))
    fireEvent.click(screen.getByLabelText('Include OpenRouter target'))
    fireEvent.change(screen.getByLabelText('SiliconFlow model'), {
      target: { value: 'Qwen/Qwen2.5-32B-Instruct' }
    })
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '给我一组对比结果' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    await waitFor(() => {
      expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
        scope: { kind: 'global' },
        question: '给我一组对比结果',
        expressionMode: 'grounded',
        judge: {
          enabled: false
        },
        targets: [
          {
            targetId: 'siliconflow-qwen25-72b',
            label: 'SiliconFlow / Qwen2.5-72B-Instruct',
            executionMode: 'provider_model',
            provider: 'siliconflow',
            model: 'Qwen/Qwen2.5-32B-Instruct'
          }
        ]
      })
    })
    await waitFor(() => {
      expect(screen.getByText('No compare result is available for this scope yet.')).toBeInTheDocument()
    })
  })

  it('disables compare when no targets are selected', async () => {
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([])
    const listMemoryWorkspaceCompareSessions = vi.fn().mockResolvedValue([])

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(1)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '先别跑' }
    })
    fireEvent.click(screen.getByLabelText('Include local baseline'))
    fireEvent.click(screen.getByLabelText('Include SiliconFlow target'))
    fireEvent.click(screen.getByLabelText('Include OpenRouter target'))

    expect(screen.getByRole('button', { name: 'Run compare' })).toBeDisabled()
    expect(screen.getByText('Select at least one compare target.')).toBeInTheDocument()
  })

  it('renders skipped and failed judge states without hiding compare results', async () => {
    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue({
        compareSessionId: 'compare-session-2',
        scope: { kind: 'global' },
        title: 'Memory Workspace Compare · Global',
        question: '哪些答案需要复核？',
        runCount: 2,
        createdAt: '2026-03-14T06:00:00.000Z',
        updatedAt: '2026-03-14T06:00:02.000Z',
        recommendation: {
          source: 'deterministic',
          decision: 'recommend_run',
          recommendedCompareRunId: 'compare-run-3',
          recommendedTargetLabel: 'Local baseline',
          rationale: 'Deterministic rubric still prefers the safer baseline.'
        },
        runs: [
          {
            compareRunId: 'compare-run-3',
            compareSessionId: 'compare-session-2',
            ordinal: 1,
            target: {
              targetId: 'baseline-local',
              label: 'Local baseline',
              executionMode: 'local_baseline'
            },
            provider: null,
            model: null,
            status: 'completed',
            errorMessage: null,
            evaluation: {
              totalScore: 18,
              maxScore: 20,
              band: 'strong',
              dimensions: [
                { key: 'groundedness', label: 'Groundedness', score: 5, maxScore: 5, rationale: 'Grounded.' },
                { key: 'traceability', label: 'Traceability', score: 4, maxScore: 5, rationale: 'Traceable.' },
                { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 5, maxScore: 5, rationale: 'Aligned.' },
                { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Useful.' }
              ]
            },
            judge: {
              status: 'skipped',
              provider: null,
              model: null,
              decision: null,
              score: null,
              rationale: 'Judge model is disabled for this compare run.',
              strengths: [],
              concerns: [],
              errorMessage: null,
              createdAt: '2026-03-14T06:00:00.500Z'
            },
            contextHash: 'compare-context-3',
            promptHash: 'compare-prompt-3',
            createdAt: '2026-03-14T06:00:00.000Z',
            response: {
              scope: { kind: 'global' },
              question: '哪些答案需要复核？',
              title: 'Memory Workspace · Global',
              answer: {
                summary: 'Local baseline remains the safest answer.',
                displayType: 'derived_summary',
                citations: []
              },
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 2,
                sourceKinds: ['person'],
                fallbackApplied: false
              },
              contextCards: []
            }
          },
          {
            compareRunId: 'compare-run-4',
            compareSessionId: 'compare-session-2',
            ordinal: 2,
            target: {
              targetId: 'openrouter-default',
              label: 'OpenRouter / Compare',
              executionMode: 'provider_model',
              provider: 'openrouter',
              model: 'or-test-model'
            },
            provider: 'openrouter',
            model: 'or-test-model',
            status: 'completed',
            errorMessage: null,
            evaluation: {
              totalScore: 13,
              maxScore: 20,
              band: 'acceptable',
              dimensions: [
                { key: 'groundedness', label: 'Groundedness', score: 4, maxScore: 5, rationale: 'Grounded.' },
                { key: 'traceability', label: 'Traceability', score: 3, maxScore: 5, rationale: 'Traceable.' },
                { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 3, maxScore: 5, rationale: 'Borderline.' },
                { key: 'usefulness', label: 'Usefulness', score: 3, maxScore: 5, rationale: 'Useful enough.' }
              ]
            },
            judge: {
              status: 'failed',
              provider: 'openrouter',
              model: 'judge-test-model',
              decision: null,
              score: null,
              rationale: 'Judge model failed before a verdict could be completed.',
              strengths: [],
              concerns: [],
              errorMessage: 'judge timeout',
              createdAt: '2026-03-14T06:00:02.000Z'
            },
            contextHash: 'compare-context-4',
            promptHash: 'compare-prompt-4',
            createdAt: '2026-03-14T06:00:01.000Z',
            response: {
              scope: { kind: 'global' },
              question: '哪些答案需要复核？',
              title: 'Memory Workspace · Global',
              answer: {
                summary: 'OpenRouter answer should be checked again.',
                displayType: 'derived_summary',
                citations: []
              },
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 1,
                sourceKinds: ['person'],
                fallbackApplied: false
              },
              contextCards: []
            }
          }
        ]
      })
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '哪些答案需要复核？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    expect(await screen.findByText('Compare Results')).toBeInTheDocument()
    expect(screen.getByText('Judge status: skipped')).toBeInTheDocument()
    expect(screen.getByText('Judge model is disabled for this compare run.')).toBeInTheDocument()
    expect(screen.getByText('Judge status: failed')).toBeInTheDocument()
    expect(screen.getByText('Judge error: judge timeout')).toBeInTheDocument()
  })

  it('hydrates and persists compare judge defaults from localStorage', async () => {
    window.localStorage.setItem('forgetme.memoryWorkspace.compareJudgeDefaults', JSON.stringify({
      enabled: true,
      provider: 'openrouter',
      model: 'saved-judge-model'
    }))

    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue(null)
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([])
    const listMemoryWorkspaceCompareSessions = vi.fn().mockResolvedValue([])

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare
    })

    const { rerender } = render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(1)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByLabelText('Enable judge review')).toBeChecked()
    expect(screen.getByLabelText('Judge provider')).toHaveValue('openrouter')
    expect(screen.getByLabelText('Judge model override')).toHaveValue('saved-judge-model')

    fireEvent.change(screen.getByLabelText('Judge model override'), {
      target: { value: 'saved-judge-model-v2' }
    })
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '现在最值得关注什么？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'grounded',
      judge: {
        enabled: true,
        provider: 'openrouter',
        model: 'saved-judge-model-v2'
      }
    })

    expect(JSON.parse(window.localStorage.getItem('forgetme.memoryWorkspace.compareJudgeDefaults') ?? '{}')).toEqual({
      enabled: true,
      provider: 'openrouter',
      model: 'saved-judge-model-v2'
    })

    rerender(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(2)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByLabelText('Enable judge review')).toBeChecked()
    expect(screen.getByLabelText('Judge provider')).toHaveValue('openrouter')
    expect(screen.getByLabelText('Judge model override')).toHaveValue('saved-judge-model-v2')
  })

  it('hydrates and persists compare target defaults from localStorage', async () => {
    window.localStorage.setItem('forgetme.memoryWorkspace.compareTargetDefaults', JSON.stringify({
      localBaselineEnabled: false,
      siliconflowEnabled: true,
      siliconflowModel: 'Qwen/Qwen2.5-32B-Instruct',
      openrouterEnabled: false,
      openrouterModel: 'openrouter/custom-model'
    }))

    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue(null)
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([])
    const listMemoryWorkspaceCompareSessions = vi.fn().mockResolvedValue([])

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare
    })

    const { rerender } = render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(1)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByLabelText('Include local baseline')).not.toBeChecked()
    expect(screen.getByLabelText('Include SiliconFlow target')).toBeChecked()
    expect(screen.getByLabelText('SiliconFlow model')).toHaveValue('Qwen/Qwen2.5-32B-Instruct')
    expect(screen.getByLabelText('Include OpenRouter target')).not.toBeChecked()
    expect(screen.getByLabelText('OpenRouter model')).toHaveValue('openrouter/custom-model')

    fireEvent.click(screen.getByLabelText('Include OpenRouter target'))
    fireEvent.change(screen.getByLabelText('OpenRouter model'), {
      target: { value: 'openrouter/custom-model-v2' }
    })
    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '保留这些对比默认值' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    await waitFor(() => {
      expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
        scope: { kind: 'global' },
        question: '保留这些对比默认值',
        expressionMode: 'grounded',
        judge: {
          enabled: false
        },
        targets: [
          {
            targetId: 'siliconflow-qwen25-72b',
            label: 'SiliconFlow / Qwen2.5-72B-Instruct',
            executionMode: 'provider_model',
            provider: 'siliconflow',
            model: 'Qwen/Qwen2.5-32B-Instruct'
          },
          {
            targetId: 'openrouter-qwen25-72b',
            label: 'OpenRouter / qwen-2.5-72b-instruct',
            executionMode: 'provider_model',
            provider: 'openrouter',
            model: 'openrouter/custom-model-v2'
          }
        ]
      })
    })

    expect(JSON.parse(window.localStorage.getItem('forgetme.memoryWorkspace.compareTargetDefaults') ?? '{}')).toEqual({
      localBaselineEnabled: false,
      siliconflowEnabled: true,
      siliconflowModel: 'Qwen/Qwen2.5-32B-Instruct',
      openrouterEnabled: true,
      openrouterModel: 'openrouter/custom-model-v2'
    })

    rerender(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(2)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByLabelText('Include local baseline')).not.toBeChecked()
    expect(screen.getByLabelText('Include SiliconFlow target')).toBeChecked()
    expect(screen.getByLabelText('SiliconFlow model')).toHaveValue('Qwen/Qwen2.5-32B-Instruct')
    expect(screen.getByLabelText('Include OpenRouter target')).toBeChecked()
    expect(screen.getByLabelText('OpenRouter model')).toHaveValue('openrouter/custom-model-v2')
  })

  it('reuses the selected compare session setup in the active compare form', async () => {
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([])
    const listMemoryWorkspaceCompareSessions = vi.fn().mockResolvedValue([
      {
        compareSessionId: 'compare-session-reuse-1',
        scope: { kind: 'global' },
        title: 'Memory Workspace Compare · Global',
        question: '复用这组历史对比配置',
        runCount: 2,
        metadata: {
          targetLabels: ['Local baseline', 'OpenRouter / qwen-2.5-72b-instruct'],
          failedRunCount: 0,
          judge: {
            enabled: true,
            status: 'completed'
          }
        },
        recommendation: {
          source: 'deterministic',
          decision: 'recommend_run',
          recommendedCompareRunId: 'compare-run-reuse-1',
          recommendedTargetLabel: 'Local baseline',
          rationale: 'Local baseline remained safest.'
        },
        createdAt: '2026-03-14T08:00:00.000Z',
        updatedAt: '2026-03-14T08:00:10.000Z'
      }
    ])
    const getMemoryWorkspaceCompareSession = vi.fn().mockResolvedValue({
      compareSessionId: 'compare-session-reuse-1',
      scope: { kind: 'global' },
      title: 'Memory Workspace Compare · Global',
      question: '复用这组历史对比配置',
      runCount: 2,
      metadata: {
        targetLabels: ['Local baseline', 'OpenRouter / qwen-2.5-72b-instruct'],
        failedRunCount: 0,
        judge: {
          enabled: true,
          status: 'completed'
        }
      },
      recommendation: {
        source: 'deterministic',
        decision: 'recommend_run',
        recommendedCompareRunId: 'compare-run-reuse-1',
        recommendedTargetLabel: 'Local baseline',
        rationale: 'Local baseline remained safest.'
      },
      createdAt: '2026-03-14T08:00:00.000Z',
      updatedAt: '2026-03-14T08:00:10.000Z',
      runs: [
        {
          compareRunId: 'compare-run-reuse-1',
          compareSessionId: 'compare-session-reuse-1',
          ordinal: 1,
          target: {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          },
          provider: null,
          model: null,
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 17,
            maxScore: 20,
            band: 'strong',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 5, maxScore: 5, rationale: 'Grounded.' },
              { key: 'traceability', label: 'Traceability', score: 4, maxScore: 5, rationale: 'Traceable.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 4, maxScore: 5, rationale: 'Aligned.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Useful.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'openrouter',
            model: 'judge-openrouter-v2',
            decision: 'aligned',
            score: 4,
            rationale: 'Looks aligned.',
            strengths: [],
            concerns: [],
            errorMessage: null,
            createdAt: '2026-03-14T08:00:05.000Z'
          },
          contextHash: 'reuse-context-1',
          promptHash: 'reuse-prompt-1',
          createdAt: '2026-03-14T08:00:01.000Z',
          response: {
            scope: { kind: 'global' },
            question: '复用这组历史对比配置',
            title: 'Memory Workspace · Global',
            answer: {
              summary: 'Baseline answer.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'grounded_answer',
              reasonCodes: [],
              citationCount: 1,
              sourceKinds: ['person'],
              fallbackApplied: false
            },
            contextCards: []
          }
        },
        {
          compareRunId: 'compare-run-reuse-2',
          compareSessionId: 'compare-session-reuse-1',
          ordinal: 2,
          target: {
            targetId: 'openrouter-qwen25-72b',
            label: 'OpenRouter / qwen-2.5-72b-instruct',
            executionMode: 'provider_model',
            provider: 'openrouter',
            model: 'openrouter/custom-rerun-model'
          },
          provider: 'openrouter',
          model: 'openrouter/custom-rerun-model',
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 15,
            maxScore: 20,
            band: 'acceptable',
            dimensions: [
              { key: 'groundedness', label: 'Groundedness', score: 4, maxScore: 5, rationale: 'Grounded.' },
              { key: 'traceability', label: 'Traceability', score: 4, maxScore: 5, rationale: 'Traceable.' },
              { key: 'guardrail_alignment', label: 'Guardrail Alignment', score: 3, maxScore: 5, rationale: 'Mostly aligned.' },
              { key: 'usefulness', label: 'Usefulness', score: 4, maxScore: 5, rationale: 'Useful.' }
            ]
          },
          judge: {
            status: 'completed',
            provider: 'openrouter',
            model: 'judge-openrouter-v2',
            decision: 'needs_review',
            score: 3,
            rationale: 'Review wording.',
            strengths: [],
            concerns: ['Needs comparison to baseline wording'],
            errorMessage: null,
            createdAt: '2026-03-14T08:00:06.000Z'
          },
          contextHash: 'reuse-context-2',
          promptHash: 'reuse-prompt-2',
          createdAt: '2026-03-14T08:00:02.000Z',
          response: {
            scope: { kind: 'global' },
            question: '复用这组历史对比配置',
            title: 'Memory Workspace · Global',
            answer: {
              summary: 'OpenRouter answer.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'grounded_answer',
              reasonCodes: [],
              citationCount: 1,
              sourceKinds: ['person'],
              fallbackApplied: false
            },
            contextCards: []
          }
        }
      ]
    })
    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue(null)

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions,
      getMemoryWorkspaceCompareSession,
      runMemoryWorkspaceCompare
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    await waitFor(() => {
      expect(listMemoryWorkspaceSessions).toHaveBeenCalledTimes(1)
      expect(listMemoryWorkspaceCompareSessions).toHaveBeenCalledTimes(1)
      expect(getMemoryWorkspaceCompareSession).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: /Memory Workspace Compare · Global · 复用这组历史对比配置/ }))

    await waitFor(() => {
      expect(getMemoryWorkspaceCompareSession).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use selected compare setup' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Ask memory workspace')).toHaveValue('复用这组历史对比配置')
      expect(screen.getByLabelText('Include local baseline')).toBeChecked()
      expect(screen.getByLabelText('Include SiliconFlow target')).not.toBeChecked()
      expect(screen.getByLabelText('Include OpenRouter target')).toBeChecked()
      expect(screen.getByLabelText('OpenRouter model')).toHaveValue('openrouter/custom-rerun-model')
      expect(screen.getByLabelText('Enable judge review')).toBeChecked()
      expect(screen.getByLabelText('Judge provider')).toHaveValue('openrouter')
      expect(screen.getByLabelText('Judge model override')).toHaveValue('judge-openrouter-v2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))

    await waitFor(() => {
      expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith({
        scope: { kind: 'global' },
        question: '复用这组历史对比配置',
        expressionMode: 'grounded',
        judge: {
          enabled: true,
          provider: 'openrouter',
          model: 'judge-openrouter-v2'
        },
        targets: [
          {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          },
          {
            targetId: 'openrouter-qwen25-72b',
            label: 'OpenRouter / qwen-2.5-72b-instruct',
            executionMode: 'provider_model',
            provider: 'openrouter',
            model: 'openrouter/custom-rerun-model'
          }
        ]
      })
    })
    await waitFor(() => {
      expect(screen.getByText('No compare result is available for this scope yet.')).toBeInTheDocument()
    })
  })

  it('runs a compare matrix from structured rows and can open a child compare session', async () => {
    const runMemoryWorkspaceCompareMatrix = vi.fn().mockResolvedValue({
      matrixSessionId: 'matrix-session-1',
      title: 'Daily matrix',
      rowCount: 2,
      completedRowCount: 2,
      failedRowCount: 0,
      metadata: {
        targetLabels: ['Local baseline'],
        judge: {
          enabled: false,
          status: 'disabled'
        }
      },
      createdAt: '2026-03-14T07:00:00.000Z',
      updatedAt: '2026-03-14T07:00:02.000Z',
      rows: [
        {
          matrixRowId: 'matrix-row-1',
          matrixSessionId: 'matrix-session-1',
          ordinal: 1,
          label: 'Global row',
          scope: { kind: 'global' },
          question: '现在最值得关注什么？',
          status: 'completed',
          errorMessage: null,
          compareSessionId: 'compare-session-1',
          recommendedCompareRunId: 'compare-run-1',
          recommendedTargetLabel: 'Local baseline',
          failedRunCount: 0,
          createdAt: '2026-03-14T07:00:01.000Z'
        },
        {
          matrixRowId: 'matrix-row-2',
          matrixSessionId: 'matrix-session-1',
          ordinal: 2,
          label: null,
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          question: '她有哪些已确认信息？',
          status: 'completed',
          errorMessage: null,
          compareSessionId: 'compare-session-2',
          recommendedCompareRunId: 'compare-run-2',
          recommendedTargetLabel: 'Local baseline',
          failedRunCount: 0,
          createdAt: '2026-03-14T07:00:02.000Z'
        }
      ]
    })
    const listMemoryWorkspaceCompareMatrices = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          matrixSessionId: 'matrix-session-1',
          title: 'Daily matrix',
          expressionMode: 'advice',
          rowCount: 2,
          completedRowCount: 2,
          failedRowCount: 0,
          metadata: {
            targetLabels: ['Local baseline'],
            judge: {
              enabled: false,
              status: 'disabled'
            }
          },
          createdAt: '2026-03-14T07:00:00.000Z',
          updatedAt: '2026-03-14T07:00:02.000Z'
        }
      ])
    const getMemoryWorkspaceCompareSession = vi.fn().mockResolvedValue({
      compareSessionId: 'compare-session-1',
      scope: { kind: 'global' },
      title: 'Memory Workspace Compare · Global',
      question: '现在最值得关注什么？',
      expressionMode: 'advice',
      runCount: 1,
      metadata: {
        targetLabels: ['Local baseline'],
        failedRunCount: 0,
        judge: {
          enabled: false,
          status: 'disabled'
        }
      },
      recommendation: {
        source: 'deterministic',
        decision: 'recommend_run',
        recommendedCompareRunId: 'compare-run-1',
        recommendedTargetLabel: 'Local baseline',
        rationale: 'Best deterministic score.'
      },
      createdAt: '2026-03-14T07:00:00.000Z',
      updatedAt: '2026-03-14T07:00:01.000Z',
      runs: [
        {
          compareRunId: 'compare-run-1',
          compareSessionId: 'compare-session-1',
          ordinal: 1,
          target: {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          },
          provider: null,
          model: null,
          status: 'completed',
          errorMessage: null,
          evaluation: {
            totalScore: 20,
            maxScore: 20,
            band: 'strong',
            dimensions: []
          },
          judge: {
            status: 'skipped',
            provider: null,
            model: null,
            decision: null,
            score: null,
            rationale: 'Judge disabled.',
            strengths: [],
            concerns: [],
            errorMessage: null,
            createdAt: '2026-03-14T07:00:01.000Z'
          },
          contextHash: 'context-hash-1',
          promptHash: 'prompt-hash-1',
          createdAt: '2026-03-14T07:00:01.000Z',
          response: {
            scope: { kind: 'global' },
            question: '现在最值得关注什么？',
            expressionMode: 'advice',
            title: 'Memory Workspace · Global',
            answer: {
              summary: 'Grounded matrix result.',
              displayType: 'derived_summary',
              citations: []
            },
            guardrail: {
              decision: 'grounded_answer',
              reasonCodes: [],
              citationCount: 0,
              sourceKinds: [],
              fallbackApplied: false
            },
            contextCards: []
          }
        }
      ]
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession,
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompareMatrix,
      listMemoryWorkspaceCompareMatrices,
      getMemoryWorkspaceCompareMatrix: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.change(screen.getByLabelText('Response mode'), {
      target: { value: 'advice' }
    })
    fireEvent.change(screen.getByLabelText('Compare matrix title'), {
      target: { value: 'Daily matrix' }
    })
    fireEvent.change(screen.getByLabelText('Compare matrix rows'), {
      target: { value: 'Global row | global | 现在最值得关注什么？\nperson:cp-1 | 她有哪些已确认信息？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run matrix compare' }))

    await waitFor(() => {
      expect(runMemoryWorkspaceCompareMatrix).toHaveBeenCalledWith({
        title: 'Daily matrix',
        expressionMode: 'advice',
        rows: [
          {
            label: 'Global row',
            scope: { kind: 'global' },
            question: '现在最值得关注什么？'
          },
          {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: '她有哪些已确认信息？'
          }
        ],
        judge: {
          enabled: false
        }
      })
    })

    expect(await screen.findByText('Saved Compare Matrices')).toBeInTheDocument()
    expect(screen.getByText('Rows: 2 · Completed: 2 · Failed: 0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Global row · global · 现在最值得关注什么？/ }))

    await waitFor(() => {
      expect(getMemoryWorkspaceCompareSession).toHaveBeenCalledWith('compare-session-1')
    })
    expect(await screen.findByText('Grounded matrix result.')).toBeInTheDocument()
    expect(screen.getAllByText('Mode: advice').length).toBeGreaterThanOrEqual(2)
  })

  it('shows a parse error for invalid compare matrix lines and does not run', async () => {
    const runMemoryWorkspaceCompareMatrix = vi.fn().mockResolvedValue(null)

    stubArchiveWindow({
      listMemoryWorkspaceSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceSession: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn().mockResolvedValue(null),
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompareMatrix,
      listMemoryWorkspaceCompareMatrices: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareMatrix: vi.fn().mockResolvedValue(null)
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    fireEvent.change(screen.getByLabelText('Compare matrix rows'), {
      target: { value: 'bad-line-without-separators' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run matrix compare' }))

    expect(await screen.findByText('Invalid matrix line 1. Use "scope | question" or "label | scope | question".')).toBeInTheDocument()
    expect(runMemoryWorkspaceCompareMatrix).not.toHaveBeenCalled()
  })
})
