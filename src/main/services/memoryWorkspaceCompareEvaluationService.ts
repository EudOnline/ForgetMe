import type {
  MemoryWorkspaceCompareEvaluationDimension,
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRecommendation,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareRunEvaluation,
  MemoryWorkspaceCompareSessionMetadata,
  MemoryWorkspaceResponse
} from '../../shared/archiveContracts'

export type UnevaluatedCompareRun = Omit<MemoryWorkspaceCompareRunRecord, 'evaluation' | 'judge'>
export type EvaluatedCompareRun = Omit<MemoryWorkspaceCompareRunRecord, 'judge'>

function normalizeSummaryText(summary: string) {
  return summary.trim().toLowerCase()
}

function summaryIncludesAny(summary: string, keywords: string[]) {
  const normalized = normalizeSummaryText(summary)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function isSandboxWorkflowResponse(response: MemoryWorkspaceResponse | null | undefined) {
  return response?.workflowKind === 'persona_draft_sandbox'
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

  if (isSandboxWorkflowResponse(run.response)) {
    const supportingExcerptCount = run.response.personaDraft?.supportingExcerpts.length ?? 0
    const traceCount = run.response.personaDraft?.trace.length ?? 0
    const score = run.response.guardrail.decision === 'sandbox_review_required' && supportingExcerptCount > 0
      ? (traceCount > 0 ? 5 : 4)
      : 2

    return {
      key: 'groundedness',
      label: 'Groundedness',
      score,
      maxScore: 5,
      rationale: score >= 4
        ? `Sandbox draft stays review-required and remains tied to ${supportingExcerptCount} supporting excerpts.`
        : 'Sandbox draft no longer shows enough quote-backed grounding for confident review.'
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

  if (isSandboxWorkflowResponse(run.response)) {
    const traceCount = run.response.personaDraft?.trace.length ?? 0
    const supportingExcerptCount = run.response.personaDraft?.supportingExcerpts.length ?? 0
    const score = Math.min(5, Math.max(1, traceCount + (supportingExcerptCount > 1 ? 1 : 0)))

    return {
      key: 'traceability',
      label: 'Traceability',
      score,
      maxScore: 5,
      rationale: `Visible quote trace covers ${traceCount} draft segments across ${supportingExcerptCount} supporting excerpts.`
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

  if (isSandboxWorkflowResponse(run.response)) {
    const disclaimer = run.response.personaDraft?.disclaimer ?? ''
    const keepsSimulationLabel = summaryIncludesAny(disclaimer, [
      'simulation',
      'not a statement',
      'not the person',
      '不是本人',
      '非本人'
    ])

    return {
      key: 'guardrail_alignment',
      label: 'Guardrail Alignment',
      score: keepsSimulationLabel ? 5 : 2,
      maxScore: 5,
      rationale: keepsSimulationLabel
        ? 'Sandbox draft keeps explicit simulation and non-delegation labeling.'
        : 'Sandbox draft weakens the required simulation / non-delegation label.'
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

  if (isSandboxWorkflowResponse(run.response)) {
    const draftLength = run.response.personaDraft?.draft.trim().length ?? 0
    let score = 2

    if (draftLength >= 30) {
      score += 1
    }

    if (draftLength >= 60) {
      score += 1
    }

    if (run.response.personaDraft?.reviewState === 'review_required') {
      score += 1
    }

    return {
      key: 'usefulness',
      label: 'Usefulness',
      score: Math.min(5, score),
      maxScore: 5,
      rationale: `Draft length ${draftLength} and review-required state determine how editable the sandbox draft is.`
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

export function withEvaluation(run: UnevaluatedCompareRun): EvaluatedCompareRun {
  return {
    ...run,
    evaluation: evaluateCompareRun(run)
  }
}

export function withJudgeVerdict(
  run: EvaluatedCompareRun,
  judge: MemoryWorkspaceCompareJudgeVerdict
): MemoryWorkspaceCompareRunRecord {
  return {
    ...run,
    judge
  }
}

export function runSnapshotTimestamp(run: MemoryWorkspaceCompareRunRecord) {
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

function judgeDecisionRank(decision: MemoryWorkspaceCompareJudgeDecision | null) {
  if (decision === 'aligned') {
    return 3
  }

  if (decision === 'needs_review') {
    return 2
  }

  if (decision === 'not_grounded') {
    return 1
  }

  return 0
}

function compareRunsForJudgeRecommendation(left: MemoryWorkspaceCompareRunRecord, right: MemoryWorkspaceCompareRunRecord) {
  const decisionDelta = judgeDecisionRank(right.judge.decision) - judgeDecisionRank(left.judge.decision)
  if (decisionDelta !== 0) {
    return decisionDelta
  }

  const scoreDelta = (right.judge.score ?? 0) - (left.judge.score ?? 0)
  if (scoreDelta !== 0) {
    return scoreDelta
  }

  return compareRunsForRecommendation(left, right)
}

function judgeMetricsEqual(left: MemoryWorkspaceCompareRunRecord, right: MemoryWorkspaceCompareRunRecord) {
  return judgeDecisionRank(left.judge.decision) === judgeDecisionRank(right.judge.decision)
    && (left.judge.score ?? 0) === (right.judge.score ?? 0)
}

function noRecommendation(rationale: string): MemoryWorkspaceCompareRecommendation {
  return {
    source: 'deterministic',
    decision: 'no_recommendation',
    recommendedCompareRunId: null,
    recommendedTargetLabel: null,
    rationale
  }
}

function buildDeterministicRecommendation(bestRun: MemoryWorkspaceCompareRunRecord): MemoryWorkspaceCompareRecommendation {
  const bestReason = bestRun.evaluation.dimensions
    .slice()
    .sort((left, right) => right.score - left.score)[0]

  return {
    source: 'deterministic',
    decision: 'recommend_run',
    recommendedCompareRunId: bestRun.compareRunId,
    recommendedTargetLabel: bestRun.target.label,
    rationale: `Highest deterministic rubric score (${bestRun.evaluation.totalScore}/${bestRun.evaluation.maxScore}) led by ${bestReason?.label ?? 'overall quality'}${bestRun.target.executionMode === 'local_baseline' ? ', with tie-break preference for the safer baseline' : ''}.`
  }
}

function buildJudgeAssistedRecommendation(
  winner: MemoryWorkspaceCompareRunRecord,
  deterministicWinner: MemoryWorkspaceCompareRunRecord
): MemoryWorkspaceCompareRecommendation {
  return {
    source: 'judge_assisted',
    decision: 'recommend_run',
    recommendedCompareRunId: winner.compareRunId,
    recommendedTargetLabel: winner.target.label,
    rationale: `A judge-assisted override selected ${winner.target.label} after full judge review found it was the only aligned top-scoring run (${winner.judge.score ?? 0}/5), replacing ${deterministicWinner.target.label}.`
  }
}

function resolveJudgeAssistedRecommendation(
  completedRuns: MemoryWorkspaceCompareRunRecord[],
  deterministicWinner: MemoryWorkspaceCompareRunRecord
) {
  if (!completedRuns.some((run) => run.target.executionMode === 'provider_model')) {
    return null
  }

  if (completedRuns.some((run) => run.judge.status !== 'completed')) {
    return null
  }

  const ordered = [...completedRuns].sort(compareRunsForJudgeRecommendation)
  const bestRun = ordered[0]
  const secondRun = ordered[1]
  if (!bestRun) {
    return null
  }

  if (bestRun.target.executionMode !== 'provider_model') {
    return null
  }

  if (bestRun.judge.decision !== 'aligned' || bestRun.evaluation.band === 'failed') {
    return null
  }

  if (deterministicWinner.compareRunId === bestRun.compareRunId) {
    return null
  }

  if (secondRun && judgeMetricsEqual(bestRun, secondRun)) {
    return null
  }

  return buildJudgeAssistedRecommendation(bestRun, deterministicWinner)
}

export function buildRecommendation(runs: MemoryWorkspaceCompareRunRecord[]): MemoryWorkspaceCompareRecommendation | null {
  const completedRuns = runs.filter((run) => run.status === 'completed')
  if (!completedRuns.length) {
    return noRecommendation('No completed compare run is available yet.')
  }

  const ordered = [...completedRuns].sort(compareRunsForRecommendation)
  const bestRun = ordered[0]

  if (!bestRun) {
    return noRecommendation('No completed compare run is available yet.')
  }

  const judgeAssistedRecommendation = resolveJudgeAssistedRecommendation(completedRuns, bestRun)
  if (judgeAssistedRecommendation) {
    return judgeAssistedRecommendation
  }

  return buildDeterministicRecommendation(bestRun)
}

function judgeSnapshotEnabled(run: MemoryWorkspaceCompareRunRecord) {
  return run.judge.status !== 'skipped'
    || run.judge.provider !== null
    || (typeof run.judge.model === 'string' && run.judge.model.trim().length > 0)
}

export function buildCompareSessionMetadata(runs: MemoryWorkspaceCompareRunRecord[]): MemoryWorkspaceCompareSessionMetadata {
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
