import crypto from 'node:crypto'
import type {
  MemoryWorkspaceCompareJudgeDecision,
  MemoryWorkspaceCompareJudgeVerdict,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  RunMemoryWorkspaceCompareInput
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  buildCompareSessionMetadata,
  buildRecommendation,
  runSnapshotTimestamp,
  type UnevaluatedCompareRun,
  withEvaluation,
  withJudgeVerdict
} from './memoryWorkspaceCompareEvaluationService'
import {
  attachJudgeVerdicts,
  buildComparedResponse,
  createSkippedJudgeVerdict,
  defaultCompareJudgeCaller,
  defaultCompareModelCaller,
  resolveJudgeConfig,
  type CompareJudgeCaller,
  type CompareJudgeConfig,
  type CompareModelCaller,
} from './memoryWorkspaceCompareModelService'
import { askMemoryWorkspace } from './memoryWorkspaceService'

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

export const DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS: MemoryWorkspaceCompareTarget[] = [
  {
    targetId: 'baseline-local',
    label: 'Local baseline',
    executionMode: 'local_baseline'
  },
  {
    targetId: 'siliconflow-qwen25-72b',
    label: 'SiliconFlow / Qwen2.5-72B-Instruct',
    executionMode: 'provider_model',
    provider: 'siliconflow',
    model: process.env.FORGETME_MEMORY_COMPARE_SILICONFLOW_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct'
  },
  {
    targetId: 'openrouter-qwen25-72b',
    label: 'OpenRouter / qwen-2.5-72b-instruct',
    executionMode: 'provider_model',
    provider: 'openrouter',
    model: process.env.FORGETME_MEMORY_COMPARE_OPENROUTER_MODEL ?? 'qwen/qwen-2.5-72b-instruct'
  }
]

function scopeTargetId(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return scope.canonicalPersonId
  }

  if (scope.kind === 'group') {
    return scope.anchorPersonId
  }

  return null
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

function buildCompareSessionSummary(
  row: CompareSessionRow,
  runs: MemoryWorkspaceCompareRunRecord[]
): MemoryWorkspaceCompareSessionSummary {
  return {
    ...mapCompareSessionRow(row),
    metadata: buildCompareSessionMetadata(runs),
    recommendation: buildRecommendation(runs)
  }
}

export function listMemoryWorkspaceCompareSessions(
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
      return buildCompareSessionSummary(row, runs)
    })
    .filter((session) => (input.scope ? scopesEqual(session.scope, input.scope) : true))
}

export function getMemoryWorkspaceCompareSession(
  db: ArchiveDatabase,
  input: { compareSessionId: string }
): MemoryWorkspaceCompareSessionDetail | null {
  const sessionRow = loadCompareSessionRow(db, input.compareSessionId)
  if (!sessionRow) {
    return null
  }

  const runRows = loadCompareRunRows(db, input.compareSessionId)
  const runs = runRows.map(mapCompareRunRow)

  return {
    ...buildCompareSessionSummary(sessionRow, runs),
    runs
  }
}

export async function runMemoryWorkspaceCompare(
  db: ArchiveDatabase,
  input: RunMemoryWorkspaceCompareInput,
  options: {
    callModel?: CompareModelCaller
    judge?: CompareJudgeConfig
    callJudgeModel?: CompareJudgeCaller
  } = {}
): Promise<MemoryWorkspaceCompareSessionDetail | null> {
  const expressionMode = input.expressionMode ?? 'grounded'
  const workflowKind = input.workflowKind ?? 'default'
  const baselineResponse = askMemoryWorkspace(db, {
    scope: input.scope,
    question: input.question,
    expressionMode,
    workflowKind
  })

  if (!baselineResponse) {
    return null
  }

  const compareTargets = input.targets?.length ? input.targets : DEFAULT_MEMORY_WORKSPACE_COMPARE_TARGETS
  const compareSessionId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const callModel = options.callModel ?? defaultCompareModelCaller
  const judgeConfig = resolveJudgeConfig(input.judge, options.judge)
  const callJudgeModel = options.callJudgeModel ?? defaultCompareJudgeCaller
  const rawRuns: UnevaluatedCompareRun[] = []

  for (const [index, target] of compareTargets.entries()) {
    const ordinal = index + 1
    const promptHash = hashValue({
      scope: input.scope,
      question: input.question,
      expressionMode,
      workflowKind,
      target
    })

    if (target.executionMode === 'local_baseline') {
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: null,
        model: null,
        status: 'completed',
        errorMessage: null,
        response: baselineResponse,
        contextHash: hashValue(baselineResponse),
        promptHash,
        createdAt
      })
      continue
    }

    try {
      const modelResult = await callModel({
        target,
        baselineResponse
      })

      const response = buildComparedResponse(baselineResponse, modelResult.summary)
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: modelResult.provider,
        model: modelResult.model,
        status: 'completed',
        errorMessage: null,
        response,
        contextHash: hashValue(response),
        promptHash,
        createdAt: modelResult.receivedAt ?? createdAt
      })
    } catch (error) {
      rawRuns.push({
        compareRunId: crypto.randomUUID(),
        compareSessionId,
        ordinal,
        target,
        provider: target.provider,
        model: target.model,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        response: null,
        contextHash: hashValue({
          compareSessionId,
          ordinal,
          target,
          status: 'failed'
        }),
        promptHash,
        createdAt
      })
    }
  }

  const evaluatedRuns = rawRuns.map(withEvaluation)
  const runs = await attachJudgeVerdicts(evaluatedRuns, {
    baselineResponse,
    judgeConfig,
    callJudgeModel,
    createdAt
  })
  const metadata = buildCompareSessionMetadata(runs)
  const recommendation = buildRecommendation(runs)
  const updatedAt = runs[runs.length - 1] ? runSnapshotTimestamp(runs[runs.length - 1]) : createdAt

  const sessionSummary: MemoryWorkspaceCompareSessionSummary = {
    compareSessionId,
    scope: input.scope,
    title: baselineResponse.title.replace('Memory Workspace', 'Memory Workspace Compare'),
    question: input.question,
    expressionMode,
    workflowKind,
    runCount: runs.length,
    metadata,
    recommendation,
    createdAt,
    updatedAt
  }

  db.exec('begin immediate')
  try {
    db.prepare(
      `insert into memory_workspace_compare_sessions (
        id, scope_kind, scope_target_id, title, question, expression_mode, workflow_kind, run_count, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      compareSessionId,
      input.scope.kind,
      scopeTargetId(input.scope),
      sessionSummary.title,
      input.question,
      sessionSummary.expressionMode,
      sessionSummary.workflowKind,
      runs.length,
      createdAt,
      sessionSummary.updatedAt
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

    for (const run of runs) {
      insertRun.run(
        run.compareRunId,
        compareSessionId,
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

  return {
    ...sessionSummary,
    runs
  }
}
