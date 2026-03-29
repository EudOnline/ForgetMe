import path from 'node:path'
import { parseChatJson } from './parsers/chatJsonParser'
import { parseTextChat } from './parsers/textChatParser'
import { parseImage } from './parsers/imageParser'
import { parseDocument } from './parsers/documentParser'
import {
  isSupportedImportExtension,
  SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS,
  SUPPORTED_IMAGE_IMPORT_EXTENSIONS
} from '../../shared/archiveTypes'

export async function parseFrozenFile(filePath: string, options?: { preferredKind?: 'chat' | 'document' }) {
  const extension = path.extname(filePath).toLowerCase()
  if (!isSupportedImportExtension(extension)) {
    throw new Error(`Unsupported file type: ${extension}`)
  }

  if (extension === '.json') {
    return parseChatJson(filePath)
  }

  if (extension === '.txt' && options?.preferredKind !== 'document') {
    return parseTextChat(filePath)
  }

  if (SUPPORTED_IMAGE_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMAGE_IMPORT_EXTENSIONS)[number])) {
    return parseImage(filePath)
  }

  if (SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS)[number])) {
    return parseDocument(filePath)
  }

  throw new Error(`Unsupported file type: ${extension}`)
}
