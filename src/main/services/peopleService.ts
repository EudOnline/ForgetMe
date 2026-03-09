import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

export type ParsedFileSummary = {
  fileId: string
  kind: string
  summary: {
    participants?: string[]
    [key: string]: unknown
  }
}

export type PersonAnchor = {
  personId: string
  displayName: string
  sourceType: 'chat_participant'
  confidence: number
  sourceFileId: string
}

export function collectPeopleAnchors(input: { parsedFiles: ParsedFileSummary[] }) {
  return input.parsedFiles
    .filter((file) => file.kind === 'chat')
    .flatMap((file) =>
      (file.summary.participants ?? []).map((displayName) => ({
        personId: crypto.randomUUID(),
        displayName,
        sourceType: 'chat_participant' as const,
        confidence: 0.8,
        sourceFileId: file.fileId
      }))
    )
}

export function persistPeopleAnchors(db: ArchiveDatabase, anchors: PersonAnchor[]) {
  const createdAt = new Date().toISOString()

  for (const anchor of anchors) {
    db.prepare(
      'insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)'
    ).run(anchor.personId, anchor.displayName, anchor.sourceType, anchor.confidence, createdAt)
  }

  return anchors
}
