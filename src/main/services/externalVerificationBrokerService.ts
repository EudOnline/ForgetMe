import { judgeVerificationClaim } from './verificationClaimJudgementService'
import type {
  VerificationJudgement,
  VerificationReliabilityLabel
} from '../../shared/contracts/verification'

export type VerificationSearchResult = {
  title: string
  url: string
  snippet?: string | null
  publishedAt: string | null
}

export type VerificationPageSnapshot = {
  url: string
  title: string | null
  publishedAt: string | null
  excerpt: string
}

export type VerificationSource = {
  title: string
  url: string
  publishedAt: string | null
  extractedFact: string
  reliabilityLabel: VerificationReliabilityLabel
}

export type VerifyClaimInput = {
  claim: string
  query: string
  maxResults?: number
}

export type CitationBundle = {
  verdict: VerificationJudgement['verdict']
  claim: string
  sources: VerificationSource[]
  sourceAssessments: VerificationJudgement['sourceAssessments']
  supportCount: number
  contradictionCount: number
  highReliabilitySupportCount: number
  highReliabilityContradictionCount: number
  summary: string
}

export type ExternalVerificationBrokerDependencies = {
  searchWeb: (input: VerifyClaimInput) => Promise<VerificationSearchResult[]>
  openSourcePage: (input: { url: string; claim: string }) => Promise<VerificationPageSnapshot>
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}

function inferReliabilityLabel(url: string) {
  try {
    const { hostname } = new URL(url)
    if (hostname.endsWith('.gov') || hostname.endsWith('.edu') || hostname.includes('official')) {
      return 'official'
    }

    if (hostname.includes('news') || hostname.includes('reuters') || hostname.includes('apnews') || hostname.includes('bbc')) {
      return 'trusted_media'
    }
  } catch {
    // fall through to secondary
  }

  return 'secondary'
}

function reliabilityScore(label: string) {
  switch (label) {
    case 'official':
      return 3
    case 'trusted_media':
      return 2
    default:
      return 1
  }
}

function firstSentence(value: string) {
  const normalized = normalizeWhitespace(value)
  if (!normalized) {
    return ''
  }

  const match = normalized.match(/.+?[.!?](?=\s|$)/)
  return (match?.[0] ?? normalized).trim()
}

function extractFact(input: {
  pageExcerpt: string
  searchSnippet?: string | null
  fallbackTitle?: string | null
}) {
  const fromPage = firstSentence(input.pageExcerpt)
  if (fromPage) {
    return fromPage
  }

  const fromSnippet = firstSentence(input.searchSnippet ?? '')
  if (fromSnippet) {
    return fromSnippet
  }

  return normalizeWhitespace(input.fallbackTitle ?? '') || 'No directly extractable fact found.'
}

function sortSources(sources: VerificationSource[]) {
  return [...sources].sort((left, right) => {
    const byReliability = reliabilityScore(right.reliabilityLabel) - reliabilityScore(left.reliabilityLabel)
    if (byReliability !== 0) {
      return byReliability
    }

    if (left.publishedAt && right.publishedAt && left.publishedAt !== right.publishedAt) {
      return right.publishedAt.localeCompare(left.publishedAt)
    }

    if (!left.publishedAt && right.publishedAt) {
      return 1
    }

    if (left.publishedAt && !right.publishedAt) {
      return -1
    }

    return left.url.localeCompare(right.url)
  })
}

export function createExternalVerificationBrokerService(
  dependencies: ExternalVerificationBrokerDependencies
) {
  const service = {
    async searchClaimSources(input: VerifyClaimInput): Promise<VerificationSearchResult[]> {
      const query = normalizeWhitespace(input.query)
      const rawResults = await dependencies.searchWeb({
        ...input,
        query
      })
      const seen = new Set<string>()
      const deduped: VerificationSearchResult[] = []

      for (const result of rawResults) {
        const normalizedUrl = normalizeUrl(result.url)
        if (!normalizedUrl || seen.has(normalizedUrl)) {
          continue
        }

        seen.add(normalizedUrl)
        deduped.push({
          ...result,
          title: normalizeWhitespace(result.title),
          url: normalizedUrl,
          snippet: normalizeWhitespace(result.snippet ?? ''),
          publishedAt: result.publishedAt ?? null
        })

        if (deduped.length >= (input.maxResults ?? 3)) {
          break
        }
      }

      return deduped
    },

    async openClaimSource(input: {
      claim: string
      candidate: VerificationSearchResult
    }): Promise<VerificationSource> {
      const page = await dependencies.openSourcePage({
        url: input.candidate.url,
        claim: input.claim
      })
      const finalUrl = normalizeUrl(page.url || input.candidate.url)

      return {
        title: normalizeWhitespace(page.title ?? input.candidate.title) || finalUrl,
        url: finalUrl,
        publishedAt: page.publishedAt ?? input.candidate.publishedAt ?? null,
        extractedFact: extractFact({
          pageExcerpt: page.excerpt,
          searchSnippet: input.candidate.snippet,
          fallbackTitle: page.title ?? input.candidate.title
        }),
        reliabilityLabel: inferReliabilityLabel(finalUrl)
      }
    },

    async buildCitationBundle(input: {
      claim: string
      sources: VerificationSource[]
    }): Promise<CitationBundle> {
      const sources = sortSources(input.sources.filter((source) => normalizeWhitespace(source.url).length > 0))

      const judgement = judgeVerificationClaim({
        claim: input.claim,
        sources
      })

      return {
        verdict: judgement.verdict,
        claim: input.claim,
        sources,
        sourceAssessments: judgement.sourceAssessments,
        supportCount: judgement.supportCount,
        contradictionCount: judgement.contradictionCount,
        highReliabilitySupportCount: judgement.highReliabilitySupportCount,
        highReliabilityContradictionCount: judgement.highReliabilityContradictionCount,
        summary: judgement.summary
      }
    },

    async verifyClaim(input: VerifyClaimInput): Promise<CitationBundle> {
      const candidates = await service.searchClaimSources(input)
      const sources = await Promise.all(
        candidates.map((candidate) => service.openClaimSource({
          claim: input.claim,
          candidate
        }))
      )

      return service.buildCitationBundle({
        claim: input.claim,
        sources
      })
    }
  }

  return service
}
