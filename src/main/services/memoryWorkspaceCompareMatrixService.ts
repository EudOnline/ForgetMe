import crypto from 'node:crypto'
import type {
  MemoryWorkspaceCompareMatrixDetail,
  MemoryWorkspaceCompareMatrixRowRecord,
  MemoryWorkspaceCompareMatrixSummary,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionJudgeSummary,
  MemoryWorkspaceScope,
  RunMemoryWorkspaceCompareInput,
  RunMemoryWorkspaceCompareMatrixInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS,
  runMemoryWorkspaceCompare
} from './memoryWorkspaceCompareService'

type MatrixSessionRow = {
  id: string
  title: string
  rowCount: number
  completedRowCount: number
  failedRowCount: number
  targetLabelsJson: string
  judgeEnabled: number
  judgeStatus: MemoryWorkspaceCompareSessionJudgeSummary['status']
  createdAt: string
  updatedAt: string
}

type MatrixRowRow = {
  id: string
  matrixSessionId: string
  ordinal: number
  label: string | null
  scopeKind: 'global' | 'person' | 'group'
  scopeTargetId: string | null
  question: string
  status: MemoryWorkspaceCompareMatrixRowRecord['status']
  errorMessage: string | null
  compareSessionId: string | null
  recommendedCompareRunId: string | null
  recommendedTargetLabel: string | null
  failedRunCount: number
  createdAt: string
}

type MatrixRowSnapshot = {
  matrixRowId: string
  matrixSessionId: string
  ordinal: number
  label: string | null
  scope: MemoryWorkspaceScope
  question: string
  status: MemoryWorkspaceCompareMatrixRowRecord['status']
  errorMessage: string | null
  compareSessionId: string | null
  recommendedCompareRunId: string | null
  recommendedTargetLabel: string | null
  failedRunCount: number
  createdAt: string
}

