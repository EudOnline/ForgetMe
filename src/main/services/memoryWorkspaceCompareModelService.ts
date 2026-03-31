import type {
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceResponse
} from '../../shared/archiveContracts'
import { callLiteLLM, resolveModelRoute } from './modelGatewayService'
import {
  type EvaluatedCompareRun,
  withJudgeVerdict
} from './memoryWorkspaceCompareEvaluationService'

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

function readMessageContent(payload: Record<string, unknown>) {
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Compare model response is missing choices')
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== 'object') {
    throw new Error('Compare model response choice is invalid')
  }

  const message = (firstChoice as { message?: unknown }).message
  if (!message || typeof message !== 'object') {
    throw new Error('Compare model response is missing message payload')
  }

  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }

        return ''
      })
      .filter((part) => part.length > 0)

    if (parts.length > 0) {
      return parts.join('\n')
    }
  }

  throw new Error('Compare model response content is not a supported text format')
}

function parseCompareSummary(
  payload: Record<string, unknown>,
  workflowKind: MemoryWorkspaceResponse['workflowKind'] = 'default'
) {
  const content = readMessageContent(payload).trim()
  if (!content) {
    throw new Error('Compare model response content is empty')
  }

  try {
    const parsed = JSON.parse(content) as { summary?: unknown; draft?: unknown }
    const preferredField = workflowKind === 'persona_draft_sandbox' ? parsed.draft : parsed.summary
    if (typeof preferredField === 'string' && preferredField.trim().length > 0) {
      return preferredField.trim()
    }

    const fallbackField = workflowKind === 'persona_draft_sandbox' ? parsed.summary : parsed.draft
    if (typeof fallbackField === 'string' && fallbackField.trim().length > 0) {
      return fallbackField.trim()
    }
  } catch {
    return content
  }

  throw new Error('Compare model response summary is missing')
}

function isTruthyEnvFlag(value: string | undefined) {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseJudgeDecision(value: unknown): MemoryWorkspaceCompareJudgeDecision {
  if (value === 'aligned' || value === 'needs_review' || value === 'not_grounded') {
    return value
  }

  throw new Error('Compare judge response decision is invalid')
}

function parseJudgeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3)
}

function parseJudgeScore(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Compare judge response score is invalid')
  }

  return Math.max(1, Math.min(5, Math.round(value)))
}

function parseCompareJudgeVerdict(payload: Record<string, unknown>) {
  const content = readMessageContent(payload).trim()
  if (!content) {
    throw new Error('Compare judge response content is empty')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error('Compare judge response is not valid JSON')
  }

  if (typeof parsed.rationale !== 'string' || parsed.rationale.trim().length === 0) {
    throw new Error('Compare judge response rationale is missing')
  }

  return {
    decision: parseJudgeDecision(parsed.decision),
    score: parseJudgeScore(parsed.score),
    rationale: parsed.rationale.trim(),
    strengths: parseJudgeStringArray(parsed.strengths),
    concerns: parseJudgeStringArray(parsed.concerns)
  }
}

export function createSkippedJudgeVerdict(reason: string, createdAt: string): MemoryWorkspaceCompareJudgeVerdict {
  return {
    status: 'skipped',
    provider: null,
    model: null,
    decision: null,
    score: null,
    rationale: reason,
    strengths: [],
    concerns: [],
    errorMessage: null,
    createdAt
  }
}

function createFailedJudgeVerdict(input: {
  provider: 'siliconflow' | 'openrouter'
  model: string
  errorMessage: string
  createdAt: string
}): MemoryWorkspaceCompareJudgeVerdict {
  return {
    status: 'failed',
    provider: input.provider,
    model: input.model,
    decision: null,
    score: null,
    rationale: 'Judge model failed before a verdict could be completed.',
    strengths: [],
    concerns: [],
    errorMessage: input.errorMessage,
    createdAt: input.createdAt
  }
}

function createCompletedJudgeVerdict(input: CompareJudgeCallResult): MemoryWorkspaceCompareJudgeVerdict {
  return {
    status: 'completed',
    provider: input.provider,
    model: input.model,
    decision: input.decision,
    score: input.score,
    rationale: input.rationale,
    strengths: input.strengths,
    concerns: input.concerns,
    errorMessage: null,
    createdAt: input.receivedAt ?? new Date().toISOString()
  }
}

function buildJudgePrompt(input: {
  baselineResponse: MemoryWorkspaceResponse
  run: EvaluatedCompareRun
}) {
  const sandboxPayload = input.baselineResponse.workflowKind === 'persona_draft_sandbox'

  return JSON.stringify({
    question: input.baselineResponse.question,
    expressionMode: input.baselineResponse.expressionMode,
    workflowKind: input.baselineResponse.workflowKind ?? 'default',
    baselineAnswer: input.baselineResponse.answer.summary,
    candidateAnswer: input.run.response?.answer.summary ?? null,
    baselineDisplayType: input.baselineResponse.answer.displayType,
    candidateDisplayType: input.run.response?.answer.displayType ?? null,
    baselinePersonaDraft: sandboxPayload ? input.baselineResponse.personaDraft : null,
    candidatePersonaDraft: sandboxPayload ? input.run.response?.personaDraft ?? null : null,
    communicationEvidence: sandboxPayload
      ? input.baselineResponse.communicationEvidence?.excerpts.map((excerpt) => ({
          excerptId: excerpt.excerptId,
          speakerDisplayName: excerpt.speakerDisplayName,
          text: excerpt.text
        })) ?? []
      : [],
    guardrail: input.run.response?.guardrail ?? input.baselineResponse.guardrail,
    contextCards: input.run.response?.contextCards.map((card) => ({
      title: card.title,
      body: card.body,
      displayType: card.displayType
    })) ?? [],
    deterministicEvaluation: input.run.evaluation
  })
}

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

function buildComparePrompt(baselineResponse: MemoryWorkspaceResponse) {
  return JSON.stringify({
    title: baselineResponse.title,
    question: baselineResponse.question,
    expressionMode: baselineResponse.expressionMode,
    workflowKind: baselineResponse.workflowKind ?? 'default',
    baselineAnswer: baselineResponse.answer.summary,
    displayType: baselineResponse.answer.displayType,
    personaDraft: baselineResponse.personaDraft,
    communicationEvidence: baselineResponse.communicationEvidence?.excerpts.map((excerpt) => ({
      excerptId: excerpt.excerptId,
      speakerDisplayName: excerpt.speakerDisplayName,
      text: excerpt.text
    })) ?? [],
    guardrail: baselineResponse.guardrail,
    contextCards: baselineResponse.contextCards.map((card) => ({
      title: card.title,
      body: card.body,
      displayType: card.displayType
    }))
  })
}

function compareModeLabel(expressionMode: MemoryWorkspaceResponse['expressionMode']) {
  return expressionMode === 'advice' ? 'grounded advice' : 'grounded archive'
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
