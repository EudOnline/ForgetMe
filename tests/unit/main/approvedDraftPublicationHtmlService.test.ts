import { describe, expect, it } from 'vitest'
import { buildApprovedDraftPublicationHtmlDocument } from '../../../src/main/services/approvedDraftPublicationHtmlService'

describe('approvedDraftPublicationHtmlService', () => {
  it('renders a static escaped publication page with local links', () => {
    const html = buildApprovedDraftPublicationHtmlDocument({
      title: 'Alice & Bob <Draft>',
      question: 'Should we keep <records> & "notes"?',
      approvedDraft: `First line\n<script>alert("xss")</script>\nSecond line`,
      publishedAt: '2026-03-19T05:00:00.000Z'
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Alice &amp; Bob &lt;Draft&gt;</title>')
    expect(html).toContain('Should we keep &lt;records&gt; &amp; &quot;notes&quot;?')
    expect(html).toContain('First line')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(html).toContain('Second line')
    expect(html).toContain('2026-03-19T05:00:00.000Z')
    expect(html).toContain('href="./styles.css"')
    expect(html).toContain('href="./publication.json"')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('reviewNotes')
    expect(html).not.toContain('supportingExcerptIds')
    expect(html).not.toContain('trace')
    expect(html.toLowerCase()).not.toContain('<script src=')
  })
})
