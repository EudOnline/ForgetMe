import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

export function appendDecisionJournal(db: ArchiveDatabase, input: {
  decisionType: string
  targetType: string
  targetId: string
  operationPayload: Record<string, unknown>
  undoPayload: Record<string, unknown>
  actor: string
}) {
  const journalId = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare(
    `insert into decision_journal (
      id, decision_type, target_type, target_id,
      operation_payload_json, undo_payload_json, actor, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    journalId,
    input.decisionType,
    input.targetType,
    input.targetId,
    JSON.stringify(input.operationPayload),
    JSON.stringify(input.undoPayload),
    input.actor,
    createdAt
  )

  return { journalId, createdAt }
}

export function markDecisionUndone(db: ArchiveDatabase, input: { journalId: string; actor: string }) {
  const undoneAt = new Date().toISOString()
  db.prepare('update decision_journal set undone_at = ?, undone_by = ? where id = ?').run(undoneAt, input.actor, input.journalId)
  return { journalId: input.journalId, undoneAt }
}

export function listDecisionJournal(db: ArchiveDatabase) {
  const rows = db.prepare(
    `select
      id,
      decision_type as decisionType,
      target_type as targetType,
      target_id as targetId,
      operation_payload_json as operationPayloadJson,
      undo_payload_json as undoPayloadJson,
      actor,
      created_at as createdAt,
      undone_at as undoneAt,
      undone_by as undoneBy
    from decision_journal
    order by created_at desc`
  ).all() as Array<{
    id: string
    decisionType: string
    targetType: string
    targetId: string
    operationPayloadJson: string
    undoPayloadJson: string
    actor: string
    createdAt: string
    undoneAt: string | null
    undoneBy: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    decisionType: row.decisionType,
    targetType: row.targetType,
    targetId: row.targetId,
    operationPayload: JSON.parse(row.operationPayloadJson),
    undoPayload: JSON.parse(row.undoPayloadJson),
    actor: row.actor,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
    undoneBy: row.undoneBy
  }))
}
