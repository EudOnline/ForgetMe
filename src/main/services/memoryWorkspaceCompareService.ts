import crypto from 'node:crypto'
import type {
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceScope,
  RunMemoryWorkspaceCompareInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  buildCompareSessionMetadata,
  buildRecommendation,
  runSnapshotTimestamp,
  type UnevaluatedCompareRun,
  withEvaluation
} from './memoryWorkspaceCompareEvaluationService'
import {
  attachJudgeVerdicts,
  buildComparedResponse,
  defaultCompareJudgeCaller,
  defaultCompareModelCaller,
  resolveJudgeConfig,
  type CompareJudgeCaller,
  type CompareJudgeConfig,
  type CompareModelCaller
} from './memoryWorkspaceCompareModelService'
import {
  getStoredMemoryWorkspaceCompareSession,
  hashCompareValue,
  listStoredMemoryWorkspaceCompareSessions,
  persistMemoryWorkspaceCompareSession
} from './memoryWorkspaceComparePersistenceService'
import { askMemoryWorkspace } from './memoryWorkspaceService'

export const DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS: MemoryWorkspaceCompareTarget[] = [
  {
    targetId: 'baseline-local',
    label: 'Local baseline',
    executionMode: 'local_baseline'
  },
  {
    targetId: 'siliconflow-qwen25-72b',
    label: 'SiliconFlow / Qwen2.5-72B-Instruct',
    executionMode: 'provider_model',
    provider: 'siliconflow',
    model: process.env.FORGETME_MEMORY_COMPARE_SILICONFLOW_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct'
  },
  {
    targetId: 'openrouter-qwen25-72b',
    label: 'OpenRouter / qwen-2.5-72b-instruct',
    executionMode: 'provider_model',
    provider: 'openrouter',
    model: process.env.FORGETME_MEMORY_COMPARE_OPENROUTER_MODEL ?? 'qwen/qwen-2.5-72b-instruct'
  }
]

export function listMemoryWorkspaceCompareSessions(
  db: ArchiveDatabase,
  input: { scope?: MemoryWorkspaceScope } = {}
) {
  return listStoredMemoryWorkspaceCompareSessions(db, input)
}

export function getMemoryWorkspaceCompareSession(
  db: ArchiveDatabase,
  input: { compareSessionId: string }
): MemoryWorkspaceCompareSessionDetail | null {
  return getStoredMemoryWorkspaceCompareSession(db, input)
}

export async function runMemoryWorkspaceCompare(
  db: ArchiveDatabase,
  input: RunMemoryWorkspaceCompareInput,
  options: {
    callModel?: CompareModelCaller
    judge?: CompareJudgeConfig
    callJudgeModel?: CompareJudgeCaller
  } = {}
): Promise<MemoryWorkspaceCompareSessionDetail | null> {
  const expressionMode = input.expressionMode ?? 'grounded'
  const workflowKind = input.workflowKind ?? 'default'
  const baselineResponse = askMemoryWorkspace(db, {
    scope: input.scope,
    question: input.question,
    expressionMode,
    workflowKind
  })

  if (!baselineResponse) {
    return null
  }

  const compareTargets = input.targets?.length ? input.targets : DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS
  const compareSessionId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const callModel = options.callModel ?? defaultCompareModelCaller
  const judgeConfig = resolveJudgeConfig(input.judge, options.judge)
  const callJudgeModel = options.callJudgeModel ?? defaultCompareJudgeCaller
  const rawRuns: UnevaluatedCompareRun[] = []

  for (const [index, target] of compareTargets.entries()) {
    const ordinal = index + 1
    const promptHash = hashCompareValue({
      scope: input.scope,
      question: input.question,
      expressionMode,
      workflowKind,
      target
    })

    if (target.executionMode === 'local_baseline') {
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: null,
        model: null,
        status: 'completed',
        errorMessage: null,
        response: baselineResponse,
        contextHash: hashCompareValue(baselineResponse),
        promptHash,
        createdAt
      })
      continue
    }

    try {
      const modelResult = await callModel({
        target,
        baselineResponse
      })

      const response = buildComparedResponse(baselineResponse, modelResult.summary)
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: modelResult.provider,
        model: modelResult.model,
        status: 'completed',
        errorMessage: null,
        response,
        contextHash: hashCompareValue(response),
        promptHash,
        createdAt: modelResult.receivedAt ?? createdAt
      })
    } catch (error) {
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: target.provider,
        model: target.model,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        response: null,
        contextHash: hashCompareValue({
          compareSessionId,
          ordinal,
          target,
          status: 'failed'
        }),
        promptHash,
        createdAt
      })
    }
  }

  const evaluatedRuns = rawRuns.map(withEvaluation)
  const runs = await attachJudgeVerdicts(evaluatedRuns, {
    baselineResponse,
    judgeConfig,
    callJudgeModel,
    createdAt
  })
  const metadata = buildCompareSessionMetadata(runs)
  const recommendation = buildRecommendation(runs)
  const updatedAt = runs[runs.length - 1] ? runSnapshotTimestamp(runs[runs.length - 1]) : createdAt

  const sessionSummary: MemoryWorkspaceCompareSessionSummary = {
    compareSessionId,
    scope: input.scope,
    title: baselineResponse.title.replace('Memory Workspace', 'Memory Workspace Compare'),
    question: input.question,
    expressionMode,
    workflowKind,
    runCount: runs.length,
    metadata,
    recommendation,
    createdAt,
    updatedAt
  }

  persistMemoryWorkspaceCompareSession(db, {
    sessionSummary,
    runs
  })

  return {
    ...sessionSummary,
    runs
  }
}
