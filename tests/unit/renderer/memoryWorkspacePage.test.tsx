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
  cleanup()
  delete (window as Window & { archiveApi?: unknown }).archiveApi
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
    expect(screen.getByText('Review Pressure')).toBeInTheDocument()
    expect(screen.getByText('Guardrails')).toBeInTheDocument()
    expect(screen.getByText('fallback_to_conflict')).toBeInTheDocument()
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
