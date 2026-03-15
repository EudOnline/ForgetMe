import fs from 'node:fs'

export async function parseChatJson(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const payload = JSON.parse(raw) as {
    messages?: Array<{ sender?: string; from?: string; text?: string }>
  }
  const messages = payload.messages ?? []
  const participants = [...new Set(messages.map((message) => message.sender ?? message.from).filter(Boolean))]

  return {
    kind: 'chat' as const,
    summary: {
      messageCount: messages.length,
      participants,
      previewText: messages.slice(0, 3).map((message) => message.text ?? '').join('\n'),
      communicationExcerpts: messages
        .filter((message) => typeof message.text === 'string' && message.text.trim().length > 0)
        .map((message, index) => ({
          ordinal: index + 1,
          speakerDisplayName: message.sender ?? message.from ?? null,
          text: message.text!.trim()
        }))
    }
  }
}
