import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  AskMemoryWorkspaceInput,
  CreatePersonaDraftReviewFromTurnInput,
  GetPersonaDraftReviewByTurnInput,
  MemoryWorkspaceAnswer,
  MemoryWorkspaceBoundaryRedirect,
  MemoryWorkspaceBoundaryRedirectReason,
  MemoryWorkspaceCommunicationEvidence,
  MemoryWorkspaceCommunicationExcerpt,
  MemoryWorkspaceCompareMatrixDetail,
  MemoryWorkspaceCompareMatrixRowInput,
  MemoryWorkspaceCompareMatrixRowRecord,
  MemoryWorkspaceCompareMatrixSummary,
  MemoryWorkspaceCompareEvaluationDimension,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRecommendation,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareRunEvaluation,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceCitation,
  MemoryWorkspaceContextCard,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceGuardrail,
  MemoryWorkspaceGuardrailDecision,
  MemoryWorkspaceGuardrailReasonCode,
  MemoryWorkspacePersonaDraft,
  MemoryWorkspacePersonaDraftReviewRecord,
  MemoryWorkspacePersonaDraftReviewStatus,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  MemoryWorkspaceSuggestedAction,
  MemoryWorkspaceWorkflowKind,
  PersonAgentAnswerPack,
  PersonAgentFactMemoryRecord,
  PersonAgentInteractionMemoryRecord,
  PersonAgentCapsuleRuntimeInspection,
  PersonAgentPromotionScore,
  PersonAgentRecord,
  RunMemoryWorkspaceCompareInput,
  RunMemoryWorkspaceCompareMatrixInput,
  RunPersonAgentCapsuleRuntimeResult,
  TransitionPersonaDraftReviewInput,
  UpdatePersonaDraftReviewInput
} from '../../../src/shared/archiveContracts'
import {
  askMemoryWorkspaceInputSchema,
  getPersonAgentCapsuleRuntimeInspectionInputSchema,
  runPersonAgentCapsuleRuntimeInputSchema,
  createPersonaDraftReviewFromTurnInputSchema,
  getPersonAgentMemorySummaryInputSchema,
  getPersonAgentStateInputSchema,
  getPersonaDraftReviewByTurnInputSchema,
  listPersonAgentRefreshQueueInputSchema,
  memoryWorkspaceCompareMatrixIdSchema,
  memoryWorkspaceCompareSessionFilterSchema,
  memoryWorkspacePersonaDraftReviewStatusSchema,
  memoryWorkspaceCompareTargetSchema,
  memoryWorkspaceScopeSchema,
  runMemoryWorkspaceCompareInputSchema,
  runMemoryWorkspaceCompareMatrixInputSchema,
  transitionPersonaDraftReviewInputSchema,
  updatePersonaDraftReviewInputSchema
} from '../../../src/shared/schemas/workspace'

