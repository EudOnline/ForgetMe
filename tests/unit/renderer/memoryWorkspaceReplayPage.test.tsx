import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryWorkspacePage } from '../../../src/renderer/pages/MemoryWorkspacePage'

function stubArchiveWindow(archiveApi: Record<string, unknown>) {
  vi.stubGlobal('window', Object.assign(Object.create(window), { archiveApi }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MemoryWorkspacePage replay', () => {
  it('loads saved sessions for a scope and replays the newest session by default', async () => {
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([
      {
        sessionId: 'session-new',
        scope: { kind: 'global' },
        title: 'Memory Workspace · Global',
        latestQuestion: '现在最值得关注什么？',
        turnCount: 2,
        createdAt: '2026-03-13T12:01:00.000Z',
        updatedAt: '2026-03-13T12:03:00.000Z'
      },
      {
        sessionId: 'session-old',
        scope: { kind: 'global' },
        title: 'Memory Workspace · Global',
        latestQuestion: '更早的问题',
        turnCount: 1,
        createdAt: '2026-03-13T11:01:00.000Z',
        updatedAt: '2026-03-13T11:02:00.000Z'
      }
    ])
    const getMemoryWorkspaceSession = vi.fn()
      .mockResolvedValueOnce({
        sessionId: 'session-new',
        scope: { kind: 'global' },
        title: 'Memory Workspace · Global',
        latestQuestion: '现在最值得关注什么？',
        turnCount: 2,
        createdAt: '2026-03-13T12:01:00.000Z',
        updatedAt: '2026-03-13T12:03:00.000Z',
        turns: [
          {
            turnId: 'turn-1',
            sessionId: 'session-new',
            ordinal: 1,
            question: '第一问',
            provider: null,
            model: null,
            contextHash: 'context-1',
            promptHash: 'prompt-1',
            createdAt: '2026-03-13T12:01:00.000Z',
            response: {
              scope: { kind: 'global' },
              question: '第一问',
              title: 'Memory Workspace · Global',
              answer: { summary: '第一答', displayType: 'derived_summary', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: false
              }
            }
          },
          {
            turnId: 'turn-2',
            sessionId: 'session-new',
            ordinal: 2,
            question: '现在最值得关注什么？',
            provider: null,
            model: null,
            contextHash: 'context-2',
            promptHash: 'prompt-2',
            createdAt: '2026-03-13T12:03:00.000Z',
            response: {
              scope: { kind: 'global' },
              question: '现在最值得关注什么？',
              title: 'Memory Workspace · Global',
              answer: { summary: '第二答', displayType: 'open_conflict', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'fallback_to_conflict',
                reasonCodes: ['open_conflict_present'],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: true
              }
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        sessionId: 'session-old',
        scope: { kind: 'global' },
        title: 'Memory Workspace · Global',
        latestQuestion: '更早的问题',
        turnCount: 1,
        createdAt: '2026-03-13T11:01:00.000Z',
        updatedAt: '2026-03-13T11:02:00.000Z',
        turns: [
          {
            turnId: 'turn-old',
            sessionId: 'session-old',
            ordinal: 1,
            question: '更早的问题',
            provider: null,
            model: null,
            contextHash: 'context-old',
            promptHash: 'prompt-old',
            createdAt: '2026-03-13T11:02:00.000Z',
            response: {
              scope: { kind: 'global' },
              question: '更早的问题',
              title: 'Memory Workspace · Global',
              answer: { summary: '旧答复', displayType: 'derived_summary', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: false
              }
            }
          }
        ]
      })

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession,
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn()
    })

    render(<MemoryWorkspacePage scope={{ kind: 'global' }} />)

    expect(await screen.findByText('Saved Sessions')).toBeInTheDocument()
    expect(getMemoryWorkspaceSession).toHaveBeenCalledWith('session-new')
    expect(await screen.findByText('第二答')).toBeInTheDocument()
    expect(screen.getByText('fallback_to_conflict')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Memory Workspace · Global · 更早的问题' }))
    expect(await screen.findByText('旧答复')).toBeInTheDocument()
  })

  it('continues the selected session and keeps earlier turns visible', async () => {
    const listMemoryWorkspaceSessions = vi.fn()
      .mockResolvedValueOnce([
        {
          sessionId: 'session-1',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          title: 'Memory Workspace · Alice Chen',
          latestQuestion: '她现在有哪些还没解决的冲突？',
          turnCount: 1,
          createdAt: '2026-03-13T12:01:00.000Z',
          updatedAt: '2026-03-13T12:01:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          sessionId: 'session-1',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          title: 'Memory Workspace · Alice Chen',
          latestQuestion: '她有哪些已保存的资料？',
          turnCount: 2,
          createdAt: '2026-03-13T12:01:00.000Z',
          updatedAt: '2026-03-13T12:02:00.000Z'
        }
      ])

    const sessionWithOneTurn = {
      sessionId: 'session-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      title: 'Memory Workspace · Alice Chen',
      latestQuestion: '她现在有哪些还没解决的冲突？',
      turnCount: 1,
      createdAt: '2026-03-13T12:01:00.000Z',
      updatedAt: '2026-03-13T12:01:00.000Z',
      turns: [
        {
          turnId: 'turn-1',
          sessionId: 'session-1',
          ordinal: 1,
          question: '她现在有哪些还没解决的冲突？',
          provider: null,
          model: null,
          contextHash: 'context-1',
          promptHash: 'prompt-1',
          createdAt: '2026-03-13T12:01:00.000Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: '她现在有哪些还没解决的冲突？',
            title: 'Memory Workspace · Alice Chen',
            answer: { summary: '冲突答复', displayType: 'open_conflict', citations: [] },
            contextCards: [],
            guardrail: {
              decision: 'fallback_to_conflict',
              reasonCodes: ['open_conflict_present'],
              citationCount: 0,
              sourceKinds: [],
              fallbackApplied: true
            }
          }
        }
      ]
    }

    const sessionWithTwoTurns = {
      ...sessionWithOneTurn,
      latestQuestion: '她有哪些已保存的资料？',
      turnCount: 2,
      updatedAt: '2026-03-13T12:02:00.000Z',
      turns: [
        ...sessionWithOneTurn.turns,
        {
          turnId: 'turn-2',
          sessionId: 'session-1',
          ordinal: 2,
          question: '她有哪些已保存的资料？',
          provider: null,
          model: null,
          contextHash: 'context-2',
          promptHash: 'prompt-2',
          createdAt: '2026-03-13T12:02:00.000Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: '她有哪些已保存的资料？',
            title: 'Memory Workspace · Alice Chen',
            answer: { summary: '资料答复', displayType: 'derived_summary', citations: [] },
            contextCards: [],
            guardrail: {
              decision: 'grounded_answer',
              reasonCodes: ['multi_source_synthesis'],
              citationCount: 2,
              sourceKinds: ['person', 'file'],
              fallbackApplied: false
            }
          }
        }
      ]
    }

    const getMemoryWorkspaceSession = vi.fn()
      .mockResolvedValueOnce(sessionWithOneTurn)
      .mockResolvedValueOnce(sessionWithTwoTurns)

    const askMemoryWorkspacePersisted = vi.fn().mockResolvedValue(sessionWithTwoTurns.turns[1])

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession,
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    expect(await screen.findByText('冲突答复')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Ask memory workspace'), {
      target: { value: '她有哪些已保存的资料？' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => {
      expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith({
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '她有哪些已保存的资料？',
        sessionId: 'session-1'
      })
    })

    expect(await screen.findByText('资料答复')).toBeInTheDocument()
    expect(screen.getByText('冲突答复')).toBeInTheDocument()
    expect(screen.getByText('multi_source_synthesis')).toBeInTheDocument()
  })

  it('replayed citations remain clickable and new scopes show empty replay state', async () => {
    const onOpenPerson = vi.fn()
    const onOpenGroup = vi.fn()
    const onOpenEvidenceFile = vi.fn()
    const onOpenReviewHistory = vi.fn()

    const listMemoryWorkspaceSessions = vi.fn()
      .mockResolvedValueOnce([
        {
          sessionId: 'session-1',
          scope: { kind: 'global' },
          title: 'Memory Workspace · Global',
          latestQuestion: '谁和哪些资料最相关？',
          turnCount: 1,
          createdAt: '2026-03-13T12:01:00.000Z',
          updatedAt: '2026-03-13T12:01:00.000Z'
        }
      ])
      .mockResolvedValueOnce([])

    const getMemoryWorkspaceSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      scope: { kind: 'global' },
      title: 'Memory Workspace · Global',
      latestQuestion: '谁和哪些资料最相关？',
      turnCount: 1,
      createdAt: '2026-03-13T12:01:00.000Z',
      updatedAt: '2026-03-13T12:01:00.000Z',
      turns: [
        {
          turnId: 'turn-1',
          sessionId: 'session-1',
          ordinal: 1,
          question: '谁和哪些资料最相关？',
          provider: null,
          model: null,
          contextHash: 'context-1',
          promptHash: 'prompt-1',
          createdAt: '2026-03-13T12:01:00.000Z',
          response: {
            scope: { kind: 'global' },
            question: '谁和哪些资料最相关？',
            title: 'Memory Workspace · Global',
            answer: {
              summary: 'Alice Chen and her group appear most often.',
              displayType: 'derived_summary',
              citations: [
                { citationId: 'person-1', kind: 'person', targetId: 'cp-1', label: 'Alice Chen' }
              ]
            },
            guardrail: {
              decision: 'grounded_answer',
              reasonCodes: ['multi_source_synthesis'],
              citationCount: 4,
              sourceKinds: ['person', 'group', 'file', 'review'],
              fallbackApplied: false
            },
            contextCards: [
              {
                cardId: 'summary',
                title: 'Summary',
                body: 'Alice Chen Group is linked to chat-1.json and replay-1.',
                displayType: 'derived_summary',
                citations: [
                  { citationId: 'group-1', kind: 'group', targetId: 'cp-1', label: 'Alice Chen Group' },
                  { citationId: 'file-1', kind: 'file', targetId: 'f-1', label: 'chat-1.json' },
                  { citationId: 'review-1', kind: 'review', targetId: 'rq-1', label: 'Open school_name conflicts' }
                ]
              }
            ]
          }
        }
      ]
    })

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession,
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted: vi.fn()
    })

    const { rerender } = render(
      <MemoryWorkspacePage
        scope={{ kind: 'global' }}
        onOpenPerson={onOpenPerson}
        onOpenGroup={onOpenGroup}
        onOpenEvidenceFile={onOpenEvidenceFile}
        onOpenReviewHistory={onOpenReviewHistory}
      />
    )

    expect(await screen.findByText('Alice Chen and her group appear most often.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alice Chen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alice Chen Group' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat-1.json' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open school_name conflicts' }))

    expect(onOpenPerson).toHaveBeenCalledWith('cp-1')
    expect(onOpenGroup).toHaveBeenCalledWith('cp-1')
    expect(onOpenEvidenceFile).toHaveBeenCalledWith('f-1')
    expect(onOpenReviewHistory).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'review',
      targetId: 'rq-1'
    }))

    rerender(<MemoryWorkspacePage scope={{ kind: 'group', anchorPersonId: 'cp-9' }} />)
    expect(await screen.findByText('No saved sessions for this scope yet.')).toBeInTheDocument()
  })
})
