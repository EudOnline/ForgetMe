import crypto from 'node:crypto'
import type {
  CreatePersonaDraftReviewFromTurnInput,
  GetPersonaDraftReviewByTurnInput,
  MemoryWorkspacePersonaDraftReviewRecord,
  MemoryWorkspacePersonaDraftReviewStatus,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  TransitionPersonaDraftReviewInput,
  UpdatePersonaDraftReviewInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal } from './journalService'

const LOCAL_ACTOR = 'local-user'

type PersonaDraftReviewRow = {
  id: string
  sourceTurnId: string
  scopeKind: MemoryWorkspaceScope['kind']
  scopeTargetId: string | null
  workflowKind: 'persona_draft_sandbox'
  status: MemoryWorkspacePersonaDraftReviewStatus
  baseDraft: string
  editedDraft: string
  reviewNotes: string
  supportingExcerptsJson: string
  traceJson: string
  approvedJournalId: string | null
  rejectedJournalId: string | null
  createdAt: string
  updatedAt: string
}

type MemoryWorkspaceTurnRow = {
  id: string
  responseJson: string
}

function inTransaction<T>(db: ArchiveDatabase, callback: () => T) {
  db.exec('begin immediate')
  try {
    const result = callback()
    db.exec('commit')
    return result
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

function scopeTargetId(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return scope.canonicalPersonId
  }

  if (scope.kind === 'group') {
    return scope.anchorPersonId
  }

  return null
}

function parseScope(row: Pick<PersonaDraftReviewRow, 'scopeKind' | 'scopeTargetId'>): MemoryWorkspaceScope {
  if (row.scopeKind === 'person') {
    return {
      kind: 'person',
      canonicalPersonId: row.scopeTargetId ?? ''
    }
  }

  if (row.scopeKind === 'group') {
    return {
      kind: 'group',
      anchorPersonId: row.scopeTargetId ?? ''
    }
  }

  return {
    kind: 'global'
  }
}

function mapReviewRow(row: PersonaDraftReviewRow): MemoryWorkspacePersonaDraftReviewRecord {
  return {
    draftReviewId: row.id,
    sourceTurnId: row.sourceTurnId,
    scope: parseScope(row),
    workflowKind: row.workflowKind,
    status: row.status,
    baseDraft: row.baseDraft,
    editedDraft: row.editedDraft,
    reviewNotes: row.reviewNotes,
    supportingExcerpts: JSON.parse(row.supportingExcerptsJson) as string[],
    trace: JSON.parse(row.traceJson) as MemoryWorkspaceResponse['personaDraft']['trace'],
    approvedJournalId: row.approvedJournalId,
    rejectedJournalId: row.rejectedJournalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function getReviewRowByTurn(db: ArchiveDatabase, turnId: string) {
  return db.prepare(
    `select
      id,
      source_turn_id as sourceTurnId,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      workflow_kind as workflowKind,
      status,
      base_draft as baseDraft,
      edited_draft as editedDraft,
      review_notes as reviewNotes,
      supporting_excerpts_json as supportingExcerptsJson,
      trace_json as traceJson,
      approved_journal_id as approvedJournalId,
      rejected_journal_id as rejectedJournalId,
      created_at as createdAt,
      updated_at as updatedAt
     from persona_draft_reviews
     where source_turn_id = ?`
  ).get(turnId) as PersonaDraftReviewRow | undefined
}

function getReviewRowById(db: ArchiveDatabase, draftReviewId: string) {
  return db.prepare(
    `select
      id,
      source_turn_id as sourceTurnId,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      workflow_kind as workflowKind,
      status,
      base_draft as baseDraft,
      edited_draft as editedDraft,
      review_notes as reviewNotes,
      supporting_excerpts_json as supportingExcerptsJson,
      trace_json as traceJson,
      approved_journal_id as approvedJournalId,
      rejected_journal_id as rejectedJournalId,
      created_at as createdAt,
      updated_at as updatedAt
     from persona_draft_reviews
     where id = ?`
  ).get(draftReviewId) as PersonaDraftReviewRow | undefined
}

function getTurnRow(db: ArchiveDatabase, turnId: string) {
  return db.prepare(
    `select
      id,
      response_json as responseJson
     from memory_workspace_turns
     where id = ?`
  ).get(turnId) as MemoryWorkspaceTurnRow | undefined
}

function isEditableStatus(status: MemoryWorkspacePersonaDraftReviewStatus) {
  return status === 'draft' || status === 'in_review'
}

function canTransition(
  currentStatus: MemoryWorkspacePersonaDraftReviewStatus,
  nextStatus: MemoryWorkspacePersonaDraftReviewStatus
) {
  if (currentStatus === nextStatus) {
    return true
  }

  const allowedTransitions: Record<MemoryWorkspacePersonaDraftReviewStatus, MemoryWorkspacePersonaDraftReviewStatus[]> = {
    draft: ['in_review', 'approved', 'rejected'],
    in_review: ['approved', 'rejected'],
    approved: [],
    rejected: []
  }

  return allowedTransitions[currentStatus].includes(nextStatus)
}

export function getPersonaDraftReviewByTurn(
  db: ArchiveDatabase,
  input: GetPersonaDraftReviewByTurnInput
) {
  const row = getReviewRowByTurn(db, input.turnId)
  return row ? mapReviewRow(row) : null
}

export function createPersonaDraftReviewFromTurn(
  db: ArchiveDatabase,
  input: CreatePersonaDraftReviewFromTurnInput
) {
  return inTransaction(db, () => {
    const existing = getReviewRowByTurn(db, input.turnId)
    if (existing) {
      return mapReviewRow(existing)
    }

    const turn = getTurnRow(db, input.turnId)
    if (!turn) {
      return null
    }

    const response = JSON.parse(turn.responseJson) as MemoryWorkspaceResponse
    if (response.workflowKind !== 'persona_draft_sandbox' || !response.personaDraft) {
      return null
    }

    const createdAt = new Date().toISOString()
    const draftReviewId = crypto.randomUUID()

    db.prepare(
      `insert into persona_draft_reviews (
        id,
        source_turn_id,
        scope_kind,
        scope_target_id,
        workflow_kind,
        status,
        base_draft,
        edited_draft,
        review_notes,
        supporting_excerpts_json,
        trace_json,
        approved_journal_id,
        rejected_journal_id,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      draftReviewId,
      input.turnId,
      response.scope.kind,
      scopeTargetId(response.scope),
      'persona_draft_sandbox',
      'draft',
      response.personaDraft.draft,
      response.personaDraft.draft,
      '',
      JSON.stringify(response.personaDraft.supportingExcerpts),
      JSON.stringify(response.personaDraft.trace),
      null,
      null,
      createdAt,
      createdAt
    )

    const review = getReviewRowById(db, draftReviewId)
    return review ? mapReviewRow(review) : null
  })
}

export function updatePersonaDraftReview(
  db: ArchiveDatabase,
  input: UpdatePersonaDraftReviewInput
) {
  return inTransaction(db, () => {
    const existing = getReviewRowById(db, input.draftReviewId)
    if (!existing || !isEditableStatus(existing.status)) {
      return null
    }

    const updatedAt = new Date().toISOString()
    db.prepare(
      `update persona_draft_reviews
       set edited_draft = ?, review_notes = ?, updated_at = ?
       where id = ?`
    ).run(
      input.editedDraft ?? existing.editedDraft,
      input.reviewNotes ?? existing.reviewNotes,
      updatedAt,
      input.draftReviewId
    )

    const review = getReviewRowById(db, input.draftReviewId)
    return review ? mapReviewRow(review) : null
  })
}

export function transitionPersonaDraftReview(
  db: ArchiveDatabase,
  input: TransitionPersonaDraftReviewInput
) {
  return inTransaction(db, () => {
    const existing = getReviewRowById(db, input.draftReviewId)
    if (!existing || !canTransition(existing.status, input.status)) {
      return null
    }

    if (existing.status === input.status) {
      return mapReviewRow(existing)
    }

    const updatedAt = new Date().toISOString()
    let approvedJournalId = existing.approvedJournalId
    let rejectedJournalId = existing.rejectedJournalId

    if (input.status === 'in_review') {
      appendDecisionJournal(db, {
        decisionType: 'mark_persona_draft_in_review',
        targetType: 'persona_draft_review',
        targetId: existing.id,
        operationPayload: {
          sourceTurnId: existing.sourceTurnId,
          fromStatus: existing.status,
          toStatus: input.status
        },
        undoPayload: {
          draftReviewId: existing.id,
          fromStatus: existing.status
        },
        actor: LOCAL_ACTOR
      })
    }

    if (input.status === 'approved') {
      const journal = appendDecisionJournal(db, {
        decisionType: 'approve_persona_draft_review',
        targetType: 'persona_draft_review',
        targetId: existing.id,
        operationPayload: {
          sourceTurnId: existing.sourceTurnId,
          fromStatus: existing.status,
          toStatus: input.status
        },
        undoPayload: {
          draftReviewId: existing.id,
          fromStatus: existing.status
        },
        actor: LOCAL_ACTOR
      })
      approvedJournalId = journal.journalId
    }

    if (input.status === 'rejected') {
      const journal = appendDecisionJournal(db, {
        decisionType: 'reject_persona_draft_review',
        targetType: 'persona_draft_review',
        targetId: existing.id,
        operationPayload: {
          sourceTurnId: existing.sourceTurnId,
          fromStatus: existing.status,
          toStatus: input.status
        },
        undoPayload: {
          draftReviewId: existing.id,
          fromStatus: existing.status
        },
        actor: LOCAL_ACTOR
      })
      rejectedJournalId = journal.journalId
    }

    db.prepare(
      `update persona_draft_reviews
       set status = ?, approved_journal_id = ?, rejected_journal_id = ?, updated_at = ?
       where id = ?`
    ).run(
      input.status,
      approvedJournalId,
      rejectedJournalId,
      updatedAt,
      existing.id
    )

    const review = getReviewRowById(db, input.draftReviewId)
    return review ? mapReviewRow(review) : null
  })
}
