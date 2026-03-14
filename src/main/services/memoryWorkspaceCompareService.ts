import crypto from 'node:crypto'
import type {
  MemoryWorkspaceCompareEvaluationDimension,
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRecommendation,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareRunEvaluation,
  MemoryWorkspaceCompareSessionMetadata,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  RunMemoryWorkspaceCompareInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { callLiteLLM, resolveModelRoute } from './modelGatewayService'
import { askMemoryWorkspace } from './memoryWorkspaceService'

type CompareSessionRow = {
  id: string
  scopeKind: 'global' | 'person' | 'group'
  scopeTargetId: string | null
  title: string
  question: string
  runCount: number
  createdAt: string
  updatedAt: string
}

type CompareRunRow = {
  id: string
  compareSessionId: string
  ordinal: number
  targetId: string
  targetLabel: string
  executionMode: MemoryWorkspaceCompareTarget['executionMode']
  provider: string | null
  model: string | null
  status: MemoryWorkspaceCompareRunRecord['status']
  errorMessage: string | null
  responseJson: string | null
  promptHash: string
  contextHash: string
  judgeStatus: MemoryWorkspaceCompareJudgeVerdict['status'] | null
  judgeProvider: string | null
  judgeModel: string | null
  judgeDecision: MemoryWorkspaceCompareJudgeDecision | null
  judgeScore: number | null
  judgeRationale: string | null
  judgeStrengthsJson: string | null
  judgeConcernsJson: string | null
  judgeErrorMessage: string | null
  judgeCreatedAt: string | null
  createdAt: string
}

type ProviderModelCompareTarget = Extract<MemoryWorkspaceCompareTarget, { executionMode: 'provider_model' }>
type UnevaluatedCompareRun = Omit<MemoryWorkspaceCompareRunRecord, 'evaluation' | 'judge'>
type EvaluatedCompareRun = Omit<MemoryWorkspaceCompareRunRecord, 'judge'>

type CompareModelCallResult = {
  provider: string
  model: string
  summary: string
  receivedAt?: string
}

type CompareModelCaller = (input: {
  target: ProviderModelCompareTarget
  baselineResponse: MemoryWorkspaceResponse
}) => Promise<CompareModelCallResult>

type CompareJudgeConfig = {
  enabled?: boolean
  provider?: 'siliconflow' | 'openrouter'
  model?: string
}

type ResolvedCompareJudgeConfig = {
  provider: 'siliconflow' | 'openrouter'
  model: string
}

type CompareJudgeCallResult = {
  provider: 'siliconflow' | 'openrouter'
  model: string
  decision: MemoryWorkspaceCompareJudgeDecision
  score: number
  rationale: string
  strengths: string[]
  concerns: string[]
  receivedAt?: string
}

type CompareJudgeCaller = (input: {
  baselineResponse: MemoryWorkspaceResponse
  run: EvaluatedCompareRun
  judge: ResolvedCompareJudgeConfig
}) => Promise<CompareJudgeCallResult>

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

function scopeTargetId(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return scope.canonicalPersonId
  }

  if (scope.kind === 'group') {
    return scope.anchorPersonId
  }

  return null
}

function parseScope(row: Pick<CompareSessionRow, 'scopeKind' | 'scopeTargetId'>): MemoryWorkspaceScope {
  if (row.scopeKind === 'person') {
    return { kind: 'person', canonicalPersonId: row.scopeTargetId ?? '' }
  }

  if (row.scopeKind === 'group') {
    return { kind: 'group', anchorPersonId: row.scopeTargetId ?? '' }
  }

  return { kind: 'global' }
}

function scopesEqual(left: MemoryWorkspaceScope, right: MemoryWorkspaceScope) {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'person' && right.kind === 'person') {
    return left.canonicalPersonId === right.canonicalPersonId
  }

  if (left.kind === 'group' && right.kind === 'group') {
    return left.anchorPersonId === right.anchorPersonId
  }

  return true
}

function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

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

