import path from 'node:path'
import { parseChatJson } from './parsers/chatJsonParser'
import { parseTextChat } from './parsers/textChatParser'
import { parseImage } from './parsers/imageParser'
import { parseDocument } from './parsers/documentParser'

export async function parseFrozenFile(filePath: string, options?: { preferredKind?: 'chat' | 'document' }) {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.json') {
    return parseChatJson(filePath)
  }

  if (extension === '.txt' && options?.preferredKind !== 'document') {
    return parseTextChat(filePath)
  }

  if (['.jpg', '.jpeg', '.png', '.heic'].includes(extension)) {
    return parseImage(filePath)
  }

  if (['.pdf', '.docx', '.txt'].includes(extension)) {
    return parseDocument(filePath)
  }

  throw new Error(`Unsupported file type: ${extension}`)
}
