export type VerificationVerdict =
  | 'supported'
  | 'contradicted'
  | 'mixed'
  | 'insufficient'

export type VerificationAssessmentRelevance =
  | 'high'
  | 'medium'
  | 'low'

export type VerificationAssessmentStance =
  | 'supports'
  | 'contradicts'
  | 'neutral'
  | 'unclear'

export type VerificationAssessmentCoverage =
  | 'direct'
  | 'partial'
  | 'weak'

export type VerificationReliabilityLabel =
  | 'official'
  | 'trusted_media'
  | 'secondary'

export type VerificationSourceAssessment = {
  sourceUrl: string
  title: string
  relevance: VerificationAssessmentRelevance
  stance: VerificationAssessmentStance
  factCoverage: VerificationAssessmentCoverage
  reliability: VerificationReliabilityLabel
  extractedFact: string
  conflictsWithOtherSources: boolean
}

export type VerificationJudgement = {
  verdict: VerificationVerdict
  claim: string
  sourceAssessments: VerificationSourceAssessment[]
  supportCount: number
  contradictionCount: number
  highReliabilitySupportCount: number
  highReliabilityContradictionCount: number
  summary: string
}