describe('phase-eight memory workspace contracts', () => {
  it('exports scope and workspace response shapes', () => {
    const globalScope: MemoryWorkspaceScope = { kind: 'global' }
    const personScope: MemoryWorkspaceScope = { kind: 'person', canonicalPersonId: 'cp-1' }
    const groupScope: MemoryWorkspaceScope = { kind: 'group', anchorPersonId: 'cp-1' }

    const citation: MemoryWorkspaceCitation = {
      citationId: 'citation-1',
      kind: 'person',
      targetId: 'cp-1',
      label: 'Alice Chen'
    }

    const answer: MemoryWorkspaceAnswer = {
      summary: 'There is one open school_name conflict for Alice Chen.',
      displayType: 'open_conflict',
      citations: [citation]
    }

    const decision: MemoryWorkspaceGuardrailDecision = 'sandbox_review_required'
    const reasonCode: MemoryWorkspaceGuardrailReasonCode = 'persona_draft_sandbox'
    const workflowKind: MemoryWorkspaceWorkflowKind = 'persona_draft_sandbox'
    const guardrail: MemoryWorkspaceGuardrail = {
      decision,
      reasonCodes: [reasonCode, 'quote_trace_required'],
      citationCount: 2,
      sourceKinds: ['person', 'file'],
      fallbackApplied: false
    }

    const redirectReason: MemoryWorkspaceBoundaryRedirectReason = 'persona_request'
    const suggestedAction: MemoryWorkspaceSuggestedAction = {
      kind: 'open_persona_draft_sandbox',
      workflowKind: 'persona_draft_sandbox',
      label: 'Reviewed draft sandbox',
      question: '如果她来写这段话，会怎么写？先给我一个可审阅草稿。',
      expressionMode: 'grounded',
      rationale: 'Generate a clearly labeled simulation draft backed by archive quotes.'
    }
    const boundaryRedirect: MemoryWorkspaceBoundaryRedirect = {
      kind: 'persona_request',
      title: 'Persona request blocked',
      message: 'Use grounded archive questions instead of imitation.',
      reasons: [redirectReason],
      suggestedActions: [suggestedAction]
    }
    const communicationExcerpt: MemoryWorkspaceCommunicationExcerpt = {
      excerptId: 'ce-1',
      fileId: 'f-1',
      fileName: 'chat-1.json',
      ordinal: 1,
      speakerDisplayName: 'Alice Chen',
      text: 'Let us keep personal notes for this archive.'
    }
    const communicationEvidence: MemoryWorkspaceCommunicationEvidence = {
      title: 'Communication Evidence',
      summary: 'Direct archive-backed excerpts related to this ask.',
      excerpts: [communicationExcerpt]
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

    const contextCard: MemoryWorkspaceContextCard = {
      cardId: 'card-1',
      title: 'Conflicts & Gaps',
      body: 'school_name conflict remains unresolved.',
      displayType: 'open_conflict',
      citations: [citation]
    }

    const response: MemoryWorkspaceResponse = {
      scope: personScope,
      question: '她现在有哪些还没解决的冲突？',
      expressionMode: 'grounded',
      workflowKind,
      title: 'Memory Workspace · Alice Chen',
      answer,
      contextCards: [contextCard],
      guardrail,
      boundaryRedirect,
      communicationEvidence,
      personaDraft,
      personAgentContext: {
        consultedAgents: [
          {
            personAgentId: 'pa-1',
            canonicalPersonId: 'cp-1',
            reason: 'scope_person'
          }
        ],
        archiveRouting: {
          strategy: 'person_agent',
          reason: 'agent_consulted'
        },
        activeCanonicalPersonId: 'cp-1',
        usedAnswerPack: true
      }
    }

    expect(globalScope.kind).toBe('global')
    expect(personScope).toMatchObject({ kind: 'person', canonicalPersonId: 'cp-1' })
    expect(groupScope).toMatchObject({ kind: 'group', anchorPersonId: 'cp-1' })
    expect(answer.displayType).toBe('open_conflict')
    expect(response.contextCards[0]?.title).toBe('Conflicts & Gaps')
    expect(response.guardrail.decision).toBe('sandbox_review_required')
    expect(response.expressionMode).toBe('grounded')
    expect(response.workflowKind).toBe('persona_draft_sandbox')
    expect(response.boundaryRedirect?.suggestedActions[0]?.kind).toBe('open_persona_draft_sandbox')
    expect(response.communicationEvidence?.excerpts[0]?.speakerDisplayName).toBe('Alice Chen')
    expect(response.personaDraft?.reviewState).toBe('review_required')
    expect(response.personAgentContext?.consultedAgents[0]?.reason).toBe('scope_person')
    expect(response.personAgentContext?.archiveRouting?.strategy).toBe('person_agent')

    expectTypeOf(response.scope).toEqualTypeOf<MemoryWorkspaceScope>()
    expectTypeOf(response.answer.citations).toEqualTypeOf<MemoryWorkspaceCitation[]>()
    expectTypeOf(response.contextCards).toEqualTypeOf<MemoryWorkspaceContextCard[]>()
    expectTypeOf(response.guardrail).toEqualTypeOf<MemoryWorkspaceGuardrail>()
    expectTypeOf(response.boundaryRedirect).toEqualTypeOf<MemoryWorkspaceBoundaryRedirect | null>()
    expectTypeOf(response.communicationEvidence).toEqualTypeOf<MemoryWorkspaceCommunicationEvidence | null>()
    expectTypeOf(response.personaDraft).toEqualTypeOf<MemoryWorkspacePersonaDraft | null>()
    expectTypeOf(response.personAgentContext).toEqualTypeOf<MemoryWorkspaceResponse['personAgentContext']>()
    expectTypeOf<MemoryWorkspaceExpressionMode>().toEqualTypeOf<'grounded' | 'advice'>()
    expectTypeOf<ArchiveApi['askMemoryWorkspace']>().toEqualTypeOf<(input: AskMemoryWorkspaceInput) => Promise<MemoryWorkspaceResponse | null>>()
  })

  it('exports compare runner shapes', () => {
    const target: MemoryWorkspaceCompareTarget = {
      targetId: 'siliconflow-default',
      label: 'SiliconFlow / Qwen2.5-72B-Instruct',
      executionMode: 'provider_model',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct'
    }

    const input: RunMemoryWorkspaceCompareInput = {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      expressionMode: 'advice',
      judge: {
        enabled: true,
        provider: 'openrouter',
        model: 'judge-qwen'
      },
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        },
        target
      ]
    }

    const run: MemoryWorkspaceCompareRunRecord = {
      compareRunId: 'compare-run-1',
      compareSessionId: 'compare-session-1',
      ordinal: 2,
      target,
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      status: 'completed',
      errorMessage: null,
	      response: {
	        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
	        question: input.question,
	        expressionMode: 'advice',
	        workflowKind: 'default',
	        title: 'Memory Workspace · Alice Chen',
	        answer: {
	          summary: 'Alice Chen has approved education and note evidence in the archive.',
          displayType: 'derived_summary',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: ['multi_source_synthesis'],
          citationCount: 2,
          sourceKinds: ['person', 'file'],
          fallbackApplied: false
	        },
	        boundaryRedirect: null,
	        communicationEvidence: null,
	        personaDraft: null
	      },
      evaluation: {
        totalScore: 18,
        maxScore: 20,
        band: 'strong',
        dimensions: [
          {
            key: 'groundedness',
            label: 'Groundedness',
            score: 5,
            maxScore: 5,
            rationale: 'Approved grounded answer with stable archive support.'
          }
        ]
      },
      judge: {
        status: 'completed',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        decision: 'aligned',
        score: 4,
        rationale: 'The candidate summary keeps the grounded scope and does not weaken the guardrail boundary.',
        strengths: ['Preserves grounded facts', 'Keeps guardrail tone'],
        concerns: [],
        errorMessage: null,
        createdAt: '2026-03-14T02:00:01.000Z'
      },
      contextHash: 'context-hash',
      promptHash: 'prompt-hash',
      createdAt: '2026-03-14T02:00:00.000Z'
    }

    const summary: MemoryWorkspaceCompareSessionSummary = {
      compareSessionId: 'compare-session-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      title: 'Memory Workspace Compare · Alice Chen',
      question: input.question,
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox',
      runCount: 2,
      metadata: {
        targetLabels: ['Local baseline', 'SiliconFlow / Qwen2.5-72B-Instruct'],
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
        recommendedTargetLabel: 'SiliconFlow / Qwen2.5-72B-Instruct',
        rationale: 'Highest deterministic rubric score with grounded answer behavior.'
      },
      createdAt: '2026-03-14T02:00:00.000Z',
      updatedAt: '2026-03-14T02:00:05.000Z'
    }

    const detail: MemoryWorkspaceCompareSessionDetail = {
      ...summary,
      runs: [run]
    }

    expect(detail.runs[0]?.target.executionMode).toBe('provider_model')
    expect(detail.runs[0]?.response?.answer.summary).toContain('Alice Chen')
    expect(detail.runs[0]?.evaluation.totalScore).toBe(18)
    expect(detail.runs[0]?.judge.decision).toBe('aligned')
    expect(detail.metadata.targetLabels).toContain('Local baseline')
    expect(detail.metadata.judge.status).toBe('completed')
    expect(detail.recommendation?.decision).toBe('recommend_run')
    expect(detail.recommendation?.source).toBe('deterministic')
    expect(input.judge?.enabled).toBe(true)
    expect(detail.expressionMode).toBe('advice')
    expect(detail.workflowKind).toBe('persona_draft_sandbox')
    expect(detail.runs[0]?.response?.expressionMode).toBe('advice')

    expectTypeOf<ArchiveApi['runMemoryWorkspaceCompare']>().toEqualTypeOf<
      (input: RunMemoryWorkspaceCompareInput) => Promise<MemoryWorkspaceCompareSessionDetail | null>
    >()
    expectTypeOf<ArchiveApi['listMemoryWorkspaceCompareSessions']>().toEqualTypeOf<
      (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceCompareSessionSummary[]>
    >()
    expectTypeOf<ArchiveApi['getMemoryWorkspaceCompareSession']>().toEqualTypeOf<
      (compareSessionId: string) => Promise<MemoryWorkspaceCompareSessionDetail | null>
    >()
    expectTypeOf<MemoryWorkspaceCompareRunEvaluation['dimensions']>().toEqualTypeOf<MemoryWorkspaceCompareEvaluationDimension[]>()
    expectTypeOf<MemoryWorkspaceCompareRunRecord['judge']>().toEqualTypeOf<MemoryWorkspaceCompareJudgeVerdict>()
    expectTypeOf<MemoryWorkspaceCompareSessionSummary['metadata']['targetLabels']>().toEqualTypeOf<string[]>()
    expectTypeOf<MemoryWorkspaceCompareSessionSummary['recommendation']>().toEqualTypeOf<MemoryWorkspaceCompareRecommendation | null>()
  })

  it('exports compare matrix shapes', () => {
    const rowInput: MemoryWorkspaceCompareMatrixRowInput = {
      label: 'Person baseline',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已确认信息？'
    }

    const input: RunMemoryWorkspaceCompareMatrixInput = {
      title: 'Daily compare matrix',
      expressionMode: 'advice',
      rows: [
        rowInput,
        {
          scope: { kind: 'global' },
          question: '现在最值得关注什么？'
        }
      ],
      judge: {
        enabled: true,
        provider: 'openrouter',
        model: 'judge-qwen'
      },
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        }
      ]
    }

    const row: MemoryWorkspaceCompareMatrixRowRecord = {
      matrixRowId: 'matrix-row-1',
      matrixSessionId: 'matrix-session-1',
      ordinal: 1,
      label: 'Person baseline',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已确认信息？',
      status: 'completed',
      errorMessage: null,
      compareSessionId: 'compare-session-1',
      recommendedCompareRunId: 'compare-run-1',
      recommendedTargetLabel: 'Local baseline',
      failedRunCount: 0,
      createdAt: '2026-03-14T05:00:00.000Z'
    }

    const summary: MemoryWorkspaceCompareMatrixSummary = {
      matrixSessionId: 'matrix-session-1',
      title: 'Daily compare matrix',
      expressionMode: 'advice',
      rowCount: 2,
      completedRowCount: 1,
      failedRowCount: 1,
      metadata: {
        targetLabels: ['Local baseline'],
        judge: {
          enabled: true,
          status: 'completed'
        }
      },
      createdAt: '2026-03-14T05:00:00.000Z',
      updatedAt: '2026-03-14T05:00:10.000Z'
    }

    const detail: MemoryWorkspaceCompareMatrixDetail = {
      ...summary,
      rows: [row]
    }

    expect(detail.rows[0]?.scope.kind).toBe('person')
    expect(detail.rows[0]?.recommendedTargetLabel).toBe('Local baseline')
    expect(detail.failedRowCount).toBe(1)
    expect(input.rows).toHaveLength(2)
    expect(detail.expressionMode).toBe('advice')

    expectTypeOf<ArchiveApi['runMemoryWorkspaceCompareMatrix']>().toEqualTypeOf<
      (input: RunMemoryWorkspaceCompareMatrixInput) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
    >()
    expectTypeOf<ArchiveApi['listMemoryWorkspaceCompareMatrices']>().toEqualTypeOf<
      () => Promise<MemoryWorkspaceCompareMatrixSummary[]>
    >()
    expectTypeOf<ArchiveApi['getMemoryWorkspaceCompareMatrix']>().toEqualTypeOf<
      (matrixSessionId: string) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
    >()
  })

  it('exports persona draft review shapes', () => {
    const status: MemoryWorkspacePersonaDraftReviewStatus = 'draft'
    const review: MemoryWorkspacePersonaDraftReviewRecord = {
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      workflowKind: 'persona_draft_sandbox',
      status,
      baseDraft: '可审阅草稿：先把关键记录整理进归档。',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Tone is grounded, but needs a clearer closing line.',
      supportingExcerpts: ['ce-1', 'ce-3'],
      trace: [
        {
          traceId: 'trace-1',
          excerptIds: ['ce-1'],
          explanation: 'Opening sentence is grounded in excerpt ce-1.'
        }
      ],
      approvedJournalId: null,
      rejectedJournalId: null,
      createdAt: '2026-03-16T01:00:00.000Z',
      updatedAt: '2026-03-16T01:05:00.000Z'
    }

    const getInput: GetPersonaDraftReviewByTurnInput = {
      turnId: 'turn-1'
    }
    const createInput: CreatePersonaDraftReviewFromTurnInput = {
      turnId: 'turn-1'
    }
    const updateInput: UpdatePersonaDraftReviewInput = {
      draftReviewId: 'review-1',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Sharper and easier to reuse.'
    }
    const transitionInput: TransitionPersonaDraftReviewInput = {
      draftReviewId: 'review-1',
      status: 'in_review'
    }

    expect(review.status).toBe('draft')
    expect(review.workflowKind).toBe('persona_draft_sandbox')
    expect(review.supportingExcerpts).toEqual(['ce-1', 'ce-3'])
    expect(getInput.turnId).toBe('turn-1')
    expect(createInput.turnId).toBe('turn-1')
    expect(updateInput.reviewNotes).toContain('Sharper')
    expect(transitionInput.status).toBe('in_review')

    expectTypeOf<MemoryWorkspacePersonaDraftReviewStatus>().toEqualTypeOf<
      'draft' | 'in_review' | 'approved' | 'rejected'
    >()
    expectTypeOf(review.scope).toEqualTypeOf<MemoryWorkspaceScope>()
    expectTypeOf(review.trace).toEqualTypeOf<MemoryWorkspacePersonaDraft['trace']>()
  })

  it('exports memory workspace ask input schema', () => {
    expect(memoryWorkspaceScopeSchema.parse({ kind: 'global' })).toEqual({ kind: 'global' })
    expect(memoryWorkspaceScopeSchema.parse({ kind: 'person', canonicalPersonId: 'cp-1' })).toEqual({
      kind: 'person',
      canonicalPersonId: 'cp-1'
    })
    expect(memoryWorkspaceScopeSchema.parse({ kind: 'group', anchorPersonId: 'cp-1' })).toEqual({
      kind: 'group',
      anchorPersonId: 'cp-1'
    })

    expect(askMemoryWorkspaceInputSchema.parse({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })).toEqual({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })

    expect(askMemoryWorkspaceInputSchema.parse({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox'
    })).toEqual({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice',
      workflowKind: 'persona_draft_sandbox'
    })

    expect(memoryWorkspaceCompareTargetSchema.parse({
      targetId: 'baseline-local',
      label: 'Local baseline',
      executionMode: 'local_baseline'
    })).toEqual({
      targetId: 'baseline-local',
      label: 'Local baseline',
      executionMode: 'local_baseline'
    })

    expect(memoryWorkspaceCompareTargetSchema.parse({
      targetId: 'openrouter-default',
      label: 'OpenRouter / qwen-2.5-72b-instruct',
      executionMode: 'provider_model',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct'
    })).toEqual({
      targetId: 'openrouter-default',
      label: 'OpenRouter / qwen-2.5-72b-instruct',
      executionMode: 'provider_model',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct'
    })

    expect(runMemoryWorkspaceCompareInputSchema.parse({
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      expressionMode: 'advice',
      judge: {
        enabled: false
      },
      targets: [{
        targetId: 'baseline-local',
        label: 'Local baseline',
        executionMode: 'local_baseline'
      }]
    })).toEqual({
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      expressionMode: 'advice',
      judge: {
        enabled: false
      },
      targets: [{
        targetId: 'baseline-local',
        label: 'Local baseline',
        executionMode: 'local_baseline'
      }]
    })

    expect(runMemoryWorkspaceCompareInputSchema.parse({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'grounded',
      workflowKind: 'persona_draft_sandbox',
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-model-1'
      }
    })).toEqual({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'grounded',
      workflowKind: 'persona_draft_sandbox',
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-model-1'
      }
    })

    expect(memoryWorkspaceCompareSessionFilterSchema.parse(undefined)).toEqual({})
    expect(memoryWorkspaceCompareSessionFilterSchema.parse({
      scope: { kind: 'global' }
    })).toEqual({
      scope: { kind: 'global' }
    })

    expect(runMemoryWorkspaceCompareMatrixInputSchema.parse({
      title: 'Daily compare matrix',
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
    })).toEqual({
      title: 'Daily compare matrix',
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

    expect(memoryWorkspaceCompareMatrixIdSchema.parse({
      matrixSessionId: 'matrix-session-1'
    })).toEqual({
      matrixSessionId: 'matrix-session-1'
    })

    expect(memoryWorkspacePersonaDraftReviewStatusSchema.parse('approved')).toBe('approved')

    expect(getPersonaDraftReviewByTurnInputSchema.parse({
      turnId: 'turn-1'
    })).toEqual({
      turnId: 'turn-1'
    })

    expect(createPersonaDraftReviewFromTurnInputSchema.parse({
      turnId: 'turn-1'
    })).toEqual({
      turnId: 'turn-1'
    })

    expect(updatePersonaDraftReviewInputSchema.parse({
      draftReviewId: 'review-1',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Sharper and easier to reuse.'
    })).toEqual({
      draftReviewId: 'review-1',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Sharper and easier to reuse.'
    })

    expect(transitionPersonaDraftReviewInputSchema.parse({
      draftReviewId: 'review-1',
      status: 'in_review'
    })).toEqual({
      draftReviewId: 'review-1',
      status: 'in_review'
    })
  })

  it('exports person-agent shared shapes and inspection schemas', () => {
    const promotionScore: PersonAgentPromotionScore = {
      canonicalPersonId: 'cp-1',
      totalScore: 67,
      thresholds: {
        warming: 20,
        active: 45,
        highSignal: 70
      },
      signals: {
        approvedFactCount: 9,
        evidenceSourceCount: 14,
        communicationFileCount: 3,
        linkedImportBatchCount: 2,
        relationshipDegree: 6,
        relationshipDensity: 2,
        recentQuestionCount: 11,
        recentCitationCount: 27
      },
      evaluatedAt: '2026-04-06T10:00:00.000Z'
    }

    const personAgent: PersonAgentRecord = {
      personAgentId: 'pa-1',
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: promotionScore.totalScore,
      promotionReasonSummary: 'High approved-fact confidence with sustained recent asks.',
      factsVersion: 3,
      interactionVersion: 5,
      lastRefreshedAt: '2026-04-06T10:10:00.000Z',
      lastActivatedAt: '2026-04-06T10:12:00.000Z',
      createdAt: '2026-04-05T18:00:00.000Z',
      updatedAt: '2026-04-06T10:12:00.000Z'
    }

    const factMemoryRecord: PersonAgentFactMemoryRecord = {
      memoryId: 'pafm-1',
      personAgentId: 'pa-1',
      canonicalPersonId: 'cp-1',
      memoryKey: 'identity.birthday',
      sectionKey: 'identity',
      displayLabel: 'Birthday',
      summaryValue: '1997-02-03',
      memoryKind: 'fact',
      confidence: 0.92,
      conflictState: 'none',
      freshnessAt: '2026-04-06T09:00:00.000Z',
      sourceRefs: [{
        kind: 'file',
        id: 'file-1',
        label: 'chat-1.json'
      }],
      sourceHash: 'hash-fact-1',
      createdAt: '2026-04-06T09:00:00.000Z',
      updatedAt: '2026-04-06T09:00:00.000Z'
    }

    const interactionMemoryRecord: PersonAgentInteractionMemoryRecord = {
      memoryId: 'paim-1',
      personAgentId: 'pa-1',
      canonicalPersonId: 'cp-1',
      memoryKey: 'topic.birthday',
      topicLabel: 'Birthday checks',
      summary: 'User repeatedly asks for current trusted birthday.',
      questionCount: 4,
      citationCount: 5,
      outcomeKinds: ['answered'],
      supportingTurnIds: ['turn-2', 'turn-4'],
      lastQuestionAt: '2026-04-06T10:08:00.000Z',
      lastCitationAt: '2026-04-06T10:08:01.000Z',
      createdAt: '2026-04-06T09:40:00.000Z',
      updatedAt: '2026-04-06T10:08:01.000Z'
    }

    const answerPack: PersonAgentAnswerPack = {
      personAgentId: 'pa-1',
      canonicalPersonId: 'cp-1',
      question: 'xxx 的生日是什么？',
      questionClassification: 'profile_fact',
      candidateAnswer: 'Current approved birthday is 1997-02-03.',
      supportingFacts: [{
        memoryKey: factMemoryRecord.memoryKey,
        label: factMemoryRecord.displayLabel,
        value: factMemoryRecord.summaryValue,
        memoryKind: factMemoryRecord.memoryKind
      }],
      supportingCitations: [{
        citationId: 'citation-1',
        kind: 'person',
        targetId: 'cp-1',
        label: 'Alice Chen'
      }],
      conflicts: [],
      coverageGaps: [],
      recentInteractionTopics: [{
        topicLabel: interactionMemoryRecord.topicLabel,
        summary: interactionMemoryRecord.summary,
        questionCount: interactionMemoryRecord.questionCount
      }],
      generationReason: 'Resolved through active person-agent fact memory.',
      memoryVersions: {
        factsVersion: personAgent.factsVersion,
        interactionVersion: personAgent.interactionVersion
      }
    }

    expect(personAgent.status).toBe('active')
    expect(factMemoryRecord.memoryKind).toBe('fact')
    expect(interactionMemoryRecord.outcomeKinds).toContain('answered')
    expect(answerPack.questionClassification).toBe('profile_fact')
    expect(promotionScore.thresholds.active).toBe(45)

    expect(getPersonAgentStateInputSchema.parse({
      canonicalPersonId: 'cp-1'
    })).toEqual({
      canonicalPersonId: 'cp-1'
    })

    expect(runPersonAgentCapsuleRuntimeInputSchema.parse({
      operationKind: 'consultation',
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      sessionId: 'pcs-1'
    })).toEqual({
      operationKind: 'consultation',
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      sessionId: 'pcs-1'
    })

    expect(runPersonAgentCapsuleRuntimeInputSchema.parse({
      operationKind: 'transition_task',
      taskId: 'task-1',
      status: 'dismissed',
      source: 'workspace_ui',
      reason: 'handled externally'
    })).toEqual({
      operationKind: 'transition_task',
      taskId: 'task-1',
      status: 'dismissed',
      source: 'workspace_ui',
      reason: 'handled externally'
    })

    expect(runPersonAgentCapsuleRuntimeInputSchema.parse({
      operationKind: 'execute_task',
      taskId: 'task-2',
      source: 'workspace_ui'
    })).toEqual({
      operationKind: 'execute_task',
      taskId: 'task-2',
      source: 'workspace_ui'
    })

    expect(getPersonAgentCapsuleRuntimeInspectionInputSchema.parse({
      canonicalPersonId: 'cp-1'
    })).toEqual({
      canonicalPersonId: 'cp-1'
    })

    const runtimeResult: RunPersonAgentCapsuleRuntimeResult = {
      resultKind: 'consultation_turn',
      consultationTurn: {
        turnId: 'pct-1',
        sessionId: 'pcs-1',
        personAgentId: 'pa-1',
        canonicalPersonId: 'cp-1',
        ordinal: 1,
        question: '她的生日是什么？',
        answerPack,
        createdAt: '2026-04-06T10:15:00.000Z'
      }
    }
    const runtimeInspection: PersonAgentCapsuleRuntimeInspection = {
      inspectionKind: 'capsule_runtime',
      canonicalPersonId: 'cp-1',
      overview: {
        hasActiveAgent: true,
        pendingRefreshCount: 0,
        openConflictCount: 0,
        coverageGapCount: 0,
        interactionTopicCount: 1,
        totalQuestionCount: 4,
        latestRefreshRequestedAt: null,
        latestStrategyChange: null,
        capsuleStatus: 'missing',
        activationSource: null,
        runtimeRunner: {
          status: 'missing',
          stalled: false,
          thresholdMinutes: 15,
          reason: null,
          lastHeartbeatAt: null,
          lastProcessedTaskCount: 0,
          totalProcessedTaskCount: 0,
          lastError: null
        }
      },
      recommendations: {
        attentionLevel: 'steady',
        nextBestAction: 'monitor',
        blockingReason: null,
        suggestedQuestion: null,
        recommendedTopics: []
      },
      highlights: [],
      capsule: null,
      capsuleCheckpoint: null,
      runnerState: null,
      tasks: [],
      state: personAgent,
      memorySummary: {
        canonicalPersonId: 'cp-1',
        factSummary: null,
        interactionMemories: [interactionMemoryRecord]
      },
      refreshQueue: [],
      auditEvents: []
    }
    expect(runtimeResult.resultKind).toBe('consultation_turn')
    expect(runtimeInspection.inspectionKind).toBe('capsule_runtime')
    expectTypeOf<ArchiveApi['runPersonAgentCapsuleRuntime']>()
      .toEqualTypeOf<(input: Parameters<ArchiveApi['runPersonAgentCapsuleRuntime']>[0]) => Promise<RunPersonAgentCapsuleRuntimeResult>>()
    expectTypeOf<ArchiveApi['getPersonAgentCapsuleRuntimeInspection']>()
      .toEqualTypeOf<(input: Parameters<ArchiveApi['getPersonAgentCapsuleRuntimeInspection']>[0]) => Promise<PersonAgentCapsuleRuntimeInspection | null>>()

    expect(getPersonAgentMemorySummaryInputSchema.parse({
      canonicalPersonId: 'cp-1'
    })).toEqual({
      canonicalPersonId: 'cp-1'
    })

    expect(listPersonAgentRefreshQueueInputSchema.parse(undefined)).toEqual({})
    expect(listPersonAgentRefreshQueueInputSchema.parse({
      status: 'pending'
    })).toEqual({
      status: 'pending'
    })
  })
})
