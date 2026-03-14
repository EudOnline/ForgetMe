import { describe, expect, it } from 'vitest'
import {
  getMemoryWorkspaceCompareMatrix,
  listMemoryWorkspaceCompareMatrices,
  runMemoryWorkspaceCompareMatrix
} from '../../../src/main/services/memoryWorkspaceCompareMatrixService'
import type {
  MemoryWorkspaceCompareSessionDetail,
  RunMemoryWorkspaceCompareInput
} from '../../../src/shared/archiveContracts'
import { seedMemoryWorkspaceScenario } from './helpers/memoryWorkspaceScenario'

function createCompareSessionDetail(input: {
  compareSessionId: string
  compareRunId: string
  scope: RunMemoryWorkspaceCompareInput['scope']
  question: string
  targetLabel?: string
  failedRunCount?: number
  createdAt?: string
}): MemoryWorkspaceCompareSessionDetail {
  const targetLabel = input.targetLabel ?? 'Local baseline'
  const createdAt = input.createdAt ?? '2026-03-14T06:00:00.000Z'

  return {
    compareSessionId: input.compareSessionId,
    scope: input.scope,
    title: 'Memory Workspace Compare',
    question: input.question,
    runCount: 1,
    metadata: {
      targetLabels: [targetLabel],
      failedRunCount: input.failedRunCount ?? 0,
      judge: {
        enabled: false,
        status: 'disabled'
      }
    },
    recommendation: {
      source: 'deterministic',
      decision: 'recommend_run',
      recommendedCompareRunId: input.compareRunId,
      recommendedTargetLabel: targetLabel,
      rationale: 'Best deterministic score.'
    },
    createdAt,
    updatedAt: createdAt,
    runs: [{
      compareRunId: input.compareRunId,
      compareSessionId: input.compareSessionId,
      ordinal: 1,
      target: {
        targetId: 'baseline-local',
        label: targetLabel,
        executionMode: 'local_baseline'
      },
      provider: null,
      model: null,
      status: 'completed',
      errorMessage: null,
      response: {
        scope: input.scope,
        question: input.question,
        title: 'Memory Workspace',
        answer: {
          summary: 'Grounded summary.',
          displayType: 'derived_summary',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: [],
          citationCount: 0,
          sourceKinds: [],
          fallbackApplied: false
        }
      },
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
        createdAt
      },
      contextHash: 'context-hash',
      promptHash: 'prompt-hash',
      createdAt
    }]
  }
}

describe('memoryWorkspaceCompareMatrixService', () => {
  it('persists one matrix session and one child compare session per row in order', async () => {
    const db = seedMemoryWorkspaceScenario()
    const executionOrder: string[] = []

    const matrix = await runMemoryWorkspaceCompareMatrix(db, {
      title: 'Daily matrix',
      rows: [
        {
          label: 'Person row',
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          question: '她有哪些已确认信息？'
        },
        {
          scope: { kind: 'global' },
          question: '现在最值得关注什么？'
        }
      ],
      targets: [{
        targetId: 'baseline-local',
        label: 'Local baseline',
        executionMode: 'local_baseline'
      }]
    }, {
      runCompare: async (_db, input) => {
        executionOrder.push(`${input.scope.kind}:${input.question}`)
        return createCompareSessionDetail({
          compareSessionId: `compare-${executionOrder.length}`,
          compareRunId: `compare-run-${executionOrder.length}`,
          scope: input.scope,
          question: input.question,
          createdAt: `2026-03-14T06:00:0${executionOrder.length}.000Z`
        })
      }
    })

    expect(matrix).not.toBeNull()
    expect(matrix?.rows).toHaveLength(2)
    expect(matrix?.rowCount).toBe(2)
    expect(matrix?.completedRowCount).toBe(2)
    expect(matrix?.failedRowCount).toBe(0)
    expect(matrix?.rows[0]?.ordinal).toBe(1)
    expect(matrix?.rows[0]?.label).toBe('Person row')
    expect(matrix?.rows[0]?.compareSessionId).toBe('compare-1')
    expect(matrix?.rows[1]?.compareSessionId).toBe('compare-2')
    expect(executionOrder).toEqual([
      'person:她有哪些已确认信息？',
      'global:现在最值得关注什么？'
    ])

    const summaries = listMemoryWorkspaceCompareMatrices(db)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.metadata.targetLabels).toEqual(['Local baseline'])

    const reloaded = getMemoryWorkspaceCompareMatrix(db, {
      matrixSessionId: matrix!.matrixSessionId
    })
    expect(reloaded?.rows[0]?.recommendedTargetLabel).toBe('Local baseline')
    expect(reloaded?.rows[1]?.status).toBe('completed')

    db.close()
  })

  it('marks only the failing row as failed and continues later rows', async () => {
    const db = seedMemoryWorkspaceScenario()
    let callCount = 0

    const matrix = await runMemoryWorkspaceCompareMatrix(db, {
      rows: [
        {
          scope: { kind: 'global' },
          question: '第一行'
        },
        {
          scope: { kind: 'person', canonicalPersonId: 'cp-1' },
          question: '第二行'
        },
        {
          scope: { kind: 'group', anchorPersonId: 'cp-1' },
          question: '第三行'
        }
      ]
    }, {
      runCompare: async (_db, input) => {
        callCount += 1
        if (input.question === '第二行') {
          throw new Error('simulated matrix row failure')
        }

        return createCompareSessionDetail({
          compareSessionId: `compare-${callCount}`,
          compareRunId: `compare-run-${callCount}`,
          scope: input.scope,
          question: input.question,
          failedRunCount: input.question === '第三行' ? 1 : 0,
          createdAt: `2026-03-14T06:10:0${callCount}.000Z`
        })
      }
    })

    expect(matrix).not.toBeNull()
    expect(matrix?.rows).toHaveLength(3)
    expect(matrix?.completedRowCount).toBe(2)
    expect(matrix?.failedRowCount).toBe(1)
    expect(matrix?.rows[1]?.status).toBe('failed')
    expect(matrix?.rows[1]?.errorMessage).toContain('simulated matrix row failure')
    expect(matrix?.rows[1]?.compareSessionId).toBeNull()
    expect(matrix?.rows[2]?.status).toBe('completed')
    expect(matrix?.rows[2]?.failedRunCount).toBe(1)

    const reloaded = getMemoryWorkspaceCompareMatrix(db, {
      matrixSessionId: matrix!.matrixSessionId
    })
    expect(reloaded?.failedRowCount).toBe(1)
    expect(reloaded?.rows[2]?.compareSessionId).toBe('compare-3')

    db.close()
  })
})