function parseScope(row: Pick<MatrixRowRow, 'scopeKind' | 'scopeTargetId'>): MemoryWorkspaceScope {
  if (row.scopeKind === 'person') {
    return { kind: 'person', canonicalPersonId: row.scopeTargetId ?? '' }
  }

  if (row.scopeKind === 'group') {
    return { kind: 'group', anchorPersonId: row.scopeTargetId ?? '' }
  }

  return { kind: 'global' }
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

function parseStoredTargetLabels(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function mapMatrixRow(row: MatrixRowRow): MemoryWorkspaceCompareMatrixRowRecord {
  return {
    matrixRowId: row.id,
    matrixSessionId: row.matrixSessionId,
    ordinal: row.ordinal,
    label: row.label,
    scope: parseScope(row),
    question: row.question,
    status: row.status,
    errorMessage: row.errorMessage,
    compareSessionId: row.compareSessionId,
    recommendedCompareRunId: row.recommendedCompareRunId,
    recommendedTargetLabel: row.recommendedTargetLabel,
    failedRunCount: row.failedRunCount,
    createdAt: row.createdAt
  }
}

function mapMatrixSummary(row: MatrixSessionRow): MemoryWorkspaceCompareMatrixSummary {
  return {
    matrixSessionId: row.id,
    title: row.title,
    rowCount: row.rowCount,
    completedRowCount: row.completedRowCount,
    failedRowCount: row.failedRowCount,
    metadata: {
      targetLabels: parseStoredTargetLabels(row.targetLabelsJson),
      judge: {
        enabled: row.judgeEnabled === 1,
        status: row.judgeStatus
      }
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function buildJudgeSummary(
  sessions: Array<MemoryWorkspaceCompareSessionDetail | null>,
  input: RunMemoryWorkspaceCompareMatrixInput
): MemoryWorkspaceCompareSessionJudgeSummary {
  const explicitlyEnabled = input.judge?.enabled === true
  const availableStatuses = sessions
    .map((session) => session?.metadata.judge)
    .filter((judge): judge is MemoryWorkspaceCompareSessionJudgeSummary => Boolean(judge))

  if (!explicitlyEnabled && !availableStatuses.some((judge) => judge.enabled)) {
    return {
      enabled: false,
      status: 'disabled'
    }
  }

  const statuses = new Set(
    availableStatuses
      .filter((judge) => judge.enabled)
      .map((judge) => judge.status)
      .filter((status) => status !== 'disabled')
  )

  if (statuses.size === 0) {
    return {
      enabled: true,
      status: 'disabled'
    }
  }

  if (statuses.size === 1) {
    const [status] = [...statuses]
    return {
      enabled: true,
      status
    }
  }

  return {
    enabled: true,
    status: 'mixed'
  }
}

function matrixTitle(input: RunMemoryWorkspaceCompareMatrixInput) {
  const explicitTitle = input.title?.trim()
  if (explicitTitle) {
    return explicitTitle
  }

  return 'Memory Workspace Compare Matrix'
}

function loadMatrixSessionRow(db: ArchiveDatabase, matrixSessionId: string) {
  return db.prepare(
    `select
      id,
      title,
      row_count as rowCount,
      completed_row_count as completedRowCount,
      failed_row_count as failedRowCount,
      target_labels_json as targetLabelsJson,
      judge_enabled as judgeEnabled,
      judge_status as judgeStatus,
      created_at as createdAt,
      updated_at as updatedAt
    from memory_workspace_compare_matrices
    where id = ?`
  ).get(matrixSessionId) as MatrixSessionRow | undefined
}

function loadMatrixRows(db: ArchiveDatabase, matrixSessionId: string) {
  return db.prepare(
    `select
      id,
      matrix_session_id as matrixSessionId,
      ordinal,
      label,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      question,
      status,
      error_message as errorMessage,
      compare_session_id as compareSessionId,
      recommended_compare_run_id as recommendedCompareRunId,
      recommended_target_label as recommendedTargetLabel,
      failed_run_count as failedRunCount,
      created_at as createdAt
    from memory_workspace_compare_matrix_rows
    where matrix_session_id = ?
    order by ordinal asc`
  ).all(matrixSessionId) as MatrixRowRow[]
}

export async function runMemoryWorkspaceCompareMatrix(
  db: ArchiveDatabase,
  input: RunMemoryWorkspaceCompareMatrixInput,
  options: {
    runCompare?: (
      db: ArchiveDatabase,
      input: RunMemoryWorkspaceCompareInput
    ) => Promise<MemoryWorkspaceCompareSessionDetail | null>
  } = {}
): Promise<MemoryWorkspaceCompareMatrixDetail | null> {
  const matrixSessionId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const runCompare = options.runCompare ?? runMemoryWorkspaceCompare
  const targetLabels = (input.targets?.length ? input.targets : DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS)
    .map((target) => target.label)
  const rowSnapshots: MatrixRowSnapshot[] = []
  const childSessions: Array<MemoryWorkspaceCompareSessionDetail | null> = []

  for (const [index, row] of input.rows.entries()) {
    const ordinal = index + 1
    const rowId = crypto.randomUUID()

    try {
      const session = await runCompare(db, {
        scope: row.scope,
        question: row.question,
        judge: input.judge,
        targets: input.targets
      })

      childSessions.push(session)

      if (!session) {
        rowSnapshots.push({
          matrixRowId: rowId,
          matrixSessionId,
          ordinal,
          label: row.label ?? null,
          scope: row.scope,
          question: row.question,
          status: 'failed',
          errorMessage: 'Compare session returned no result.',
          compareSessionId: null,
          recommendedCompareRunId: null,
          recommendedTargetLabel: null,
          failedRunCount: 0,
          createdAt
        })
        continue
      }

      rowSnapshots.push({
        matrixRowId: rowId,
        matrixSessionId,
        ordinal,
        label: row.label ?? null,
        scope: row.scope,
        question: row.question,
        status: 'completed',
        errorMessage: null,
        compareSessionId: session.compareSessionId,
        recommendedCompareRunId: session.recommendation?.recommendedCompareRunId ?? null,
        recommendedTargetLabel: session.recommendation?.recommendedTargetLabel ?? null,
        failedRunCount: session.metadata.failedRunCount,
        createdAt: session.updatedAt
      })
    } catch (error) {
      childSessions.push(null)
      rowSnapshots.push({
        matrixRowId: rowId,
        matrixSessionId,
        ordinal,
        label: row.label ?? null,
        scope: row.scope,
        question: row.question,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        compareSessionId: null,
        recommendedCompareRunId: null,
        recommendedTargetLabel: null,
        failedRunCount: 0,
        createdAt
      })
    }
  }

  const completedRowCount = rowSnapshots.filter((row) => row.status === 'completed').length
  const failedRowCount = rowSnapshots.length - completedRowCount
  const judge = buildJudgeSummary(childSessions, input)
  const updatedAt = rowSnapshots[rowSnapshots.length - 1]?.createdAt ?? createdAt

  const summary: MemoryWorkspaceCompareMatrixSummary = {
    matrixSessionId,
    title: matrixTitle(input),
    rowCount: rowSnapshots.length,
    completedRowCount,
    failedRowCount,
    metadata: {
      targetLabels,
      judge
    },
    createdAt,
    updatedAt
  }

  db.exec('begin immediate')
  try {
    db.prepare(
      `insert into memory_workspace_compare_matrices (
        id, title, row_count, completed_row_count, failed_row_count,
        target_labels_json, judge_enabled, judge_status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      summary.matrixSessionId,
      summary.title,
      summary.rowCount,
      summary.completedRowCount,
      summary.failedRowCount,
      JSON.stringify(summary.metadata.targetLabels),
      summary.metadata.judge.enabled ? 1 : 0,
      summary.metadata.judge.status,
      summary.createdAt,
      summary.updatedAt
    )

    const insertRow = db.prepare(
      `insert into memory_workspace_compare_matrix_rows (
        id, matrix_session_id, ordinal, label, scope_kind, scope_target_id, question,
        status, error_message, compare_session_id, recommended_compare_run_id,
        recommended_target_label, failed_run_count, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const row of rowSnapshots) {
      insertRow.run(
        row.matrixRowId,
        row.matrixSessionId,
        row.ordinal,
        row.label,
        row.scope.kind,
        scopeTargetId(row.scope),
        row.question,
        row.status,
        row.errorMessage,
        row.compareSessionId,
        row.recommendedCompareRunId,
        row.recommendedTargetLabel,
        row.failedRunCount,
        row.createdAt
      )
    }

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }

  return {
    ...summary,
    rows: rowSnapshots.map((row) => ({
      matrixRowId: row.matrixRowId,
      matrixSessionId: row.matrixSessionId,
      ordinal: row.ordinal,
      label: row.label,
      scope: row.scope,
      question: row.question,
      status: row.status,
      errorMessage: row.errorMessage,
      compareSessionId: row.compareSessionId,
      recommendedCompareRunId: row.recommendedCompareRunId,
      recommendedTargetLabel: row.recommendedTargetLabel,
      failedRunCount: row.failedRunCount,
      createdAt: row.createdAt
    }))
  }
}

export function listMemoryWorkspaceCompareMatrices(db: ArchiveDatabase) {
  const rows = db.prepare(
    `select
      id,
      title,
      row_count as rowCount,
      completed_row_count as completedRowCount,
      failed_row_count as failedRowCount,
      target_labels_json as targetLabelsJson,
      judge_enabled as judgeEnabled,
      judge_status as judgeStatus,
      created_at as createdAt,
      updated_at as updatedAt
    from memory_workspace_compare_matrices
    order by updated_at desc, created_at desc`
  ).all() as MatrixSessionRow[]

  return rows.map(mapMatrixSummary)
}

export function getMemoryWorkspaceCompareMatrix(
  db: ArchiveDatabase,
  input: { matrixSessionId: string }
) {
  const sessionRow = loadMatrixSessionRow(db, input.matrixSessionId)
  if (!sessionRow) {
    return null
  }

  return {
    ...mapMatrixSummary(sessionRow),
    rows: loadMatrixRows(db, input.matrixSessionId).map(mapMatrixRow)
  }
}
