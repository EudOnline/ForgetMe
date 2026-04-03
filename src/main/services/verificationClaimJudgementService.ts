import type {
  VerificationAssessmentCoverage,
  VerificationAssessmentRelevance,
  VerificationAssessmentStance,
  VerificationJudgement,
  VerificationReliabilityLabel,
  VerificationSourceAssessment,
  VerificationVerdict
} from '../../shared/contracts/verification'

type VerificationSourceInput = {
  title: string
  url: string
  publishedAt: string | null
  extractedFact: string
  reliabilityLabel: VerificationReliabilityLabel
}

type JudgeVerificationClaimInput = {
  claim: string
  sources: VerificationSourceInput[]
}

const MONTH_PATTERN = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function extractDates(value: string) {
  return Array.from(new Set((normalizeWhitespace(value).match(MONTH_PATTERN) ?? []).map((entry) => entry.toLowerCase())))
}

function coverageRank(coverage: VerificationAssessmentCoverage) {
  switch (coverage) {
    case 'direct':
      return 3
    case 'partial':
      return 2
    default:
      return 1
  }
}

function relevanceRank(relevance: VerificationAssessmentRelevance) {
  switch (relevance) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function reliabilityRank(reliability: VerificationReliabilityLabel) {
  switch (reliability) {
    case 'official':
      return 3
    case 'trusted_media':
      return 2
    default:
      return 1
  }
}

function assessSource(claim: string, source: VerificationSourceInput): VerificationSourceAssessment {
  const claimDates = extractDates(claim)
  const sourceDates = extractDates(source.extractedFact)
  const normalizedFact = normalizeWhitespace(source.extractedFact)

  let stance: VerificationAssessmentStance = 'unclear'
  let relevance: VerificationAssessmentRelevance = 'low'
  let factCoverage: VerificationAssessmentCoverage = 'weak'

  if (claimDates.length > 0) {
    if (sourceDates.some((date) => claimDates.includes(date))) {
      stance = 'supports'
      relevance = 'high'
      factCoverage = 'direct'
    } else if (sourceDates.length > 0) {
      stance = 'contradicts'
      relevance = 'high'
      factCoverage = 'direct'
    } else if (reliabilityRank(source.reliabilityLabel) >= 2 && normalizedFact.length > 24) {
      stance = 'neutral'
      relevance = 'medium'
      factCoverage = 'partial'
    }
  } else if (normalizedFact.length > 0) {
    stance = 'supports'
    relevance = reliabilityRank(source.reliabilityLabel) >= 2 ? 'high' : 'medium'
    factCoverage = normalizedFact.length > 24 ? 'direct' : 'partial'
  }

  return {
    sourceUrl: source.url,
    title: source.title,
    relevance,
    stance,
    factCoverage,
    reliability: source.reliabilityLabel,
    extractedFact: normalizedFact,
    conflictsWithOtherSources: false
  }
}

function attachConflicts(assessments: VerificationSourceAssessment[]) {
  const hasSupports = assessments.some((assessment) => assessment.stance === 'supports')
  const hasContradictions = assessments.some((assessment) => assessment.stance === 'contradicts')

  if (!hasSupports || !hasContradictions) {
    return assessments
  }

  return assessments.map((assessment) => ({
    ...assessment,
    conflictsWithOtherSources: assessment.stance === 'supports' || assessment.stance === 'contradicts'
  }))
}

function summarizeJudgement(input: {
  verdict: VerificationVerdict
  supportCount: number
  contradictionCount: number
}) {
  switch (input.verdict) {
    case 'supported':
      return `Verification found ${input.supportCount} supporting source${input.supportCount === 1 ? '' : 's'} without unresolved contradictions.`
    case 'contradicted':
      return `Verification found ${input.contradictionCount} contradictory source${input.contradictionCount === 1 ? '' : 's'} and no equally strong support.`
    case 'mixed':
      return `Verification found conflicting strong evidence with ${input.supportCount} supporting and ${input.contradictionCount} contradictory source${input.contradictionCount === 1 ? '' : 's'}.`
    case 'insufficient':
    default:
      return 'Verification evidence is still insufficient to support a commit-ready conclusion.'
  }
}

export function judgeVerificationClaim(input: JudgeVerificationClaimInput): VerificationJudgement {
  const assessedSources = attachConflicts(input.sources.map((source) => assessSource(input.claim, source)))
  const supportSources = assessedSources.filter((assessment) => assessment.stance === 'supports')
  const contradictionSources = assessedSources.filter((assessment) => assessment.stance === 'contradicts')
  const highReliabilitySupportSources = supportSources.filter((assessment) => reliabilityRank(assessment.reliability) >= 2)
  const highReliabilityContradictionSources = contradictionSources.filter((assessment) => reliabilityRank(assessment.reliability) >= 2)

  let verdict: VerificationVerdict = 'insufficient'

  if (highReliabilitySupportSources.length > 0 && highReliabilityContradictionSources.length > 0) {
    verdict = 'mixed'
  } else if (highReliabilityContradictionSources.length > 0) {
    verdict = 'contradicted'
  } else if (
    highReliabilitySupportSources.some((assessment) => (
      coverageRank(assessment.factCoverage) >= 2 && relevanceRank(assessment.relevance) >= 2
    ))
  ) {
    verdict = 'supported'
  }

  return {
    verdict,
    claim: input.claim,
    sourceAssessments: assessedSources,
    supportCount: supportSources.length,
    contradictionCount: contradictionSources.length,
    highReliabilitySupportCount: highReliabilitySupportSources.length,
    highReliabilityContradictionCount: highReliabilityContradictionSources.length,
    summary: summarizeJudgement({
      verdict,
      supportCount: supportSources.length,
      contradictionCount: contradictionSources.length
    })
  }
}
