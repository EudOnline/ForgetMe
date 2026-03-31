import type {
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceResponse
} from '../../shared/archiveContracts'
import type { EvaluatedCompareRun } from './memoryWorkspaceCompareEvaluationService'
import type { CompareJudgeCallResult } from './memoryWorkspaceCompareModelService'

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

export function parseCompareSummary(
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

export function isTruthyEnvFlag(value: string | undefined) {
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

export function parseCompareJudgeVerdict(payload: Record<string, unknown>) {
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

export function createFailedJudgeVerdict(input: {
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

export function createCompletedJudgeVerdict(input: CompareJudgeCallResult): MemoryWorkspaceCompareJudgeVerdict {
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

export function buildJudgePrompt(input: {
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

export function buildComparePrompt(baselineResponse: MemoryWorkspaceResponse) {
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

export function compareModeLabel(expressionMode: MemoryWorkspaceResponse['expressionMode']) {
  return expressionMode === 'advice' ? 'grounded advice' : 'grounded archive'
}
