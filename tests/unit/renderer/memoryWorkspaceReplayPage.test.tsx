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
              expressionMode: 'grounded',
              title: 'Memory Workspace · Global',
              answer: { summary: '第一答', displayType: 'derived_summary', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: false
              },
              boundaryRedirect: null
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
              expressionMode: 'advice',
              title: 'Memory Workspace · Global',
              answer: { summary: '第二答', displayType: 'open_conflict', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'fallback_to_conflict',
                reasonCodes: ['open_conflict_present'],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: true
              },
              boundaryRedirect: null
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
              expressionMode: 'grounded',
              title: 'Memory Workspace · Global',
              answer: { summary: '旧答复', displayType: 'derived_summary', citations: [] },
              contextCards: [],
              guardrail: {
                decision: 'grounded_answer',
                reasonCodes: [],
                citationCount: 0,
                sourceKinds: [],
                fallbackApplied: false
              },
              boundaryRedirect: null
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
    expect(screen.getByText('Mode: grounded')).toBeInTheDocument()
    expect(screen.getByText('Mode: advice')).toBeInTheDocument()
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
            },
            boundaryRedirect: null
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
            },
            boundaryRedirect: null
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
        expressionMode: 'grounded',
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
            ],
            boundaryRedirect: null
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

  it('renders saved boundary redirects in replayed turns', async () => {
    const listMemoryWorkspaceSessions = vi.fn().mockResolvedValue([
      {
        sessionId: 'session-redirect',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        title: 'Memory Workspace · Alice Chen',
        latestQuestion: '如果她本人会怎么说？',
        turnCount: 1,
        createdAt: '2026-03-15T12:01:00.000Z',
        updatedAt: '2026-03-15T12:01:00.000Z'
      }
    ])

    const getMemoryWorkspaceSession = vi.fn().mockResolvedValue({
      sessionId: 'session-redirect',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      title: 'Memory Workspace · Alice Chen',
      latestQuestion: '如果她本人会怎么说？',
      turnCount: 1,
      createdAt: '2026-03-15T12:01:00.000Z',
      updatedAt: '2026-03-15T12:01:00.000Z',
      turns: [
        {
          turnId: 'turn-redirect',
          sessionId: 'session-redirect',
          ordinal: 1,
          question: '如果她本人会怎么说？',
          provider: null,
          model: null,
          contextHash: 'context-redirect',
          promptHash: 'prompt-redirect',
          createdAt: '2026-03-15T12:01:00.000Z',
          response: {
            scope: { kind: 'person', canonicalPersonId: 'cp-1' },
            question: '如果她本人会怎么说？',
            expressionMode: 'grounded',
            title: 'Memory Workspace · Alice Chen',
            answer: {
              summary: 'This memory workspace cannot answer as if it were the archived person.',
              displayType: 'coverage_gap',
              citations: []
            },
            contextCards: [],
            guardrail: {
              decision: 'fallback_unsupported_request',
              reasonCodes: ['persona_request'],
              citationCount: 0,
              sourceKinds: [],
              fallbackApplied: true
            },
            boundaryRedirect: {
              kind: 'persona_request',
              title: 'Persona request blocked',
              message: 'Use grounded archive questions instead of imitation.',
              reasons: ['persona_request', 'delegation_not_allowed', 'style_evidence_unavailable'],
              suggestedAsks: [
                {
                  label: 'Past expressions',
                  question: '她过去是怎么表达这类事的？给我看相关原话。',
                  expressionMode: 'grounded',
                  rationale: 'Review direct archive-backed excerpts instead of imitating voice.'
                },
                {
                  label: 'Grounded summary',
                  question: '先基于档案总结她当前最明确的状态。',
                  expressionMode: 'grounded',
                  rationale: 'Summarize the strongest approved archive signal first.'
                },
                {
                  label: 'Advice next step',
                  question: '基于档案，现在最安全的下一步是什么？',
                  expressionMode: 'advice',
                  rationale: 'Convert the current archive state into a safe next-step ask.'
                }
              ]
            },
            communicationEvidence: null
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

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    expect(await screen.findByText('Persona request blocked')).toBeInTheDocument()
    expect(screen.getByText('Use grounded archive questions instead of imitation.')).toBeInTheDocument()
    expect(screen.getByText('Past expressions')).toBeInTheDocument()
    expect(screen.getByText('Grounded summary')).toBeInTheDocument()
    expect(screen.getByText('Advice next step')).toBeInTheDocument()
    expect(screen.getByText('delegation_not_allowed')).toBeInTheDocument()
  })

  it('renders replayed communication evidence and lets redirect follow-ups create a new turn', async () => {
    const listMemoryWorkspaceSessions = vi.fn()
      .mockResolvedValueOnce([
        {
          sessionId: 'session-quote',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          title: 'Memory Workspace · Alice Chen',
          latestQuestion: '如果她本人会怎么说？',
          turnCount: 1,
          createdAt: '2026-03-15T12:01:00.000Z',
          updatedAt: '2026-03-15T12:01:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          sessionId: 'session-quote',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          title: 'Memory Workspace · Alice Chen',
          latestQuestion: '她过去是怎么表达这类事的？给我看相关原话。',
          turnCount: 2,
          createdAt: '2026-03-15T12:01:00.000Z',
          updatedAt: '2026-03-15T12:02:00.000Z'
        }
      ])

    const blockedTurn = {
      turnId: 'turn-blocked',
      sessionId: 'session-quote',
      ordinal: 1,
      question: '如果她本人会怎么说？',
      provider: null,
      model: null,
      contextHash: 'context-blocked',
      promptHash: 'prompt-blocked',
      createdAt: '2026-03-15T12:01:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '如果她本人会怎么说？',
        expressionMode: 'grounded' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'This memory workspace cannot answer as if it were the archived person.',
          displayType: 'coverage_gap' as const,
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'fallback_unsupported_request' as const,
          reasonCodes: ['persona_request' as const],
          citationCount: 0,
          sourceKinds: [],
          fallbackApplied: true
        },
        boundaryRedirect: {
          kind: 'persona_request' as const,
          title: 'Persona request blocked',
          message: 'Use grounded archive questions instead of imitation.',
          reasons: ['persona_request', 'delegation_not_allowed', 'style_evidence_unavailable'] as const,
          suggestedAsks: [
            {
              label: 'Past expressions',
              question: '她过去是怎么表达这类事的？给我看相关原话。',
              expressionMode: 'grounded' as const,
              rationale: 'Review direct archive-backed excerpts instead of imitating voice.'
            }
          ]
        },
        communicationEvidence: null
      }
    }

    const quoteTurn = {
      turnId: 'turn-quote',
      sessionId: 'session-quote',
      ordinal: 2,
      question: '她过去是怎么表达这类事的？给我看相关原话。',
      provider: null,
      model: null,
      contextHash: 'context-quote',
      promptHash: 'prompt-quote',
      createdAt: '2026-03-15T12:02:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '她过去是怎么表达这类事的？给我看相关原话。',
        expressionMode: 'grounded' as const,
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Direct chat excerpts in the approved archive address this ask.',
          displayType: 'derived_summary' as const,
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'grounded_answer' as const,
          reasonCodes: ['multi_source_synthesis' as const],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
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
    }

    const getMemoryWorkspaceSession = vi.fn()
      .mockResolvedValueOnce({
        sessionId: 'session-quote',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        title: 'Memory Workspace · Alice Chen',
        latestQuestion: '如果她本人会怎么说？',
        turnCount: 1,
        createdAt: '2026-03-15T12:01:00.000Z',
        updatedAt: '2026-03-15T12:01:00.000Z',
        turns: [blockedTurn]
      })
      .mockResolvedValueOnce({
        sessionId: 'session-quote',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        title: 'Memory Workspace · Alice Chen',
        latestQuestion: '她过去是怎么表达这类事的？给我看相关原话。',
        turnCount: 2,
        createdAt: '2026-03-15T12:01:00.000Z',
        updatedAt: '2026-03-15T12:02:00.000Z',
        turns: [blockedTurn, quoteTurn]
      })

    const askMemoryWorkspacePersisted = vi.fn().mockResolvedValue(quoteTurn)

    stubArchiveWindow({
      listMemoryWorkspaceSessions,
      getMemoryWorkspaceSession,
      listMemoryWorkspaceCompareSessions: vi.fn().mockResolvedValue([]),
      getMemoryWorkspaceCompareSession: vi.fn().mockResolvedValue(null),
      runMemoryWorkspaceCompare: vi.fn().mockResolvedValue(null),
      askMemoryWorkspacePersisted
    })

    render(<MemoryWorkspacePage scope={{ kind: 'person', canonicalPersonId: 'cp-1' }} />)

    expect(await screen.findByText('Persona request blocked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Past expressions' }))

    await waitFor(() => {
      expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith({
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '她过去是怎么表达这类事的？给我看相关原话。',
        expressionMode: 'grounded',
        sessionId: 'session-quote'
      })
    })

    expect(await screen.findByText('Communication Evidence')).toBeInTheDocument()
    expect(screen.getByText('我们还是把这些记录留在归档里，后面查起来更稳妥。')).toBeInTheDocument()
  })
})
