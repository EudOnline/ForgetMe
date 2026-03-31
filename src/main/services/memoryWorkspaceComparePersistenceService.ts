import crypto from 'node:crypto'
import type {
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  buildCompareSessionMetadata,
  buildRecommendation,
  withEvaluation,
  withJudgeVerdict
} from './memoryWorkspaceCompareEvaluationService'
import { createSkippedJudgeVerdict } from './memoryWorkspaceCompareModelService'

type CompareSessionRow = {
  id: string
  scopeKind: 'global' | 'person' | 'group'
  scopeTargetId: string | null
  title: string
  question: string
  expressionMode: MemoryWorkspaceResponse['expressionMode'] | null
  workflowKind: MemoryWorkspaceResponse['workflowKind'] | null
  runCount: number
  createdAt: string
  updatedAt: string
}

type CompareRunRow = {
  id: string
  compareSessionId: string
  ordinal: number
  targetId: string
  targetLabel: string
  executionMode: MemoryWorkspaceCompareTarget['executionMode']
  provider: string | null
  model: string | null
  status: MemoryWorkspaceCompareRunRecord['status']
  errorMessage: string | null
  responseJson: string | null
  promptHash: string
  contextHash: string
  judgeStatus: MemoryWorkspaceCompareJudgeVerdict['status'] | null
  judgeProvider: string | null
  judgeModel: string | null
  judgeDecision: MemoryWorkspaceCompareJudgeDecision | null
  judgeScore: number | null
  judgeRationale: string | null
  judgeStrengthsJson: string | null
  judgeConcernsJson: string | null
  judgeErrorMessage: string | null
  judgeCreatedAt: string | null
  createdAt: string
}

export function scopeTargetId(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return scope.canonicalPersonId
  }

  if (scope.kind === 'group') {
    return scope.anchorPersonId
  }

  return null
}

