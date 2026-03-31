import type {
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceResponse
} from '../../shared/archiveContracts'
import { callLiteLLM, resolveModelRoute } from './modelGatewayService'
import {
  type EvaluatedCompareRun,
  withJudgeVerdict
} from './memoryWorkspaceCompareEvaluationService'
import {
  buildComparePrompt,
  buildJudgePrompt,
  compareModeLabel,
  createCompletedJudgeVerdict,
  createFailedJudgeVerdict,
  createSkippedJudgeVerdict,
  isTruthyEnvFlag,
  parseCompareJudgeVerdict,
  parseCompareSummary
} from './memoryWorkspaceCompareModelHelperService'

export type ProviderModelCompareTarget = Extract<MemoryWorkspaceCompareTarget, { executionMode: 'provider_model' }>

export type CompareModelCallResult = {
  provider: string
  model: string
  summary: string
  receivedAt?: string
}

export type CompareModelCaller = (input: {
  target: ProviderModelCompareTarget
  baselineResponse: MemoryWorkspaceResponse
}) => Promise<CompareModelCallResult>

export type CompareJudgeConfig = {
  enabled?: boolean
  provider?: 'siliconflow' | 'openrouter'
  model?: string
}

export type ResolvedCompareJudgeConfig = {
  provider: 'siliconflow' | 'openrouter'
  model: string
}

export type CompareJudgeCallResult = {
  provider: 'siliconflow' | 'openrouter'
  model: string
  decision: MemoryWorkspaceCompareJudgeDecision
  score: number
  rationale: string
  strengths: string[]
  concerns: string[]
  receivedAt?: string
}

export type CompareJudgeCaller = (input: {
  baselineResponse: MemoryWorkspaceResponse
  run: EvaluatedCompareRun
  judge: ResolvedCompareJudgeConfig
}) => Promise<CompareJudgeCallResult>

export { createSkippedJudgeVerdict } from './memoryWorkspaceCompareModelHelperService'

export function resolveJudgeConfig(
  inputJudge?: CompareJudgeConfig,
  optionsJudge?: CompareJudgeConfig
): ResolvedCompareJudgeConfig | null {
  const enabled = inputJudge?.enabled
    ?? optionsJudge?.enabled
    ?? (
      process.env.FORGETME_E2E_MEMORY_COMPARE_FIXTURE === '1'
      || isTruthyEnvFlag(process.env.FORGETME_MEMORY_COMPARE_JUDGE_ENABLED)
    )

  if (!enabled) {
    return null
  }

  const provider = inputJudge?.provider
    ?? optionsJudge?.provider
    ?? (process.env.FORGETME_MEMORY_COMPARE_JUDGE_PROVIDER === 'openrouter' ? 'openrouter' : 'siliconflow')
  const route = resolveModelRoute({
    taskType: 'memory_dialogue',
    preferredProvider: provider
  })

  return {
    provider,
    model: inputJudge?.model ?? optionsJudge?.model ?? process.env.FORGETME_MEMORY_COMPARE_JUDGE_MODEL ?? route.model
  }
}

export function buildComparedResponse(
  baselineResponse: MemoryWorkspaceResponse,
  summary: string
): MemoryWorkspaceResponse {
  if (baselineResponse.workflowKind === 'persona_draft_sandbox' && baselineResponse.personaDraft) {
    return {
      ...baselineResponse,
      answer: {
        ...baselineResponse.answer,
        summary: 'Reviewed simulation draft generated from archive-backed excerpts for this ask.'
      },
      personaDraft: {
        ...baselineResponse.personaDraft,
        draft: summary
      }
    }
  }

  return {
    ...baselineResponse,
    answer: {
      ...baselineResponse.answer,
      summary
    }
  }
}

export async function defaultCompareModelCaller(input: {
  target: ProviderModelCompareTarget
  baselineResponse: MemoryWorkspaceResponse
}): Promise<CompareModelCallResult> {
  if (process.env.FORGETME_E2E_MEMORY_COMPARE_FIXTURE === '1') {
    return {
      provider: input.target.provider,
      model: input.target.model,
      summary: input.baselineResponse.workflowKind === 'persona_draft_sandbox'
        ? `[fixture ${input.target.provider}] ${input.baselineResponse.personaDraft?.draft ?? input.baselineResponse.answer.summary}`
        : `[fixture ${input.target.provider}] ${input.baselineResponse.answer.summary}`,
      receivedAt: new Date().toISOString()
    }
  }

  const route = resolveModelRoute({
    taskType: 'memory_dialogue',
    preferredProvider: input.target.provider
  })

  const result = await callLiteLLM({
    route: {
      ...route,
      model: input.target.model
    },
    messages: [
      {
        role: 'system',
        content: [
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'You are comparing reviewed persona draft sandbox candidates.'
            : input.baselineResponse.expressionMode === 'advice'
              ? 'You are comparing grounded advice answers.'
              : 'You are comparing grounded archive answers.',
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'Return JSON only with a single "draft" field.'
            : 'Return JSON only with a single "summary" field.',
          'Stay strictly within the provided archive context.',
          'Do not roleplay, imitate a person, or invent facts.',
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'Keep the output clearly labeled as a simulation draft and preserve review-required caution.'
            : 'If the baseline guardrail shows conflict or evidence gaps, preserve that caution in the summary.'
        ].join(' ')
      },
      {
        role: 'user',
        content: buildComparePrompt(input.baselineResponse)
      }
    ],
    responseFormat: { type: 'json_object' }
  })

  return {
    provider: result.provider,
    model: input.target.model,
    summary: parseCompareSummary(result.payload, input.baselineResponse.workflowKind ?? 'default'),
    receivedAt: result.receivedAt
  }
}

