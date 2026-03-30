export type VerificationSource = {
  title: string
  url: string
  publishedAt: string | null
  extractedFact: string
  reliabilityLabel: string
}

export type VerifyClaimInput = {
  claim: string
  query: string
}

export type CitationBundle = {
  verdict: 'supported' | 'not_supported'
  claim: string
  sources: VerificationSource[]
}

export type ExternalVerificationBrokerDependencies = {
  searchWeb: (input: VerifyClaimInput) => Promise<VerificationSource[]>
}

export function createExternalVerificationBrokerService(
  dependencies: ExternalVerificationBrokerDependencies
) {
  return {
    async verifyClaim(input: VerifyClaimInput): Promise<CitationBundle> {
      const sources = await dependencies.searchWeb(input)

      return {
        verdict: sources.length > 0 ? 'supported' : 'not_supported',
        claim: input.claim,
        sources
      }
    }
  }
}
