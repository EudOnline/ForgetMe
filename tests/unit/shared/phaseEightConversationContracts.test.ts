import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  AskMemoryWorkspacePersistedInput,
  MemoryWorkspaceBoundaryRedirect,
  MemoryWorkspaceCommunicationEvidence,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspacePersonaDraft,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  MemoryWorkspaceSessionDetail,
  MemoryWorkspaceSessionSummary,
  MemoryWorkspaceTurnRecord
} from '../../../src/shared/archiveContracts'
import {
  askMemoryWorkspacePersistedInputSchema,
  memoryWorkspaceCompareSessionIdSchema,
  memoryWorkspaceSessionFilterSchema,
  memoryWorkspaceSessionIdSchema
} from '../../../src/shared/ipcSchemas'

describe('phase-eight conversation persistence contracts', () => {
  it('exports replayable session and turn shapes', () => {
    const scope: MemoryWorkspaceScope = { kind: 'person', canonicalPersonId: 'cp-1' }
    const boundaryRedirect: MemoryWorkspaceBoundaryRedirect = {
      kind: 'persona_request',
      title: 'Persona request blocked',
      message: 'Use grounded archive questions instead of imitation.',
      reasons: ['persona_request'],
      suggestedActions: [
        {
          kind: 'open_persona_draft_sandbox',
          workflowKind: 'persona_draft_sandbox',
          label: 'Reviewed draft sandbox',
          question: '如果她来写这段话，会怎么写？先给我一个可审阅草稿。',
          expressionMode: 'grounded',
          rationale: 'Generate a clearly labeled simulation draft backed by archive quotes.'
        }
      ]
    }
    const communicationEvidence: MemoryWorkspaceCommunicationEvidence = {
      title: 'Communication Evidence',
      summary: 'Direct archive-backed excerpts related to this ask.',
      excerpts: [
        {
          excerptId: 'ce-1',
          fileId: 'f-1',
          fileName: 'chat-1.json',
          ordinal: 1,
          speakerDisplayName: 'Alice Chen',
          text: 'Let us keep personal notes for this archive.'
        }
      ]
    }
    const personaDraft: MemoryWorkspacePersonaDraft = {
      title: 'Reviewed draft sandbox',
      disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
      draft: '也许我们先把这些记录整理好，再继续往下推进。',
      reviewState: 'review_required',
      supportingExcerpts: ['ce-1'],
      trace: [
        {
          traceId: 'trace-1',
          excerptIds: ['ce-1'],
          explanation: 'Opening sentence is grounded in the archive quote about organizing the records first.'
        }
      ]
    }

    const session: MemoryWorkspaceSessionSummary = {
      sessionId: 'session-1',
      scope,
      title: 'Memory Workspace · Alice Chen',
      latestQuestion: '她现在有哪些还没解决的冲突？',
      turnCount: 1,
      createdAt: '2026-03-13T11:20:00.000Z',
      updatedAt: '2026-03-13T11:20:00.000Z'
    }

    const turn: MemoryWorkspaceTurnRecord = {
      turnId: 'turn-1',
      sessionId: 'session-1',
      ordinal: 1,
      question: '她现在有哪些还没解决的冲突？',
      response: {
        scope,
        question: '她现在有哪些还没解决的冲突？',
        expressionMode: 'advice',
        workflowKind: 'persona_draft_sandbox',
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Open conflicts remain for school_name.',
          displayType: 'open_conflict',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'fallback_to_conflict',
          reasonCodes: ['open_conflict_present'],
          citationCount: 0,
          sourceKinds: [],
          fallbackApplied: true
        },
        boundaryRedirect,
        communicationEvidence,
        personaDraft
      } satisfies MemoryWorkspaceResponse,
      provider: null,
      model: null,
      contextHash: 'hash-context',
      promptHash: 'hash-prompt',
      createdAt: '2026-03-13T11:20:00.000Z'
    }

    const detail: MemoryWorkspaceSessionDetail = {
      ...session,
      turns: [turn]
    }

    expect(session.scope.kind).toBe('person')
    expect(turn.ordinal).toBe(1)
    expect(detail.turns[0]?.response.title).toBe('Memory Workspace · Alice Chen')
    expect(detail.turns[0]?.response.expressionMode).toBe('advice')
    expect(detail.turns[0]?.response.workflowKind).toBe('persona_draft_sandbox')
    expect(detail.turns[0]?.response.boundaryRedirect?.kind).toBe('persona_request')
    expect(detail.turns[0]?.response.communicationEvidence?.excerpts[0]?.speakerDisplayName).toBe('Alice Chen')
    expect(detail.turns[0]?.response.personaDraft?.reviewState).toBe('review_required')

    expectTypeOf<ArchiveApi['listMemoryWorkspaceSessions']>().toEqualTypeOf<
      (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceSessionSummary[]>
    >()
    expectTypeOf<ArchiveApi['getMemoryWorkspaceSession']>().toEqualTypeOf<
      (sessionId: string) => Promise<MemoryWorkspaceSessionDetail | null>
    >()
    expectTypeOf<ArchiveApi['askMemoryWorkspacePersisted']>().toEqualTypeOf<
      (input: AskMemoryWorkspacePersistedInput) => Promise<MemoryWorkspaceTurnRecord | null>
    >()

    const compareSummary: MemoryWorkspaceCompareSessionSummary = {
      compareSessionId: 'compare-session-1',
      scope,
      title: 'Memory Workspace Compare · Alice Chen',
      question: '她有哪些已保存的资料？',
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox',
      runCount: 3,
      metadata: {
        targetLabels: ['Local baseline'],
        failedRunCount: 0,
        judge: {
          enabled: false,
          status: 'disabled'
        }
      },
      recommendation: null,
      createdAt: '2026-03-14T03:00:00.000Z',
      updatedAt: '2026-03-14T03:00:05.000Z'
    }

    const compareDetail: MemoryWorkspaceCompareSessionDetail = {
      ...compareSummary,
      runs: []
    }

    expect(compareDetail.compareSessionId).toBe('compare-session-1')
    expect(compareDetail.expressionMode).toBe('advice')
    expect(compareDetail.workflowKind).toBe('persona_draft_sandbox')

    expectTypeOf<ArchiveApi['listMemoryWorkspaceCompareSessions']>().toEqualTypeOf<
      (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceCompareSessionSummary[]>
    >()
    expectTypeOf<ArchiveApi['getMemoryWorkspaceCompareSession']>().toEqualTypeOf<
      (compareSessionId: string) => Promise<MemoryWorkspaceCompareSessionDetail | null>
    >()
  })

  it('exports session filter and persisted ask input schemas', () => {
    expect(memoryWorkspaceSessionFilterSchema.parse(undefined)).toEqual({})
    expect(memoryWorkspaceSessionFilterSchema.parse({
      scope: { kind: 'global' }
    })).toEqual({
      scope: { kind: 'global' }
    })

    expect(memoryWorkspaceSessionIdSchema.parse({ sessionId: 'session-1' })).toEqual({
      sessionId: 'session-1'
    })

    expect(memoryWorkspaceCompareSessionIdSchema.parse({ compareSessionId: 'compare-session-1' })).toEqual({
      compareSessionId: 'compare-session-1'
    })

    expect(askMemoryWorkspacePersistedInputSchema.parse({
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      sessionId: 'session-1',
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox'
    })).toEqual({
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      sessionId: 'session-1',
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox'
    })
  })
})
