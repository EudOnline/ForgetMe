import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ArchiveApi,
  AskMemoryWorkspaceInput,
  MemoryWorkspaceAnswer,
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
  MemoryWorkspaceGuardrail,
  MemoryWorkspaceGuardrailDecision,
  MemoryWorkspaceGuardrailReasonCode,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  RunMemoryWorkspaceCompareInput
} from '../../../src/shared/archiveContracts'
import {
  askMemoryWorkspaceInputSchema,
  memoryWorkspaceCompareSessionFilterSchema,
  memoryWorkspaceCompareTargetSchema,
  memoryWorkspaceScopeSchema,
  runMemoryWorkspaceCompareInputSchema
} from '../../../src/shared/ipcSchemas'

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

    const decision: MemoryWorkspaceGuardrailDecision = 'fallback_to_conflict'
    const reasonCode: MemoryWorkspaceGuardrailReasonCode = 'open_conflict_present'
    const guardrail: MemoryWorkspaceGuardrail = {
      decision,
      reasonCodes: [reasonCode],
      citationCount: 1,
      sourceKinds: ['person'],
      fallbackApplied: true
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
      title: 'Memory Workspace · Alice Chen',
      answer,
      contextCards: [contextCard],
      guardrail
    }

    expect(globalScope.kind).toBe('global')
    expect(personScope).toMatchObject({ kind: 'person', canonicalPersonId: 'cp-1' })
    expect(groupScope).toMatchObject({ kind: 'group', anchorPersonId: 'cp-1' })
    expect(answer.displayType).toBe('open_conflict')
    expect(response.contextCards[0]?.title).toBe('Conflicts & Gaps')
    expect(response.guardrail.decision).toBe('fallback_to_conflict')

    expectTypeOf(response.scope).toEqualTypeOf<MemoryWorkspaceScope>()
    expectTypeOf(response.answer.citations).toEqualTypeOf<MemoryWorkspaceCitation[]>()
    expectTypeOf(response.contextCards).toEqualTypeOf<MemoryWorkspaceContextCard[]>()
    expectTypeOf(response.guardrail).toEqualTypeOf<MemoryWorkspaceGuardrail>()
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
        }
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
    expect(input.judge?.enabled).toBe(true)

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
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-model-1'
      }
    })).toEqual({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
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
  })
})
