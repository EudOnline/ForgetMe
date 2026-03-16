import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ApprovedPersonaDraftHandoffArtifact,
  ApprovedPersonaDraftHandoffRecord,
  ExportApprovedPersonaDraftInput,
  ExportApprovedPersonaDraftResult,
  ListApprovedPersonaDraftHandoffsInput,
  MemoryWorkspacePersonaDraftReviewRecord,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, listDecisionJournal } from './journalService'

const LOCAL_ACTOR = 'local-user'

type PersonaDraftReviewRow = {
  id: string
  sourceTurnId: string
  scopeKind: MemoryWorkspaceScope['kind']
  scopeTargetId: string | null
  workflowKind: 'persona_draft_sandbox'
  status: MemoryWorkspacePersonaDraftReviewRecord['status']
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
  question: string
  responseJson: string
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

function getTurnRowById(db: ArchiveDatabase, turnId: string) {
  return db.prepare(
    `select
      id,
      question,
      response_json as responseJson
     from memory_workspace_turns
     where id = ?`
  ).get(turnId) as MemoryWorkspaceTurnRow | undefined
}

function sha256Text(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileNameForApprovedDraft(draftReviewId: string) {
  return `persona-draft-review-${draftReviewId}-approved.json`
}

function mapHandoffRecord(entry: ReturnType<typeof listDecisionJournal>[number]): ApprovedPersonaDraftHandoffRecord | null {
  if (entry.decisionType !== 'export_approved_persona_draft') {
    return null
  }

  const sourceTurnId = typeof entry.operationPayload.sourceTurnId === 'string'
    ? entry.operationPayload.sourceTurnId
    : null
  const handoffKind = entry.operationPayload.handoffKind === 'local_json_export'
    ? 'local_json_export'
    : null
  const filePath = typeof entry.operationPayload.filePath === 'string'
    ? entry.operationPayload.filePath
    : null
  const fileName = typeof entry.operationPayload.fileName === 'string'
    ? entry.operationPayload.fileName
    : null
  const sha256 = typeof entry.operationPayload.sha256 === 'string'
    ? entry.operationPayload.sha256
    : null
  const exportedAt = typeof entry.operationPayload.exportedAt === 'string'
    ? entry.operationPayload.exportedAt
    : null

  if (!sourceTurnId || !handoffKind || !filePath || !fileName || !sha256 || !exportedAt) {
    return null
  }

  return {
    journalId: entry.id,
    draftReviewId: entry.targetId,
    sourceTurnId,
    handoffKind,
    status: 'exported',
    filePath,
    fileName,
    sha256,
    exportedAt
  }
}

export function buildApprovedPersonaDraftHandoffArtifact(
  db: ArchiveDatabase,
  input: { draftReviewId: string; exportedAt?: string }
) {
  const reviewRow = getReviewRowById(db, input.draftReviewId)
  if (!reviewRow) {
    return null
  }

  const review = mapReviewRow(reviewRow)
  if (review.status !== 'approved') {
    return null
  }

  const turn = getTurnRowById(db, review.sourceTurnId)
  if (!turn) {
    return null
  }

  const response = JSON.parse(turn.responseJson) as MemoryWorkspaceResponse

  return {
    formatVersion: 'phase10e1',
    handoffKind: 'local_json_export',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    draftReviewId: review.draftReviewId,
    sourceTurnId: review.sourceTurnId,
    scope: review.scope,
    workflowKind: review.workflowKind,
    reviewStatus: 'approved',
    question: turn.question || response.question,
    approvedDraft: review.editedDraft,
    reviewNotes: review.reviewNotes,
    supportingExcerptIds: review.supportingExcerpts,
    communicationExcerpts: response.communicationEvidence?.excerpts ?? [],
    trace: review.trace,
    shareEnvelope: {
      requestShape: 'local_json_persona_draft_handoff',
      policyKey: 'persona_draft.local_export_approved'
    }
  } satisfies ApprovedPersonaDraftHandoffArtifact
}

export function exportApprovedPersonaDraftToDirectory(
  db: ArchiveDatabase,
  input: ExportApprovedPersonaDraftInput
) {
  const exportedAt = new Date().toISOString()
  const artifact = buildApprovedPersonaDraftHandoffArtifact(db, {
    draftReviewId: input.draftReviewId,
    exportedAt
  })

  if (!artifact) {
    return null
  }

  const fileName = fileNameForApprovedDraft(input.draftReviewId)
  const filePath = path.join(input.destinationRoot, fileName)
  const payload = `${JSON.stringify(artifact, null, 2)}\n`

  fs.mkdirSync(input.destinationRoot, { recursive: true })
  fs.writeFileSync(filePath, payload, 'utf8')

  const sha256 = sha256Text(payload)
  const journal = appendDecisionJournal(db, {
    decisionType: 'export_approved_persona_draft',
    targetType: 'persona_draft_review',
    targetId: input.draftReviewId,
    operationPayload: {
      draftReviewId: input.draftReviewId,
      sourceTurnId: artifact.sourceTurnId,
      scope: artifact.scope,
      handoffKind: artifact.handoffKind,
      filePath,
      fileName,
      sha256,
      exportedAt
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  return {
    status: 'exported',
    journalId: journal.journalId,
    draftReviewId: input.draftReviewId,
    handoffKind: artifact.handoffKind,
    filePath,
    fileName,
    sha256,
    exportedAt
  } satisfies ExportApprovedPersonaDraftResult
}

export function listApprovedPersonaDraftHandoffs(
  db: ArchiveDatabase,
  input: ListApprovedPersonaDraftHandoffsInput
) {
  return listDecisionJournal(db, {
    decisionType: 'export_approved_persona_draft',
    targetType: 'persona_draft_review'
  })
    .filter((entry) => entry.targetId === input.draftReviewId)
    .map(mapHandoffRecord)
    .filter((record): record is ApprovedPersonaDraftHandoffRecord => record !== null)
}
