import path from 'node:path'
import type { AppPaths } from './appPaths'
import { writeAuditLog } from './auditLogService'
import { openDatabase, runMigrations } from './db'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export async function logicalDeleteBatch(input: {
  appPaths: AppPaths
  batchId: string
  actor: string
}) {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)
  const deletedAt = new Date().toISOString()

  db.prepare('update import_batches set status = ?, deleted_at = ? where id = ?').run('deleted', deletedAt, input.batchId)
  db.prepare('update vault_files set deleted_at = ? where batch_id = ?').run(deletedAt, input.batchId)
  writeAuditLog(db, {
    action: 'delete.logical',
    entityId: input.batchId,
    entityType: 'batch',
    actor: input.actor,
    payload: { deletedAt }
  })

  db.close()

  return {
    status: 'deleted' as const,
    batchId: input.batchId,
    deletedAt
  }
}

export async function previewExportBatch(input: {
  appPaths: AppPaths
  batchId: string
  actor: string
}) {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)
  writeAuditLog(db, {
    action: 'export.preview',
    entityId: input.batchId,
    entityType: 'batch',
    actor: input.actor
  })
  db.close()

  return { status: 'previewed' as const, batchId: input.batchId }
}
