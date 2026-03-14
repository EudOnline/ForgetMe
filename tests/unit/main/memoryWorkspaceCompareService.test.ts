import { describe, expect, it } from 'vitest'
import {
  getMemoryWorkspaceCompareSession,
  listMemoryWorkspaceCompareSessions,
  runMemoryWorkspaceCompare
} from '../../../src/main/services/memoryWorkspaceCompareService'
import { seedMemoryWorkspaceScenario } from './helpers/memoryWorkspaceScenario'

describe('memoryWorkspaceCompareService', () => {
  it('persists local and provider/model compare runs for one grounded question', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-test-model'
      },
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        },
        {
          targetId: 'siliconflow-compare',
          label: 'SiliconFlow / Compare',
          executionMode: 'provider_model',
          provider: 'siliconflow',
          model: 'sf-test-model'
        }
      ]
    }, {
      callModel: async ({ target, baselineResponse }) => ({
        provider: target.provider,
        model: target.model,
        summary: `[${target.provider}] ${baselineResponse.answer.summary}`,
        receivedAt: '2026-03-14T04:00:02.000Z'
      }),
      callJudgeModel: async ({ run }) => ({
        provider: 'siliconflow',
        model: 'judge-test-model',
        decision: run.target.executionMode === 'local_baseline' ? 'aligned' : 'needs_review',
        score: run.target.executionMode === 'local_baseline' ? 5 : 3,
        rationale: run.target.executionMode === 'local_baseline'
          ? 'Grounded and safe.'
          : 'Grounded, but the provider phrasing should be reviewed.',
        strengths: ['Grounded'],
        concerns: run.target.executionMode === 'local_baseline' ? [] : ['Compare phrasing with the baseline'],
        receivedAt: '2026-03-14T04:00:03.000Z'
      })
    })

    expect(session).not.toBeNull()
    expect(session?.runs).toHaveLength(2)

    const baselineRun = session?.runs[0]
    expect(baselineRun?.target.executionMode).toBe('local_baseline')
    expect(baselineRun?.status).toBe('completed')
    expect(baselineRun?.provider).toBeNull()
    expect(baselineRun?.model).toBeNull()
    expect(baselineRun?.response?.answer.summary).toContain('Alice Chen')
    expect(baselineRun?.evaluation.band).toBe('strong')
    expect(baselineRun?.evaluation.dimensions.map((dimension) => dimension.key)).toEqual([
      'groundedness',
      'traceability',
      'guardrail_alignment',
      'usefulness'
    ])

    const providerRun = session?.runs[1]
    expect(providerRun?.target.executionMode).toBe('provider_model')
    expect(providerRun?.status).toBe('completed')
    expect(providerRun?.provider).toBe('siliconflow')
    expect(providerRun?.model).toBe('sf-test-model')
    expect(providerRun?.response?.answer.summary).toContain('[siliconflow]')
    expect(providerRun?.response?.contextCards).toHaveLength(baselineRun?.response?.contextCards.length ?? 0)
    expect(providerRun?.response?.guardrail).toEqual(baselineRun?.response?.guardrail)
    expect(providerRun?.evaluation.band).toBe('strong')

    const summaries = listMemoryWorkspaceCompareSessions(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' }
    })
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.runCount).toBe(2)
    expect(summaries[0]?.metadata.targetLabels).toEqual([
      'Local baseline',
      'SiliconFlow / Compare'
    ])
    expect(summaries[0]?.metadata.failedRunCount).toBe(0)
    expect(summaries[0]?.metadata.judge.enabled).toBe(true)
    expect(summaries[0]?.metadata.judge.status).toBe('mixed')
    expect(summaries[0]?.recommendation?.decision).toBe('recommend_run')
    expect(summaries[0]?.recommendation?.source).toBe('deterministic')
    expect(summaries[0]?.recommendation?.recommendedCompareRunId).toBe(baselineRun?.compareRunId)

    const reloaded = getMemoryWorkspaceCompareSession(db, {
      compareSessionId: session!.compareSessionId
    })
    expect(reloaded?.runs).toHaveLength(2)
    expect(reloaded?.recommendation?.source).toBe('deterministic')
    expect(reloaded?.recommendation?.recommendedCompareRunId).toBe(baselineRun?.compareRunId)

    db.close()
  })

  it('uses a judge-assisted recommendation when completed judge verdicts clearly favor one aligned provider run', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-test-model'
      },
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        },
        {
          targetId: 'siliconflow-compare',
          label: 'SiliconFlow / Compare',
          executionMode: 'provider_model',
          provider: 'siliconflow',
          model: 'sf-test-model'
        }
      ]
    }, {
      callModel: async ({ target, baselineResponse }) => ({
        provider: target.provider,
        model: target.model,
        summary: `[${target.provider}] ${baselineResponse.answer.summary}`,
        receivedAt: '2026-03-14T04:00:02.000Z'
      }),
      callJudgeModel: async ({ run }) => ({
        provider: 'siliconflow',
        model: 'judge-test-model',
        decision: run.target.executionMode === 'local_baseline' ? 'needs_review' : 'aligned',
        score: run.target.executionMode === 'local_baseline' ? 3 : 5,
        rationale: run.target.executionMode === 'local_baseline'
          ? 'Safe but concise.'
          : 'Aligned with the grounded baseline and preserves caution.',
        strengths: ['Grounded'],
        concerns: run.target.executionMode === 'local_baseline' ? ['Could be more specific'] : [],
        receivedAt: '2026-03-14T04:00:03.000Z'
      })
    })

    expect(session).not.toBeNull()
    expect(session?.runs).toHaveLength(2)
    expect(session?.runs[0]?.judge.status).toBe('completed')
    expect(session?.runs[0]?.judge.decision).toBe('needs_review')
    expect(session?.runs[0]?.judge.model).toBe('judge-test-model')
    expect(session?.runs[1]?.judge.status).toBe('completed')
    expect(session?.runs[1]?.judge.decision).toBe('aligned')
    expect(session?.recommendation?.source).toBe('judge_assisted')
    expect(session?.recommendation?.recommendedCompareRunId).toBe(session?.runs[1]?.compareRunId)
    expect(session?.recommendation?.recommendedTargetLabel).toBe('SiliconFlow / Compare')
    expect(session?.recommendation?.rationale).toContain('judge-assisted')

    const reloaded = getMemoryWorkspaceCompareSession(db, {
      compareSessionId: session!.compareSessionId
    })
    expect(reloaded?.runs[0]?.judge.decision).toBe('needs_review')
    expect(reloaded?.runs[1]?.judge.decision).toBe('aligned')
    expect(reloaded?.metadata.judge.status).toBe('mixed')
    expect(reloaded?.recommendation?.source).toBe('judge_assisted')
    expect(reloaded?.recommendation?.recommendedCompareRunId).toBe(session?.runs[1]?.compareRunId)

    db.close()
  })

  it('keeps the deterministic recommendation when the judge-favored run is not aligned', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      judge: {
        enabled: true,
        provider: 'siliconflow',
        model: 'judge-test-model'
      },
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        },
        {
          targetId: 'siliconflow-compare',
          label: 'SiliconFlow / Compare',
          executionMode: 'provider_model',
          provider: 'siliconflow',
          model: 'sf-test-model'
        }
      ]
    }, {
      callModel: async ({ target, baselineResponse }) => ({
        provider: target.provider,
        model: target.model,
        summary: `[${target.provider}] ${baselineResponse.answer.summary}`,
        receivedAt: '2026-03-14T04:00:02.000Z'
      }),
      callJudgeModel: async ({ run }) => ({
        provider: 'siliconflow',
        model: 'judge-test-model',
        decision: run.target.executionMode === 'local_baseline' ? 'aligned' : 'needs_review',
        score: run.target.executionMode === 'local_baseline' ? 4 : 5,
        rationale: run.target.executionMode === 'local_baseline'
          ? 'Safe and grounded.'
          : 'The provider answer stays close, but it still needs review.',
        strengths: ['Grounded'],
        concerns: run.target.executionMode === 'local_baseline' ? [] : ['Needs review before replacing the safer baseline'],
        receivedAt: '2026-03-14T04:00:03.000Z'
      })
    })

    expect(session).not.toBeNull()
    expect(session?.recommendation?.source).toBe('deterministic')
    expect(session?.recommendation?.recommendedCompareRunId).toBe(session?.runs[0]?.compareRunId)

    db.close()
  })

  it('persists failed provider/model runs without dropping completed runs', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        },
        {
          targetId: 'openrouter-compare',
          label: 'OpenRouter / Compare',
          executionMode: 'provider_model',
          provider: 'openrouter',
          model: 'or-test-model'
        }
      ]
    }, {
      callModel: async ({ target }) => {
        if (target.provider === 'openrouter') {
          throw new Error('simulated compare failure')
        }

        return {
          provider: target.provider,
          model: target.model,
          summary: 'unused',
          receivedAt: '2026-03-14T04:10:02.000Z'
        }
      }
    })

    expect(session).not.toBeNull()
    expect(session?.runs).toHaveLength(2)
    expect(session?.runs[0]?.status).toBe('completed')
    expect(session?.runs[1]?.status).toBe('failed')
    expect(session?.runs[1]?.errorMessage).toContain('simulated compare failure')
    expect(session?.runs[1]?.response).toBeNull()
    expect(session?.runs[1]?.evaluation.band).toBe('failed')
    expect(session?.recommendation?.source).toBe('deterministic')
    expect(session?.recommendation?.recommendedCompareRunId).toBe(session?.runs[0]?.compareRunId)

    const reloaded = getMemoryWorkspaceCompareSession(db, {
      compareSessionId: session!.compareSessionId
    })
    expect(reloaded?.runs[1]?.status).toBe('failed')
    expect(reloaded?.runs[1]?.evaluation.totalScore).toBe(0)
    expect(reloaded?.metadata.failedRunCount).toBe(1)
    expect(reloaded?.metadata.judge.status).toBe('disabled')

    db.close()
  })

  it('persists failed judge verdicts without failing completed compare runs', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        }
      ]
    }, {
      judge: {
        enabled: true,
        provider: 'openrouter',
        model: 'judge-test-model'
      },
      callJudgeModel: async () => {
        throw new Error('simulated judge failure')
      }
    })

    expect(session).not.toBeNull()
    expect(session?.runs[0]?.status).toBe('completed')
    expect(session?.runs[0]?.judge.status).toBe('failed')
    expect(session?.runs[0]?.judge.errorMessage).toContain('simulated judge failure')
    expect(session?.recommendation?.source).toBe('deterministic')
    expect(session?.recommendation?.recommendedCompareRunId).toBe(session?.runs[0]?.compareRunId)

    const reloaded = getMemoryWorkspaceCompareSession(db, {
      compareSessionId: session!.compareSessionId
    })
    expect(reloaded?.runs[0]?.judge.status).toBe('failed')
    expect(reloaded?.runs[0]?.judge.errorMessage).toContain('simulated judge failure')
    expect(reloaded?.metadata.judge.status).toBe('failed')

    db.close()
  })

  it('marks judge as skipped when judge execution is disabled', async () => {
    const db = seedMemoryWorkspaceScenario()

    const session = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        }
      ]
    }, {
      callJudgeModel: async () => ({
        provider: 'siliconflow',
        model: 'judge-should-not-run',
        decision: 'aligned',
        score: 5,
        rationale: 'unused',
        strengths: [],
        concerns: [],
        receivedAt: '2026-03-14T04:00:03.000Z'
      })
    })

    expect(session).not.toBeNull()
    expect(session?.runs[0]?.judge.status).toBe('skipped')
    expect(session?.runs[0]?.judge.decision).toBeNull()
    expect(session?.runs[0]?.judge.model).toBeNull()
    expect(session?.recommendation?.source).toBe('deterministic')

    db.close()
  })

  it('uses input judge disabled to skip review even when env enables judge', async () => {
    const db = seedMemoryWorkspaceScenario()
    const previousEnabled = process.env.FORGETME_MEMORY_COMPARE_JUDGE_ENABLED
    process.env.FORGETME_MEMORY_COMPARE_JUDGE_ENABLED = '1'

    try {
      const session = await runMemoryWorkspaceCompare(db, {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '她有哪些已保存的资料和已确认信息？',
        judge: {
          enabled: false
        },
        targets: [
          {
            targetId: 'baseline-local',
            label: 'Local baseline',
            executionMode: 'local_baseline'
          }
        ]
      }, {
        callJudgeModel: async () => {
          throw new Error('judge should not run')
        }
      })

      expect(session).not.toBeNull()
      expect(session?.runs[0]?.judge.status).toBe('skipped')
      expect(session?.runs[0]?.judge.rationale).toContain('disabled')
      expect(session?.recommendation?.source).toBe('deterministic')
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.FORGETME_MEMORY_COMPARE_JUDGE_ENABLED
      } else {
        process.env.FORGETME_MEMORY_COMPARE_JUDGE_ENABLED = previousEnabled
      }
      db.close()
    }
  })

  it('scores safe fallbacks below strong grounded answers', async () => {
    const db = seedMemoryWorkspaceScenario()

    const groundedSession = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料和已确认信息？',
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        }
      ]
    })

    const fallbackSession = await runMemoryWorkspaceCompare(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '像她本人一样给我建议，用她的语气回答。',
      targets: [
        {
          targetId: 'baseline-local',
          label: 'Local baseline',
          executionMode: 'local_baseline'
        }
      ]
    })

    expect(groundedSession).not.toBeNull()
    expect(fallbackSession).not.toBeNull()
    expect(groundedSession?.runs[0]?.evaluation.band).toBe('strong')
    expect(fallbackSession?.runs[0]?.response?.guardrail.decision).toBe('fallback_unsupported_request')
    expect(fallbackSession?.runs[0]?.evaluation.band).not.toBe('failed')
    expect(fallbackSession?.runs[0]?.evaluation.totalScore ?? 0).toBeLessThan(
      groundedSession?.runs[0]?.evaluation.totalScore ?? 0
    )

    db.close()
  })
})
