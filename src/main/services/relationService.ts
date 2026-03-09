import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import type { PersonAnchor } from './peopleService'

function insertRelation(db: ArchiveDatabase, input: {
  sourceId: string
  sourceType: string
  targetId: string
  targetType: string
  relationType: string
  confidence?: number
}) {
  db.prepare(
    `insert into relations (
      id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    input.sourceId,
    input.sourceType,
    input.targetId,
    input.targetType,
    input.relationType,
    input.confidence ?? null,
    new Date().toISOString()
  )
}

export function persistFileBatchRelations(db: ArchiveDatabase, batchId: string, fileIds: string[]) {
  for (const fileId of fileIds) {
    insertRelation(db, {
      sourceId: fileId,
      sourceType: 'file',
      targetId: batchId,
      targetType: 'batch',
      relationType: 'belongs_to_batch',
      confidence: 1
    })
  }
}

export function persistPeopleFileRelations(db: ArchiveDatabase, anchors: PersonAnchor[]) {
  for (const anchor of anchors) {
    insertRelation(db, {
      sourceId: anchor.personId,
      sourceType: 'person',
      targetId: anchor.sourceFileId,
      targetType: 'file',
      relationType: 'mentioned_in_file',
      confidence: anchor.confidence
    })
  }
}
