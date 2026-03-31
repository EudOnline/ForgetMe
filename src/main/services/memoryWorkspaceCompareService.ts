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
import {
  buildCompareSessionMetadata,
  buildRecommendation,
  runSnapshotTimestamp,
  type EvaluatedCompareRun,
  type UnevaluatedCompareRun,
  withEvaluation,
  withJudgeVerdict
} from './memoryWorkspaceCompareEvaluationService'
import { askMemoryWorkspace } from './memoryWorkspaceService'

type CompareSessionRow = {
  id: string
  scopeKind: 'global' | 'person' | 'group'
  scopeTargetId: string | null
  title: string
  question: string
  expressionMode: MemoryWorkspaceResponse['expressionMode'] | null
  workflowKind: MemoryWorkspaceResponse['workflowKind'] | null
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

function buildComparedResponse(
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

async function defaultCompareModelCaller(input: {
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
    expressionMode: row.expressionMode === 'advice' ? 'advice' : 'grounded',
    workflowKind: row.workflowKind === 'persona_draft_sandbox' ? 'persona_draft_sandbox' : 'default',
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
  const target: MemoryWorkspaceCompareTarget = row.executionMode === 'local_baseline'
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
      expression_mode as expressionMode,
      workflow_kind as workflowKind,
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
      expression_mode as expressionMode,
      workflow_kind as workflowKind,
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
    const promptHash = hashValue({
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
    expressionMode,
    workflowKind,
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
        id, scope_kind, scope_target_id, title, question, expression_mode, workflow_kind, run_count, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      compareSessionId,
      input.scope.kind,
      scopeTargetId(input.scope),
      sessionSummary.title,
      input.question,
      sessionSummary.expressionMode,
      sessionSummary.workflowKind,
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
