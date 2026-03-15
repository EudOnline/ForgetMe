import fs from 'node:fs'

export async function parseTextChat(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  return {
    kind: 'chat' as const,
    summary: {
      messageCount: lines.length,
      participants: [],
      previewText: lines.slice(0, 5).join('\n'),
      communicationExcerpts: lines.map((line, index) => ({
        ordinal: index + 1,
        speakerDisplayName: null,
        text: line
      }))
    }
  }
}
