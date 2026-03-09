import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'

function parsePdfSummary(filePath: string) {
  const rawBuffer = fs.readFileSync(filePath)
  const rawText = rawBuffer.toString('latin1')
  const pageMarkers = rawText.match(/\/Type\s*\/Page\b/g) ?? []
  const literalText = [...rawText.matchAll(/\(([^()]*)\)/g)].map((match) => match[1]).join(' ')

  return {
    kind: 'document' as const,
    summary: {
      pageCount: Math.max(pageMarkers.length, 1),
      previewText: literalText.slice(0, 500)
    }
  }
}

export async function parseDocument(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.pdf') {
    return parsePdfSummary(filePath)
  }

  if (extension === '.docx') {
    const data = await mammoth.extractRawText({ path: filePath })
    return {
      kind: 'document' as const,
      summary: {
        pageCount: 1,
        previewText: data.value.slice(0, 500)
      }
    }
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  return {
    kind: 'document' as const,
    summary: {
      pageCount: 1,
      previewText: raw.slice(0, 500)
    }
  }
}