export function scopesEqual(left: MemoryWorkspaceScope, right: MemoryWorkspaceScope) {
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

export function hashCompareValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function parseScope(row: Pick<CompareSessionRow, 'scopeKind' | 'scopeTargetId'>): MemoryWorkspaceScope {
  if (row.scopeKind === 'person') {
    return { kind: 'person', canonicalPersonId: row.scopeTargetId ?? '' }
  }

  if (row.scopeKind === 'group') {
    return { kind: 'group', anchorPersonId: row.scopeTargetId ?? '' }
  }

  return { kind: 'global' }
}

function parseStoredJudgeStringArray(value: string | null) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function mapCompareSessionRow(row: CompareSessionRow): MemoryWorkspaceCompareSessionSummary {
  return {
    compareSessionId: row.id,
    scope: parseScope(row),
    title: row.title,
    question: row.question,
    expressionMode: row.expressionMode === 'advice' ? 'advice' : 'grounded',
    workflowKind: row.workflowKind === 'persona_draft_sandbox' ? 'persona_draft_sandbox' : 'default',
    runCount: row.runCount,
    metadata: {
      targetLabels: [],
      failedRunCount: 0,
      judge: {
        enabled: false,
        status: 'disabled'
      }
    },
    recommendation: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapStoredJudgeVerdict(row: CompareRunRow): MemoryWorkspaceCompareJudgeVerdict {
  if (!row.judgeStatus) {
    return createSkippedJudgeVerdict('Judge verdict was not recorded for this compare run.', row.createdAt)
  }

  return {
    status: row.judgeStatus,
    provider: row.judgeProvider === 'openrouter' ? 'openrouter' : row.judgeProvider === 'siliconflow' ? 'siliconflow' : null,
    model: row.judgeModel,
    decision: row.judgeDecision,
    score: typeof row.judgeScore === 'number' ? row.judgeScore : null,
    rationale: row.judgeRationale,
    strengths: parseStoredJudgeStringArray(row.judgeStrengthsJson),
    concerns: parseStoredJudgeStringArray(row.judgeConcernsJson),
    errorMessage: row.judgeErrorMessage,
    createdAt: row.judgeCreatedAt
  }
}

function mapCompareRunRow(row: CompareRunRow): MemoryWorkspaceCompareRunRecord {
  const target: MemoryWorkspaceCompareTarget = row.executionMode === 'local_baseline'
    ? {
        targetId: row.targetId,
        label: row.targetLabel,
        executionMode: 'local_baseline'
      }
    : {
        targetId: row.targetId,
        label: row.targetLabel,
        executionMode: 'provider_model',
        provider: row.provider === 'openrouter' ? 'openrouter' : 'siliconflow',
        model: row.model ?? ''
      }

  const run = withEvaluation({
    compareRunId: row.id,
    compareSessionId: row.compareSessionId,
    ordinal: row.ordinal,
    target,
    provider: row.provider,
    model: row.model,
    status: row.status,
    errorMessage: row.errorMessage,
    response: row.responseJson ? JSON.parse(row.responseJson) as MemoryWorkspaceResponse : null,
    contextHash: row.contextHash,
    promptHash: row.promptHash,
    createdAt: row.createdAt
  })

  return withJudgeVerdict(run, mapStoredJudgeVerdict(row))
}

function loadCompareSessionRow(db: ArchiveDatabase, compareSessionId: string) {
  return db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      question,
      expression_mode as expressionMode,
      workflow_kind as workflowKind,
      run_count as runCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_compare_sessions
     where id = ?`
  ).get(compareSessionId) as CompareSessionRow | undefined
}

function loadCompareRunRows(db: ArchiveDatabase, compareSessionId: string) {
  return db.prepare(
    `select
      runs.id as id,
      runs.compare_session_id as compareSessionId,
      runs.ordinal as ordinal,
      runs.target_id as targetId,
      runs.target_label as targetLabel,
      runs.execution_mode as executionMode,
      runs.provider as provider,
      runs.model as model,
      runs.status as status,
      runs.error_message as errorMessage,
      runs.response_json as responseJson,
      runs.prompt_hash as promptHash,
      runs.context_hash as contextHash,
      judges.status as judgeStatus,
      judges.provider as judgeProvider,
      judges.model as judgeModel,
      judges.decision as judgeDecision,
      judges.score as judgeScore,
      judges.rationale as judgeRationale,
      judges.strengths_json as judgeStrengthsJson,
      judges.concerns_json as judgeConcernsJson,
      judges.error_message as judgeErrorMessage,
      judges.created_at as judgeCreatedAt,
      runs.created_at as createdAt
     from memory_workspace_compare_runs runs
     left join memory_workspace_compare_judgements judges
       on judges.compare_run_id = runs.id
     where runs.compare_session_id = ?
     order by runs.ordinal asc, runs.created_at asc`
  ).all(compareSessionId) as CompareRunRow[]
}

function buildStoredCompareSessionSummary(
  row: CompareSessionRow,
  runs: MemoryWorkspaceCompareRunRecord[]
): MemoryWorkspaceCompareSessionSummary {
  return {
    ...mapCompareSessionRow(row),
    metadata: buildCompareSessionMetadata(runs),
    recommendation: buildRecommendation(runs)
  }
}

export function listStoredMemoryWorkspaceCompareSessions(
  db: ArchiveDatabase,
  input: { scope?: MemoryWorkspaceScope } = {}
) {
  const rows = db.prepare(
    `select
      id,
      scope_kind as scopeKind,
      scope_target_id as scopeTargetId,
      title,
      question,
      expression_mode as expressionMode,
      workflow_kind as workflowKind,
      run_count as runCount,
      created_at as createdAt,
      updated_at as updatedAt
     from memory_workspace_compare_sessions
     order by updated_at desc, created_at desc, id asc`
  ).all() as CompareSessionRow[]

  return rows
    .map((row) => {
      const runs = loadCompareRunRows(db, row.id).map(mapCompareRunRow)
      return buildStoredCompareSessionSummary(row, runs)
    })
    .filter((session) => (input.scope ? scopesEqual(session.scope, input.scope) : true))
}

export function getStoredMemoryWorkspaceCompareSession(
  db: ArchiveDatabase,
  input: { compareSessionId: string }
): MemoryWorkspaceCompareSessionDetail | null {
  const sessionRow = loadCompareSessionRow(db, input.compareSessionId)
  if (!sessionRow) {
    return null
  }

  const runs = loadCompareRunRows(db, input.compareSessionId).map(mapCompareRunRow)

  return {
    ...buildStoredCompareSessionSummary(sessionRow, runs),
    runs
  }
}

export function persistMemoryWorkspaceCompareSession(
  db: ArchiveDatabase,
  input: {
    sessionSummary: MemoryWorkspaceCompareSessionSummary
    runs: MemoryWorkspaceCompareRunRecord[]
  }
) {
  db.exec('begin immediate')
  try {
    db.prepare(
      `insert into memory_workspace_compare_sessions (
        id, scope_kind, scope_target_id, title, question, expression_mode, workflow_kind, run_count, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.sessionSummary.compareSessionId,
      input.sessionSummary.scope.kind,
      scopeTargetId(input.sessionSummary.scope),
      input.sessionSummary.title,
      input.sessionSummary.question,
      input.sessionSummary.expressionMode,
      input.sessionSummary.workflowKind,
      input.runs.length,
      input.sessionSummary.createdAt,
      input.sessionSummary.updatedAt
    )

    const insertRun = db.prepare(
      `insert into memory_workspace_compare_runs (
        id, compare_session_id, ordinal, target_id, target_label, execution_mode,
        provider, model, status, error_message, response_json, prompt_hash, context_hash, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertJudge = db.prepare(
      `insert into memory_workspace_compare_judgements (
        compare_run_id, status, provider, model, decision, score, rationale,
        strengths_json, concerns_json, error_message, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const run of input.runs) {
      insertRun.run(
        run.compareRunId,
        input.sessionSummary.compareSessionId,
        run.ordinal,
        run.target.targetId,
        run.target.label,
        run.target.executionMode,
        run.provider,
        run.model,
        run.status,
        run.errorMessage,
        run.response ? JSON.stringify(run.response) : null,
        run.promptHash,
        run.contextHash,
        run.createdAt
      )

      insertJudge.run(
        run.compareRunId,
        run.judge.status,
        run.judge.provider,
        run.judge.model,
        run.judge.decision,
        run.judge.score,
        run.judge.rationale,
        JSON.stringify(run.judge.strengths),
        JSON.stringify(run.judge.concerns),
        run.judge.errorMessage,
        run.judge.createdAt
      )
    }

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}