function parseCompareSummary(payload: Record<string, unknown>) {
  const content = readMessageContent(payload).trim()
  if (!content) {
    throw new Error('Compare model response content is empty')
  }

  try {
    const parsed = JSON.parse(content) as { summary?: unknown }
    if (typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
      return parsed.summary.trim()
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

function parseStoredJudgeStringArray(value: string | null) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parseJudgeStringArray(parsed)
  } catch {
    return []
  }
}

function createSkippedJudgeVerdict(reason: string, createdAt: string): MemoryWorkspaceCompareJudgeVerdict {
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
  return JSON.stringify({
    question: input.baselineResponse.question,
    baselineAnswer: input.baselineResponse.answer.summary,
    candidateAnswer: input.run.response?.answer.summary ?? null,
    baselineDisplayType: input.baselineResponse.answer.displayType,
    candidateDisplayType: input.run.response?.answer.displayType ?? null,
    guardrail: input.run.response?.guardrail ?? input.baselineResponse.guardrail,
    contextCards: input.run.response?.contextCards.map((card) => ({
      title: card.title,
      body: card.body,
      displayType: card.displayType
    })) ?? [],
    deterministicEvaluation: input.run.evaluation
  })
}

function resolveJudgeConfig(
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
    baselineAnswer: baselineResponse.answer.summary,
    displayType: baselineResponse.answer.displayType,
    guardrail: baselineResponse.guardrail,
    contextCards: baselineResponse.contextCards.map((card) => ({
      title: card.title,
      body: card.body,
      displayType: card.displayType
    }))
  })
}

function buildComparedResponse(
  baselineResponse: MemoryWorkspaceResponse,
  summary: string
): MemoryWorkspaceResponse {
  return {
    ...baselineResponse,
    answer: {
      ...baselineResponse.answer,
      summary
    }
  }
}

function normalizeSummaryText(summary: string) {
  return summary.trim().toLowerCase()
}