export async function defaultCompareJudgeCaller(input: {
  baselineResponse: MemoryWorkspaceResponse
  run: EvaluatedCompareRun
  judge: ResolvedCompareJudgeConfig
}): Promise<CompareJudgeCallResult> {
  if (process.env.FORGETME_E2E_MEMORY_COMPARE_FIXTURE === '1') {
    return {
      provider: input.judge.provider,
      model: input.judge.model,
      decision: input.run.target.executionMode === 'local_baseline' ? 'aligned' : 'needs_review',
      score: input.run.target.executionMode === 'local_baseline' ? 5 : 4,
      rationale: input.baselineResponse.workflowKind === 'persona_draft_sandbox'
        ? (
          input.run.target.executionMode === 'local_baseline'
            ? 'Fixture judge confirms the sandbox baseline preserves simulation labeling and quote trace.'
            : 'Fixture judge flags this sandbox draft for light review while keeping the simulation boundary intact.'
        )
        : input.run.target.executionMode === 'local_baseline'
          ? `Fixture judge confirms the deterministic baseline preserves the ${compareModeLabel(input.baselineResponse.expressionMode)} answer.`
          : `Fixture judge flags this provider summary for light review while staying within ${compareModeLabel(input.baselineResponse.expressionMode)} scope.`,
      strengths: [
        input.baselineResponse.workflowKind === 'persona_draft_sandbox'
          ? 'Simulation label preserved'
          : `${input.baselineResponse.expressionMode === 'advice' ? 'Grounded advice' : 'Grounded archive'} scope preserved`
      ],
      concerns: input.run.target.executionMode === 'local_baseline'
        ? []
        : [input.baselineResponse.workflowKind === 'persona_draft_sandbox' ? 'Review quote trace before reuse' : 'Review summary style against baseline phrasing'],
      receivedAt: new Date().toISOString()
    }
  }

  const route = resolveModelRoute({
    taskType: 'memory_dialogue',
    preferredProvider: input.judge.provider
  })

  const result = await callLiteLLM({
    route: {
      ...route,
      model: input.judge.model
    },
    messages: [
      {
        role: 'system',
        content: [
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'You are judging a reviewed persona draft sandbox candidate against its quote-backed sandbox baseline.'
            : input.baselineResponse.expressionMode === 'advice'
              ? 'You are judging a candidate grounded advice answer against its grounded advice baseline.'
              : 'You are judging a candidate grounded archive answer against its grounded baseline.',
          'Return JSON only with fields: decision, score, rationale, strengths, concerns.',
          'decision must be one of aligned, needs_review, not_grounded.',
          'score must be an integer from 1 to 5.',
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'Use aligned when the candidate stays clearly labeled as simulation, remains grounded in the excerpts, and keeps quote trace reviewable.'
            : 'Use aligned when the candidate preserves grounded facts and guardrail boundaries.',
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'Use needs_review when it stays a labeled simulation but weakens quote fidelity, trace clarity, or editability.'
            : 'Use needs_review when it stays mostly grounded but weakens specificity or caution.',
          input.baselineResponse.workflowKind === 'persona_draft_sandbox'
            ? 'Use not_grounded when it rewards unlabeled roleplay, unsupported certainty, or unsafe persona delegation.'
            : 'Use not_grounded when it introduces unsupported claims, persona imitation, or unsafe framing.',
          'Keep strengths and concerns to short string arrays.'
        ].join(' ')
      },
      {
        role: 'user',
        content: buildJudgePrompt({
          baselineResponse: input.baselineResponse,
          run: input.run
        })
      }
    ],
    responseFormat: { type: 'json_object' }
  })

  const verdict = parseCompareJudgeVerdict(result.payload)

  return {
    provider: result.provider,
    model: input.judge.model,
    ...verdict,
    receivedAt: result.receivedAt
  }
}

export async function attachJudgeVerdicts(
  runs: EvaluatedCompareRun[],
  input: {
    baselineResponse: MemoryWorkspaceResponse
    judgeConfig: ResolvedCompareJudgeConfig | null
    callJudgeModel: CompareJudgeCaller
    createdAt: string
  }
) {
  const judgedRuns: MemoryWorkspaceCompareRunRecord[] = []

  for (const run of runs) {
    if (!input.judgeConfig) {
      judgedRuns.push(withJudgeVerdict(run, createSkippedJudgeVerdict('Judge model is disabled for this compare run.', input.createdAt)))
      continue
    }

    if (run.status !== 'completed' || !run.response) {
      judgedRuns.push(withJudgeVerdict(run, createSkippedJudgeVerdict('Compare run finished without a response, so judge review was skipped.', run.createdAt)))
      continue
    }

    try {
      const judgeResult = await input.callJudgeModel({
        baselineResponse: input.baselineResponse,
        run,
        judge: input.judgeConfig
      })
      judgedRuns.push(withJudgeVerdict(run, createCompletedJudgeVerdict(judgeResult)))
    } catch (error) {
      judgedRuns.push(withJudgeVerdict(run, createFailedJudgeVerdict({
        provider: input.judgeConfig.provider,
        model: input.judgeConfig.model,
        errorMessage: error instanceof Error ? error.message : String(error),
        createdAt: input.createdAt
      })))
    }
  }

  return judgedRuns
}
