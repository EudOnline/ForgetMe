function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildApprovedDraftPublicationHtmlDocument(input: {
  title: string
  question: string
  approvedDraft: string
  publishedAt: string
}) {
  const title = escapeHtml(input.title)
  const question = escapeHtml(input.question)
  const approvedDraft = escapeHtml(input.approvedDraft)
  const publishedAt = escapeHtml(input.publishedAt)

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <header>
        <h1>${title}</h1>
        <p>Approved draft publication package</p>
      </header>
      <section aria-label="Question">
        <h2>Question</h2>
        <p>${question}</p>
      </section>
      <section aria-label="Approved Draft">
        <h2>Approved Draft</h2>
        <pre>${approvedDraft}</pre>
      </section>
      <section aria-label="Publication Metadata">
        <h2>Publication Metadata</h2>
        <p>Published at <time datetime="${publishedAt}">${publishedAt}</time></p>
        <p><a href="./publication.json">Open publication.json</a></p>
      </section>
      <footer>
        <p>This share page was derived from an approved ForgetMe publication package.</p>
      </footer>
    </main>
  </body>
</html>
`
}

export function approvedDraftPublicationStylesheet() {
  return `:root {
  color-scheme: light;
  --page-bg: #f7f8fc;
  --card-bg: #ffffff;
  --text-main: #1c2030;
  --text-muted: #4c536f;
  --border-soft: #d9ddee;
  --accent: #1b5cff;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: linear-gradient(180deg, #eef2ff 0%, var(--page-bg) 32%);
  color: var(--text-main);
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
  line-height: 1.6;
}

main {
  width: min(860px, 100%);
  margin: 0 auto;
  padding: 40px 20px 64px;
}

header,
section,
footer {
  background: var(--card-bg);
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  padding: 18px 20px;
  margin-bottom: 14px;
}

h1,
h2 {
  margin: 0 0 10px;
}

h1 {
  font-size: 1.7rem;
}

h2 {
  font-size: 1.1rem;
}

p {
  margin: 0;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "Menlo", "Monaco", "Consolas", monospace;
  font-size: 0.94rem;
}

a {
  color: var(--accent);
}
`
}
