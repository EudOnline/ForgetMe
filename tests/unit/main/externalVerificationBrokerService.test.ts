import { describe, expect, it, vi } from 'vitest'
import { createExternalVerificationBrokerService } from '../../../src/main/services/externalVerificationBrokerService'

describe('externalVerificationBrokerService', () => {
  it('deduplicates search results, opens source pages, and emits normalized citation bundles', async () => {
    const openSourcePage = vi.fn().mockImplementation(async ({ url }: { url: string }) => {
      if (url === 'https://records.example.gov/releases/announcement') {
        return {
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The announcement date is March 30, 2026. The official record was published by the agency.'
        }
      }

      return {
        url,
        title: 'Mirror coverage',
        publishedAt: null,
        excerpt: 'A repost says the announcement happened on March 30, 2026.'
      }
    })

    const broker = createExternalVerificationBrokerService({
      searchWeb: async () => [
        {
          title: 'Official announcement result',
          url: 'https://records.example.gov/releases/announcement',
          snippet: 'The official record lists an announcement date of March 30, 2026.',
          publishedAt: null
        },
        {
          title: 'Duplicate official result',
          url: 'https://records.example.gov/releases/announcement',
          snippet: 'Same URL should be deduplicated before page open.',
          publishedAt: null
        },
        {
          title: 'Mirror report',
          url: 'https://mirror.example.net/report',
          snippet: 'A repost repeats the March 30, 2026 date.',
          publishedAt: null
        }
      ],
      openSourcePage
    })

    const citationBundle = await broker.verifyClaim({
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    })

    expect(openSourcePage).toHaveBeenCalledTimes(2)
    expect(citationBundle.verdict).toBe('supported')
    expect(citationBundle.sources[0]).toMatchObject({
      title: 'Official announcement record',
      url: 'https://records.example.gov/releases/announcement',
          publishedAt: '2026-03-30T00:00:00.000Z',
          extractedFact: 'The announcement date is March 30, 2026.',
          reliabilityLabel: 'official'
    })
    expect(citationBundle.sources).toHaveLength(2)
  })
})
