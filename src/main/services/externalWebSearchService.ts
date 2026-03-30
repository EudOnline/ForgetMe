import type {
  VerificationPageSnapshot,
  VerificationSearchResult,
  VerifyClaimInput
} from './externalVerificationBrokerService'

const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_USER_AGENT = 'ForgetMeExternalVerification/0.1'

type ExternalWebSearchDependencies = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x27;/gi, '\'')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value: string) {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')))
}

function extractMetaContent(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    const value = match?.[1]
    if (value) {
      return stripTags(value)
    }
  }

  return null
}

function extractPublishedAt(html: string) {
  const metaPublished = extractMetaContent(html, [
    /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="pubdate"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="publishdate"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="date"[^>]+content="([^"]+)"/i
  ])
  if (metaPublished) {
    return metaPublished
  }

  const timeMatch = html.match(/<time[^>]+datetime="([^"]+)"/i)
  if (timeMatch?.[1]) {
    return stripTags(timeMatch[1])
  }

  const jsonLdMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/i)
  if (jsonLdMatch?.[1]) {
    return stripTags(jsonLdMatch[1])
  }

  return null
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1] ? stripTags(match[1]) : null
}

function extractExcerpt(html: string) {
  const metaDescription = extractMetaContent(html, [
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i
  ])
  if (metaDescription) {
    return metaDescription
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const paragraphs = Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripTags(match[1] ?? ''))
    .filter((value) => value.length > 40)

  return normalizeWhitespace(paragraphs.slice(0, 2).join(' ')).slice(0, 600)
}

async function fetchText(fetchImpl: typeof fetch, input: {
  url: string
  timeoutMs: number
}) {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const response = await fetchImpl(input.url, {
      headers: {
        'user-agent': DEFAULT_USER_AGENT
      },
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }

    return {
      response,
      text: await response.text()
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export function createExternalWebSearchService(dependencies: ExternalWebSearchDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async searchWeb(input: VerifyClaimInput): Promise<VerificationSearchResult[]> {
      const query = normalizeWhitespace(input.query)
      if (!query) {
        return []
      }

      const { text } = await fetchText(fetchImpl, {
        url: `https://www.bing.com/search?setlang=en&q=${encodeURIComponent(query)}`,
        timeoutMs
      })

      const matches = Array.from(text.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi))
      const results: VerificationSearchResult[] = []

      for (const match of matches) {
        const block = match[0]
        const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        if (!linkMatch?.[1] || !linkMatch[2]) {
          continue
        }

        const snippetMatch = block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
        results.push({
          title: stripTags(linkMatch[2]),
          url: decodeHtmlEntities(linkMatch[1]),
          snippet: snippetMatch?.[1] ? stripTags(snippetMatch[1]) : null,
          publishedAt: null
        })

        if (results.length >= Math.min(input.maxResults ?? 3, 5)) {
          break
        }
      }

      return results
    },

    async openSourcePage(input: { url: string; claim: string }): Promise<VerificationPageSnapshot> {
      const { response, text } = await fetchText(fetchImpl, {
        url: input.url,
        timeoutMs
      })
      const contentType = response.headers.get('content-type') ?? ''
      const excerpt = contentType.includes('text/html')
        ? extractExcerpt(text)
        : normalizeWhitespace(text).slice(0, 600)

      return {
        url: response.url || input.url,
        title: contentType.includes('text/html') ? extractTitle(text) : null,
        publishedAt: contentType.includes('text/html') ? extractPublishedAt(text) : null,
        excerpt
      }
    }
  }
}
