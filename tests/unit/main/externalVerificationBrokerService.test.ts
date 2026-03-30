import { describe, expect, it } from 'vitest'
import { createExternalVerificationBrokerService } from '../../../src/main/services/externalVerificationBrokerService'

describe('externalVerificationBrokerService', () => {
  it('returns normalized citation bundles from verification sources', async () => {
    const broker = createExternalVerificationBrokerService({
      searchWeb: async () => [
        {
          title: 'Example announcement',
          url: 'https://example.com',
          publishedAt: '2026-03-30T00:00:00.000Z',
          extractedFact: 'The announcement date is March 30, 2026.',
          reliabilityLabel: 'official'
        }
      ]
    })

    const citationBundle = await broker.verifyClaim({
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    })

    expect(citationBundle.verdict).toBe('supported')
    expect(citationBundle.sources[0]?.url).toBe('https://example.com')
    expect(citationBundle.sources[0]?.reliabilityLabel).toBe('official')
  })
})