function summaryIncludesAny(summary: string, keywords: string[]) {
  const normalized = normalizeSummaryText(summary)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function groundednessDimension(run: UnevaluatedCompareRun): MemoryWorkspaceCompareEvaluationDimension {
  if (run.status === 'failed' || !run.response) {
    return {
      key: 'groundedness',
      label: 'Groundedness',
      score: 0,
      maxScore: 5,
      rationale: 'Run failed before a grounded answer could be evaluated.'
    }
  }

  const decision = run.response.guardrail.decision
  if (decision === 'grounded_answer') {
    return {
      key: 'groundedness',
      label: 'Groundedness',
      score: 5,
      maxScore: 5,
      rationale: 'Completed with a grounded answer decision.'
    }
  }

  return {
    key: 'groundedness',
    label: 'Groundedness',
    score: 4,
    maxScore: 5,
    rationale: `Completed with a safe fallback (${decision}) instead of fabricating unsupported claims.`
  }
}

function traceabilityDimension(run: UnevaluatedCompareRun): MemoryWorkspaceCompareEvaluationDimension {
  if (run.status === 'failed' || !run.response) {
    return {
      key: 'traceability',
      label: 'Traceability',
      score: 0,
      maxScore: 5,
      rationale: 'No response snapshot is available to trace.'
    }
  }

  const citationCount = run.response.guardrail.citationCount
  const sourceKindBonus = run.response.guardrail.sourceKinds.length > 1 ? 1 : 0
  const score = Math.min(5, Math.max(1, citationCount + sourceKindBonus))
  const sourceKindCount = run.response.guardrail.sourceKinds.length

  return {
    key: 'traceability',
    label: 'Traceability',
    score,
    maxScore: 5,
    rationale: `${citationCount} citations and ${sourceKindCount} source kinds are visible in the compare snapshot.`
  }
}

function guardrailAlignmentDimension(run: UnevaluatedCompareRun): MemoryWorkspaceCompareEvaluationDimension {
  if (run.status === 'failed' || !run.response) {
    return {
      key: 'guardrail_alignment',
      label: 'Guardrail Alignment',
      score: 0,
      maxScore: 5,
      rationale: 'Failed runs cannot be checked against guardrail language.'
    }
  }

  const decision = run.response.guardrail.decision
  const summary = run.response.answer.summary

  if (decision === 'grounded_answer') {
    return {
      key: 'guardrail_alignment',
      label: 'Guardrail Alignment',
      score: 5,
      maxScore: 5,
      rationale: 'No fallback language is required for grounded answers.'
    }
  }

  const requiredKeywords = decision === 'fallback_to_conflict'
    ? ['冲突', 'conflict', 'uncertain', '不确定', '未解决', 'ambigu']
    : decision === 'fallback_insufficient_evidence'
      ? ['insufficient', 'not enough', 'evidence', '资料不足', '证据不足', '无法确认', '不足']
      : ['cannot', 'imitate', 'voice', 'style', '模仿', '不能', '无法', '本人']

  const preservesFallback = summaryIncludesAny(summary, requiredKeywords)

  return {
    key: 'guardrail_alignment',
    label: 'Guardrail Alignment',
    score: preservesFallback ? 5 : 2,
    maxScore: 5,
    rationale: preservesFallback
      ? `Summary preserves the required ${decision} boundary language.`
      : `Summary weakens the required ${decision} boundary language.`
  }
}

function usefulnessDimension(run: UnevaluatedCompareRun): MemoryWorkspaceCompareEvaluationDimension {
  if (run.status === 'failed' || !run.response) {
    return {
      key: 'usefulness',
      label: 'Usefulness',
      score: 0,
      maxScore: 5,
      rationale: 'Failed runs are not useful to the user.'
    }
  }

  const summaryLength = run.response.answer.summary.trim().length
  let score = 2

  if (summaryLength >= 40) {
    score += 1
  }

  if (summaryLength >= 100) {
    score += 1
  }

  if (
    run.response.guardrail.decision === 'grounded_answer'
    || run.response.guardrail.decision === 'fallback_to_conflict'
  ) {
    score += 1
  }

  return {
    key: 'usefulness',
    label: 'Usefulness',
    score: Math.min(5, score),
    maxScore: 5,
    rationale: `Summary length ${summaryLength} and response mode ${run.response.guardrail.decision} determine usefulness.`
  }
}

function evaluateCompareRun(run: UnevaluatedCompareRun): MemoryWorkspaceCompareRunEvaluation {
  const dimensions = [
    groundednessDimension(run),
    traceabilityDimension(run),
    guardrailAlignmentDimension(run),
    usefulnessDimension(run)
  ]

  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0)
  const maxScore = dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0)

  if (run.status === 'failed' || totalScore === 0) {
    return {
      totalScore,
      maxScore,
      band: 'failed',
      dimensions
    }
  }

  if (totalScore >= 16) {
    return {
      totalScore,
      maxScore,
      band: 'strong',
      dimensions
    }
  }

  if (totalScore >= 11) {
    return {
      totalScore,
      maxScore,
      band: 'acceptable',
      dimensions
    }
  }

  return {
    totalScore,
    maxScore,
    band: 'fallback',
    dimensions
  }
}

function withEvaluation(run: UnevaluatedCompareRun): EvaluatedCompareRun {
  return {
    ...run,
    evaluation: evaluateCompareRun(run)
  }
}

function withJudgeVerdict(
  run: EvaluatedCompareRun,
  judge: MemoryWorkspaceCompareJudgeVerdict
): MemoryWorkspaceCompareRunRecord {
  return {
    ...run,
    judge
  }
}

function runSnapshotTimestamp(run: MemoryWorkspaceCompareRunRecord) {
  return run.judge.createdAt ?? run.createdAt
}

function dimensionScore(run: MemoryWorkspaceCompareRunRecord, key: MemoryWorkspaceCompareEvaluationDimension['key']) {
  return run.evaluation.dimensions.find((dimension) => dimension.key === key)?.score ?? 0
}

function compareRunsForRecommendation(left: MemoryWorkspaceCompareRunRecord, right: MemoryWorkspaceCompareRunRecord) {
  if (right.evaluation.totalScore !== left.evaluation.totalScore) {
    return right.evaluation.totalScore - left.evaluation.totalScore
  }

  const groundednessDelta = dimensionScore(right, 'groundedness') - dimensionScore(left, 'groundedness')
  if (groundednessDelta !== 0) {
    return groundednessDelta
  }

  const traceabilityDelta = dimensionScore(right, 'traceability') - dimensionScore(left, 'traceability')
  if (traceabilityDelta !== 0) {
    return traceabilityDelta
  }

  if (left.target.executionMode !== right.target.executionMode) {
    return left.target.executionMode === 'local_baseline' ? -1 : 1
  }

  return left.ordinal - right.ordinal
}

