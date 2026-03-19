import crypto from 'node:crypto'
import type { DecisionJournalEntry, DecisionJournalSearchResult } from '../../shared/archiveContracts'
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

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readApprovedDraftSendAttemptKind(operationPayload: Record<string, unknown>) {
  if (operationPayload.attemptKind === 'automatic_retry') {
    return 'automatic_retry'
  }

  return operationPayload.attemptKind === 'manual_retry' ? 'manual_retry' : 'initial_send'
}

function readApprovedDraftPublicationKind(operationPayload: Record<string, unknown>) {
  return operationPayload.publicationKind === 'local_share_package'
    ? 'local share package'
    : null
}

function formatDecisionLabel(entry: Pick<DecisionJournalEntry, 'decisionType' | 'targetType' | 'operationPayload'>) {
  if (entry.targetType === 'decision_batch' && entry.decisionType === 'approve_safe_review_group') {
    return 'Safe batch approve'
  }

  if (entry.decisionType === 'mark_persona_draft_in_review') {
    return 'Persona draft marked in review'
  }

  if (entry.decisionType === 'approve_persona_draft_review') {
    return 'Persona draft approved'
  }

  if (entry.decisionType === 'reject_persona_draft_review') {
    return 'Persona draft rejected'
  }

  if (entry.decisionType === 'export_approved_persona_draft') {
    return 'Approved draft exported'
  }

  if (entry.decisionType === 'publish_approved_persona_draft') {
    return 'Approved draft published for sharing'
  }

  if (entry.decisionType === 'send_approved_persona_draft_to_provider') {
    const attemptKind = readApprovedDraftSendAttemptKind(entry.operationPayload)
    if (attemptKind === 'automatic_retry') {
      return 'Approved draft auto-retried to provider'
    }

    return attemptKind === 'manual_retry'
      ? 'Approved draft resent to provider'
      : 'Approved draft sent to provider'
  }

  if (entry.decisionType === 'send_approved_persona_draft_to_provider_failed') {
    const attemptKind = readApprovedDraftSendAttemptKind(entry.operationPayload)
    if (attemptKind === 'automatic_retry') {
      return 'Approved draft auto-retry failed'
    }

    return attemptKind === 'manual_retry'
      ? 'Approved draft resend failed'
      : 'Approved draft send failed'
  }

  if (entry.decisionType === 'create_approved_persona_draft_share_link') {
    return 'Hosted share link created'
  }

  if (entry.decisionType === 'revoke_approved_persona_draft_share_link') {
    return 'Hosted share link revoked'
  }

  return entry.decisionType
}

function formatTargetLabel(entry: Pick<DecisionJournalEntry, 'targetType' | 'operationPayload'>) {
  if (entry.targetType === 'persona_draft_review') {
    if (
      entry.operationPayload.shareUrl
      && (entry.operationPayload as Record<string, unknown>).shareUrl
      && (entry.operationPayload as Record<string, unknown>).sourceTurnId
    ) {
      const sourceTurnId = readString(entry.operationPayload.sourceTurnId)
      const shareUrl = readString(entry.operationPayload.shareUrl)
      const hostLabel = readString(entry.operationPayload.hostLabel)
      const summaryParts = ['Persona draft review', sourceTurnId, hostLabel ?? shareUrl].filter((value): value is string => Boolean(value))
      return summaryParts.join(' · ')
    }

    const sourceTurnId = readString(entry.operationPayload.sourceTurnId)
    const destinationLabel = readString(entry.operationPayload.destinationLabel)
    const provider = readString(entry.operationPayload.provider)
    const publicationKind = readApprovedDraftPublicationKind(entry.operationPayload)
    const summaryParts = ['Persona draft review', sourceTurnId, destinationLabel ?? provider ?? publicationKind]
      .filter((value): value is string => Boolean(value))

    return summaryParts.join(' · ')
  }

  if (entry.targetType !== 'decision_batch') {
    return entry.targetType
  }

  const personName = readString(entry.operationPayload.canonicalPersonName)
  const fieldKey = readString(entry.operationPayload.fieldKey)
  const itemCount = readPositiveNumber(entry.operationPayload.itemCount)
  const summaryParts = [
    personName,
    fieldKey,
    itemCount ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null
  ].filter((value): value is string => Boolean(value))

  if (summaryParts.length > 0) {
    return summaryParts.join(' · ')
  }

  return 'Decision batch'
}

function buildReplaySummary(entry: Pick<DecisionJournalEntry, 'decisionType' | 'targetType' | 'operationPayload'>) {
  return `${formatDecisionLabel(entry)} · ${formatTargetLabel(entry)}`
}

function buildSearchHaystack(entry: DecisionJournalEntry) {
  return [
    entry.id,
    entry.decisionType,
    entry.targetType,
    entry.targetId,
    entry.actor,
    entry.decisionLabel,
    entry.targetLabel,
    entry.replaySummary,
    JSON.stringify(entry.operationPayload),
    JSON.stringify(entry.undoPayload)
  ].join(' ').toLowerCase()
}

export function listDecisionJournal(db: ArchiveDatabase, input?: {
  query?: string
  decisionType?: string
  targetType?: string
}) {
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

  const entries = rows.map((row) => {
    const baseEntry: DecisionJournalEntry = {
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
    }
    const decisionLabel = formatDecisionLabel(baseEntry)
    const targetLabel = formatTargetLabel(baseEntry)

    return {
      ...baseEntry,
      decisionLabel,
      targetLabel,
      replaySummary: `${decisionLabel} · ${targetLabel}`
    }
  })

  return entries.filter((entry) => {
    if (input?.decisionType && entry.decisionType !== input.decisionType) {
      return false
    }
    if (input?.targetType && entry.targetType !== input.targetType) {
      return false
    }
    if (input?.query && !buildSearchHaystack(entry).includes(input.query.toLowerCase())) {
      return false
    }
    return true
  })
}

export function searchDecisionJournal(db: ArchiveDatabase, input?: {
  query?: string
  decisionType?: string
  targetType?: string
}) {
  return listDecisionJournal(db, input).map((entry): DecisionJournalSearchResult => ({
    journalId: entry.id,
    decisionType: entry.decisionType,
    targetType: entry.targetType,
    decisionLabel: entry.decisionLabel ?? formatDecisionLabel(entry),
    targetLabel: entry.targetLabel ?? formatTargetLabel(entry),
    replaySummary: entry.replaySummary ?? buildReplaySummary(entry),
    actor: entry.actor,
    createdAt: entry.createdAt,
    undoneAt: entry.undoneAt
  }))
}
