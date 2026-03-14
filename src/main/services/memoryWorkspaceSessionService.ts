import crypto from 'node:crypto'
import type {
  AskMemoryWorkspacePersistedInput,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  MemoryWorkspaceSessionDetail,
  MemoryWorkspaceSessionSummary,
  MemoryWorkspaceTurnRecord
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { askMemoryWorkspace } from './memoryWorkspaceService'

type SessionRow = {
  id: string
  scopeKind: 'global' | 'person' | 'group'
  scopeTargetId: string | null
  title: string
  latestQuestion: string | null
  turnCount: number
  createdAt: string
  updatedAt: string
}

type TurnRow = {
  id: string
  sessionId: string
  ordinal: number
  question: string
  responseJson: string
  provider: string | null
  model: string | null
  promptHash: string
  contextHash: string
  createdAt: string
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

function parseScope(row: Pick<SessionRow, 'scopeKind' | 'scopeTargetId'>): MemoryWorkspaceScope {
  if (row.scopeKind === 'person') {
    return { kind: 'person', canonicalPersonId: row.scopeTargetId ?? '' }
  }

  if (row.scopeKind === 'group') {
    return { kind: 'group', anchorPersonId: row.scopeTargetId ?? '' }
  }

  return { kind: 'global' }
}

function scopesEqual(left: MemoryWorkspaceScope, right: MemoryWorkspaceScope) {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'person' && right.kind === 'person') {
    return left.canonicalPersonId === right.canonicalPersonId
  }

  if (left.kind === 'group' && right.kind === 'group') {
    return left.anchorPersonId === right.anchorPersonId
  }

  return true
}

function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function mapSessionRow(row: SessionRow): MemoryWorkspaceSessionSummary {
  return {
    sessionId: row.id,
    scope: parseScope(row),
    title: row.title,
    latestQuestion: row.latestQuestion,
    turnCount: row.turnCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapTurnRow(row: TurnRow): MemoryWorkspaceTurnRecord {
  return {
    turnId: row.id,
    sessionId: row.sessionId,
    ordinal: row.ordinal,
    question: row.question,
    response: JSON.parse(row.responseJson) as MemoryWorkspaceResponse,
    provider: row.provider,
    model: row.model,
    promptHash: row.promptHash,
    contextHash: row.contextHash,
    createdAt: row.createdAt
  }
}

function loadSessionRow(db: ArchiveDatabase, sessionId: string) {
  return db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      latest_question as latestQuestion,
      turn_count as turnCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_sessions
     where id = ?`
  ).get(sessionId) as SessionRow | undefined
}

export function listMemoryWorkspaceSessions(
  db: ArchiveDatabase,
  input: { scope?: MemoryWorkspaceScope } = {}
) {
  const rows = db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      latest_question as latestQuestion,
      turn_count as turnCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_sessions
     order by updated_at desc, created_at desc, id asc`
  ).all() as SessionRow[]

  return rows
    .map(mapSessionRow)
    .filter((session) => (input.scope ? scopesEqual(session.scope, input.scope) : true))
}

export function getMemoryWorkspaceSession(
  db: ArchiveDatabase,
  input: { sessionId: string }
): MemoryWorkspaceSessionDetail | null {
  const sessionRow = loadSessionRow(db, input.sessionId)
  if (!sessionRow) {
    return null
  }

  const turnRows = db.prepare(
    `select
      id,
      session_id as sessionId,
      ordinal,
      question,
      response_json as responseJson,
      provider,
      model,
      prompt_hash as promptHash,
      context_hash as contextHash,
      created_at as createdAt
     from memory_workspace_turns
     where session_id = ?
     order by ordinal asc, created_at asc`
  ).all(input.sessionId) as TurnRow[]

  return {
    ...mapSessionRow(sessionRow),
    turns: turnRows.map(mapTurnRow)
  }
}

export function askMemoryWorkspacePersisted(
  db: ArchiveDatabase,
  input: AskMemoryWorkspacePersistedInput
): MemoryWorkspaceTurnRecord | null {
  const existingSession = input.sessionId ? loadSessionRow(db, input.sessionId) : undefined
  if (input.sessionId && !existingSession) {
    return null
  }

  if (existingSession && !scopesEqual(parseScope(existingSession), input.scope)) {
    return null
  }

  const response = askMemoryWorkspace(db, {
    scope: input.scope,
    question: input.question
  })

  if (!response) {
    return null
  }

  const createdAt = new Date().toISOString()
  const sessionId = existingSession?.id ?? crypto.randomUUID()
  const ordinal = (existingSession?.turnCount ?? 0) + 1
  const turnId = crypto.randomUUID()
  const promptHash = hashValue({
    scope: input.scope,
    question: input.question,
    sessionId: existingSession?.id ?? null
  })
  const contextHash = hashValue(response)
  const provider = null
  const model = null

  db.exec('begin immediate')
  try {
    if (!existingSession) {
      db.prepare(
        `insert into memory_workspace_sessions (
          id, scope_kind, scope_target_id, title, latest_question, turn_count, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sessionId,
        input.scope.kind,
        scopeTargetId(input.scope),
        response.title,
        input.question,
        0,
        createdAt,
        createdAt
      )
    }

    db.prepare(
      `insert into memory_workspace_turns (
        id, session_id, ordinal, question, response_json, provider, model, prompt_hash, context_hash, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      turnId,
      sessionId,
      ordinal,
      input.question,
      JSON.stringify(response),
      provider,
      model,
      promptHash,
      contextHash,
      createdAt
    )

    db.prepare(
      `update memory_workspace_sessions
       set title = ?, latest_question = ?, turn_count = ?, updated_at = ?
       where id = ?`
    ).run(
      response.title,
      input.question,
      ordinal,
      createdAt,
      sessionId
    )

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }

  return {
    turnId,
    sessionId,
    ordinal,
    question: input.question,
    response,
    provider,
    model,
    promptHash,
    contextHash,
    createdAt
  }
}
