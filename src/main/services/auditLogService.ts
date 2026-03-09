import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

export function writeAuditLog(db: ArchiveDatabase, input: {
  action: string
  entityId: string
  entityType: string
  actor: string
  payload?: unknown
}) {
  db.prepare(
    'insert into audit_logs (id, action, entity_id, entity_type, actor, payload_json, created_at) values (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    input.action,
    input.entityId,
    input.entityType,
    input.actor,
    input.payload ? JSON.stringify(input.payload) : null,
    new Date().toISOString()
  )
}
