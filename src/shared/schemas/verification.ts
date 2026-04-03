import { z } from 'zod'

export const verificationVerdictSchema = z.enum([
  'supported',
  'contradicted',
  'mixed',
  'insufficient'
])

export const verificationSourceAssessmentSchema = z.object({
  sourceUrl: z.string().min(1),
  title: z.string().min(1),
  relevance: z.enum(['high', 'medium', 'low']),
  stance: z.enum(['supports', 'contradicts', 'neutral', 'unclear']),
  factCoverage: z.enum(['direct', 'partial', 'weak']),
  reliability: z.enum(['official', 'trusted_media', 'secondary']),
  extractedFact: z.string(),
  conflictsWithOtherSources: z.boolean()
})

export const verificationJudgementSchema = z.object({
  verdict: verificationVerdictSchema,
  claim: z.string().min(1),
  sourceAssessments: z.array(verificationSourceAssessmentSchema),
  supportCount: z.number().int().min(0),
  contradictionCount: z.number().int().min(0),
  highReliabilitySupportCount: z.number().int().min(0),
  highReliabilityContradictionCount: z.number().int().min(0),
  summary: z.string().min(1)
})
