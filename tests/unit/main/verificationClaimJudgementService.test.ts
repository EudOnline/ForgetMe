import { describe, expect, it } from 'vitest'
import { judgeVerificationClaim } from '../../../src/main/services/verificationClaimJudgementService'

describe('verificationClaimJudgementService', () => {
  it('marks an official directly supporting source as supported', () => {
    const result = judgeVerificationClaim({
      claim: 'The official source confirms the announcement date.',
      sources: [
        {
          title: 'Official announcement record',
          url: 'https://records.example.gov/releases/announcement',
          publishedAt: '2026-03-30T00:00:00.000Z',
          extractedFact: 'The announcement date is March 30, 2026.',
          reliabilityLabel: 'official'
        }
      ]
    })

    expect(result.verdict).toBe('supported')
    expect(result.sourceAssessments[0]).toEqual(expect.objectContaining({
      sourceUrl: 'https://records.example.gov/releases/announcement',
      stance: 'supports',
      relevance: 'high',
      factCoverage: 'direct'
    }))
  })

  it('marks an official directly contradicting source as contradicted', () => {
    const result = judgeVerificationClaim({
      claim: 'The official source confirms the announcement date is March 30, 2026.',
      sources: [
        {
          title: 'Official correction record',
          url: 'https://records.example.gov/releases/correction',
          publishedAt: '2026-03-31T00:00:00.000Z',
          extractedFact: 'The official record corrects the announcement date to April 2, 2026.',
          reliabilityLabel: 'official'
        }
      ]
    })

    expect(result.verdict).toBe('contradicted')
    expect(result.sourceAssessments[0]).toEqual(expect.objectContaining({
      sourceUrl: 'https://records.example.gov/releases/correction',
      stance: 'contradicts',
      relevance: 'high',
      factCoverage: 'direct'
    }))
  })

  it('marks similarly strong conflicting sources as mixed instead of supported', () => {
    const result = judgeVerificationClaim({
      claim: 'The official source confirms the announcement date is March 30, 2026.',
      sources: [
        {
          title: 'Official announcement record',
          url: 'https://records.example.gov/releases/announcement',
          publishedAt: '2026-03-30T00:00:00.000Z',
          extractedFact: 'The announcement date is March 30, 2026.',
          reliabilityLabel: 'official'
        },
        {
          title: 'Official correction record',
          url: 'https://records.example.gov/releases/correction',
          publishedAt: '2026-03-31T00:00:00.000Z',
          extractedFact: 'The official record corrects the announcement date to April 2, 2026.',
          reliabilityLabel: 'official'
        }
      ]
    })

    expect(result.verdict).toBe('mixed')
    expect(result.sourceAssessments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUrl: 'https://records.example.gov/releases/announcement',
        conflictsWithOtherSources: true
      }),
      expect.objectContaining({
        sourceUrl: 'https://records.example.gov/releases/correction',
        conflictsWithOtherSources: true
      })
    ]))
  })

  it('marks weak secondary evidence as insufficient', () => {
    const result = judgeVerificationClaim({
      claim: 'The official source confirms the announcement date is March 30, 2026.',
      sources: [
        {
          title: 'Forum repost',
          url: 'https://forum.example.net/thread/announcement',
          publishedAt: null,
          extractedFact: 'People in the thread think the announcement happened around late March.',
          reliabilityLabel: 'secondary'
        }
      ]
    })

    expect(result.verdict).toBe('insufficient')
    expect(result.sourceAssessments[0]).toEqual(expect.objectContaining({
      sourceUrl: 'https://forum.example.net/thread/announcement',
      relevance: 'low'
    }))
  })
})