function buildRecommendation(runs: MemoryWorkspaceCompareRunRecord[]): MemoryWorkspaceCompareRecommendation | null {
  const completedRuns = runs.filter((run) => run.status === 'completed')
  if (!completedRuns.length) {
    return {
      decision: 'no_recommendation',
      recommendedCompareRunId: null,
      recommendedTargetLabel: null,
      rationale: 'No completed compare run is available yet.'
    }
  }

  const ordered = [...completedRuns].sort(compareRunsForRecommendation)
  const bestRun = ordered[0]

  if (!bestRun) {
    return {
      decision: 'no_recommendation',
      recommendedCompareRunId: null,
      recommendedTargetLabel: null,
      rationale: 'No completed compare run is available yet.'
    }
  }

  const bestReason = bestRun.evaluation.dimensions
    .slice()
    .sort((left, right) => right.score - left.score)[0]

  return {
    decision: 'recommend_run',
    recommendedCompareRunId: bestRun.compareRunId,
    recommendedTargetLabel: bestRun.target.label,
    rationale: `Highest deterministic rubric score (${bestRun.evaluation.totalScore}/${bestRun.evaluation.maxScore}) led by ${bestReason?.label ?? 'overall quality'}${bestRun.target.executionMode === 'local_baseline' ? ', with tie-break preference for the safer baseline' : ''}.`
  }
}

function judgeSnapshotEnabled(run: MemoryWorkspaceCompareRunRecord) {
  return run.judge.status !== 'skipped'
    || run.judge.provider !== null
    || (typeof run.judge.model === 'string' && run.judge.model.trim().length > 0)
}

function buildCompareSessionMetadata(runs: MemoryWorkspaceCompareRunRecord[]): MemoryWorkspaceCompareSessionMetadata {
  const targetLabels: string[] = []
  const seenLabels = new Set<string>()

  for (const run of runs) {
    if (!seenLabels.has(run.target.label)) {
      seenLabels.add(run.target.label)
      targetLabels.push(run.target.label)
    }
  }

  const failedRunCount = runs.filter((run) => run.status === 'failed').length
  const judgeRuns = runs.filter(judgeSnapshotEnabled)
  const completedJudgeRuns = judgeRuns.filter((run) => run.judge.status === 'completed')
  const failedJudgeRuns = judgeRuns.filter((run) => run.judge.status === 'failed')
  const judgeDecisions = new Set(
    completedJudgeRuns
      .map((run) => run.judge.decision)
      .filter((decision): decision is NonNullable<typeof decision> => decision !== null)
  )

  return {
    targetLabels,
    failedRunCount,
    judge: !judgeRuns.length
      ? {
          enabled: false,
          status: 'disabled'
        }
      : {
          enabled: true,
          status: failedJudgeRuns.length === judgeRuns.length
            ? 'failed'
            : completedJudgeRuns.length === judgeRuns.length && judgeDecisions.size <= 1
              ? 'completed'
            : 'mixed'
        }
  }
}

async function defaultCompareModelCaller(input: {
  target: ProviderModelCompareTarget
  baselineResponse: MemoryWorkspaceResponse
}): Promise<CompareModelCallResult> {
  if (process.env.FORGETME_E2E_MEMORY_COMPARE_FIXTURE === '1') {
    return {
      provider: input.target.provider,
      model: input.target.model,
      summary: `[fixture ${input.target.provider}] ${input.baselineResponse.answer.summary}`,
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
          'You are comparing grounded archive answers.',
          'Return JSON only with a single "summary" field.',
          'Stay strictly within the provided archive context.',
          'Do not roleplay, imitate a person, or invent facts.',
          'If the baseline guardrail shows conflict or evidence gaps, preserve that caution in the summary.'
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
    summary: parseCompareSummary(result.payload),
    receivedAt: result.receivedAt
  }
}

async function defaultCompareJudgeCaller(input: {
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
      rationale: input.run.target.executionMode === 'local_baseline'
        ? 'Fixture judge confirms the deterministic baseline preserves the grounded answer.'
        : 'Fixture judge flags this provider summary for light review while staying within grounded scope.',
      strengths: ['Grounded archive scope preserved'],
      concerns: input.run.target.executionMode === 'local_baseline' ? [] : ['Review summary style against baseline phrasing'],
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
          'You are judging a candidate grounded archive answer against its grounded baseline.',
          'Return JSON only with fields: decision, score, rationale, strengths, concerns.',
          'decision must be one of aligned, needs_review, not_grounded.',
          'score must be an integer from 1 to 5.',
          'Use aligned when the candidate preserves grounded facts and guardrail boundaries.',
          'Use needs_review when it stays mostly grounded but weakens specificity or caution.',
          'Use not_grounded when it introduces unsupported claims, persona imitation, or unsafe framing.',
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

async function attachJudgeVerdicts(
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

function mapCompareSessionRow(row: CompareSessionRow): MemoryWorkspaceCompareSessionSummary {
  return {
    compareSessionId: row.id,
    scope: parseScope(row),
    title: row.title,
    question: row.question,
    runCount: row.runCount,
    metadata: {
      targetLabels: [],
      failedRunCount: 0,
      judge: {
        enabled: false,
        status: 'disabled'
      }
    },
    recommendation: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapStoredJudgeVerdict(row: CompareRunRow): MemoryWorkspaceCompareJudgeVerdict {
  if (!row.judgeStatus) {
    return createSkippedJudgeVerdict('Judge verdict was not recorded for this compare run.', row.createdAt)
  }

  return {
    status: row.judgeStatus,
    provider: row.judgeProvider === 'openrouter' ? 'openrouter' : row.judgeProvider === 'siliconflow' ? 'siliconflow' : null,
    model: row.judgeModel,
    decision: row.judgeDecision,
    score: typeof row.judgeScore === 'number' ? row.judgeScore : null,
    rationale: row.judgeRationale,
    strengths: parseStoredJudgeStringArray(row.judgeStrengthsJson),
    concerns: parseStoredJudgeStringArray(row.judgeConcernsJson),
    errorMessage: row.judgeErrorMessage,
    createdAt: row.judgeCreatedAt
  }
}

function mapCompareRunRow(row: CompareRunRow): MemoryWorkspaceCompareRunRecord {
  const target = row.executionMode === 'local_baseline'
    ? {
        targetId: row.targetId,
        label: row.targetLabel,
        executionMode: 'local_baseline'
      }
    : {
        targetId: row.targetId,
        label: row.targetLabel,
        executionMode: 'provider_model',
        provider: row.provider === 'openrouter' ? 'openrouter' : 'siliconflow',
        model: row.model ?? ''
      }

  const run = withEvaluation({
    compareRunId: row.id,
    compareSessionId: row.compareSessionId,
    ordinal: row.ordinal,
    target,
    provider: row.provider,
    model: row.model,
    status: row.status,
    errorMessage: row.errorMessage,
    response: row.responseJson ? JSON.parse(row.responseJson) as MemoryWorkspaceResponse : null,
    contextHash: row.contextHash,
    promptHash: row.promptHash,
    createdAt: row.createdAt
  })

  return withJudgeVerdict(run, mapStoredJudgeVerdict(row))
}

function loadCompareSessionRow(db: ArchiveDatabase, compareSessionId: string) {
  return db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      question,
      run_count as runCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_compare_sessions
     where id = ?`
  ).get(compareSessionId) as CompareSessionRow | undefined
}

function loadCompareRunRows(db: ArchiveDatabase, compareSessionId: string) {
  return db.prepare(
    `select
      runs.id as id,
      runs.compare_session_id as compareSessionId,
      runs.ordinal as ordinal,
      runs.target_id as targetId,
      runs.target_label as targetLabel,
      runs.execution_mode as executionMode,
      runs.provider as provider,
      runs.model as model,
      runs.status as status,
      runs.error_message as errorMessage,
      runs.response_json as responseJson,
      runs.prompt_hash as promptHash,
      runs.context_hash as contextHash,
      judges.status as judgeStatus,
      judges.provider as judgeProvider,
      judges.model as judgeModel,
      judges.decision as judgeDecision,
      judges.score as judgeScore,
      judges.rationale as judgeRationale,
      judges.strengths_json as judgeStrengthsJson,
      judges.concerns_json as judgeConcernsJson,
      judges.error_message as judgeErrorMessage,
      judges.created_at as judgeCreatedAt,
      runs.created_at as createdAt
     from memory_workspace_compare_runs runs
     left join memory_workspace_compare_judgements judges
       on judges.compare_run_id = runs.id
     where runs.compare_session_id = ?
     order by runs.ordinal asc, runs.created_at asc`
  ).all(compareSessionId) as CompareRunRow[]
}

function buildCompareSessionSummary(
  row: CompareSessionRow,
  runs: MemoryWorkspaceCompareRunRecord[]
): MemoryWorkspaceCompareSessionSummary {
  return {
    ...mapCompareSessionRow(row),
    metadata: buildCompareSessionMetadata(runs),
    recommendation: buildRecommendation(runs)
  }
}

export function listMemoryWorkspaceCompareSessions(
  db: ArchiveDatabase,
  input: { scope?: MemoryWorkspaceScope } = {}
) {
  const rows = db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      question,
      run_count as runCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_compare_sessions
     order by updated_at desc, created_at desc, id asc`
  ).all() as CompareSessionRow[]

  return rows
    .map((row) => {
      const runs = loadCompareRunRows(db, row.id).map(mapCompareRunRow)
      return buildCompareSessionSummary(row, runs)
    })
    .filter((session) => (input.scope ? scopesEqual(session.scope, input.scope) : true))
}

export function getMemoryWorkspaceCompareSession(
  db: ArchiveDatabase,
  input: { compareSessionId: string }
): MemoryWorkspaceCompareSessionDetail | null {
  const sessionRow = loadCompareSessionRow(db, input.compareSessionId)
  if (!sessionRow) {
    return null
  }

  const runRows = loadCompareRunRows(db, input.compareSessionId)
  const runs = runRows.map(mapCompareRunRow)

  return {
    ...buildCompareSessionSummary(sessionRow, runs),
    runs
  }
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
  const baselineResponse = askMemoryWorkspace(db, {
    scope: input.scope,
    question: input.question
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
    const promptHash = hashValue({
      scope: input.scope,
      question: input.question,
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
        contextHash: hashValue(baselineResponse),
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
        contextHash: hashValue(response),
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
        contextHash: hashValue({
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
    runCount: runs.length,
    metadata,
    recommendation,
    createdAt,
    updatedAt
  }

  db.exec('begin immediate')
  try {
    db.prepare(
      `insert into memory_workspace_compare_sessions (
        id, scope_kind, scope_target_id, title, question, run_count, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      compareSessionId,
      input.scope.kind,
      scopeTargetId(input.scope),
      sessionSummary.title,
      input.question,
      runs.length,
      createdAt,
      sessionSummary.updatedAt
    )

    const insertRun = db.prepare(
      `insert into memory_workspace_compare_runs (
        id, compare_session_id, ordinal, target_id, target_label, execution_mode,
        provider, model, status, error_message, response_json, prompt_hash, context_hash, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertJudge = db.prepare(
      `insert into memory_workspace_compare_judgements (
        compare_run_id, status, provider, model, decision, score, rationale,
        strengths_json, concerns_json, error_message, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const run of runs) {
      insertRun.run(
        run.compareRunId,
        compareSessionId,
        run.ordinal,
        run.target.targetId,
        run.target.label,
        run.target.executionMode,
        run.provider,
        run.model,
        run.status,
        run.errorMessage,
        run.response ? JSON.stringify(run.response) : null,
        run.promptHash,
        run.contextHash,
        run.createdAt
      )

      insertJudge.run(
        run.compareRunId,
        run.judge.status,
        run.judge.provider,
        run.judge.model,
        run.judge.decision,
        run.judge.score,
        run.judge.rationale,
        JSON.stringify(run.judge.strengths),
        JSON.stringify(run.judge.concerns),
        run.judge.errorMessage,
        run.judge.createdAt
      )
    }

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }

  return {
    ...sessionSummary,
    runs
  }
}
