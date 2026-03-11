import crypto from 'node:crypto'
import path from 'node:path'
import type { AppPaths } from './appPaths'
import type { ArchiveDatabase } from './db'
import { openDatabase, runMigrations } from './db'


function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

type EnrichmentJobRow = {
  id: string
  fileId: string
  enhancerType: string
  provider: string
  model: string
  status: string
  attemptCount: number
  inputHash: string | null
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  usageJson: string
  createdAt: string
  updatedAt: string
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

function getJob(db: ArchiveDatabase, jobId: string) {
  const job = db.prepare(
    `select
      id,
      file_id as fileId,
      enhancer_type as enhancerType,
      provider,
      model,
      status,
      attempt_count as attemptCount,
      input_hash as inputHash,
      started_at as startedAt,
      finished_at as finishedAt,
      error_message as errorMessage,
      usage_json as usageJson,
      created_at as createdAt,
      updated_at as updatedAt
     from enrichment_jobs
     where id = ?`
  ).get(jobId) as EnrichmentJobRow | undefined

  if (!job) {
    throw new Error(`Enrichment job not found: ${jobId}`)
  }

  return job
}

function updateCurrentAttempt(db: ArchiveDatabase, input: {
  jobId: string
  status: 'completed' | 'failed'
  finishedAt: string
  usage?: Record<string, unknown> | null
  errorMessage?: string | null
  errorKind?: string | null
}) {
  const job = getJob(db, input.jobId)
  if (job.attemptCount <= 0) {
    return
  }

  db.prepare(
    `update enrichment_attempts
     set status = ?,
         finished_at = ?,
         usage_json = ?,
         error_message = ?,
         error_kind = ?
     where job_id = ? and attempt_index = ?`
  ).run(
    input.status,
    input.finishedAt,
    JSON.stringify(input.usage ?? {}),
    input.errorMessage ?? null,
    input.errorKind ?? null,
    input.jobId,
    job.attemptCount
  )
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function claimNextEnrichmentJob(db: ArchiveDatabase) {
  return inTransaction(db, () => {
    const nextJob = db.prepare(
      `select
        id,
        file_id as fileId,
        enhancer_type as enhancerType,
        provider,
        model,
        status,
        attempt_count as attemptCount,
        input_hash as inputHash,
        started_at as startedAt,
        finished_at as finishedAt,
        error_message as errorMessage,
        usage_json as usageJson,
        created_at as createdAt,
        updated_at as updatedAt
       from enrichment_jobs
       where status = 'pending'
       order by created_at asc, id asc
       limit 1`
    ).get() as EnrichmentJobRow | undefined

    if (!nextJob) {
      return null
    }

    const claimedAt = new Date().toISOString()
    db.prepare(
      `update enrichment_jobs
       set status = ?,
           attempt_count = attempt_count + 1,
           started_at = ?,
           finished_at = null,
           error_message = null,
           updated_at = ?
       where id = ?`
    ).run('processing', claimedAt, claimedAt, nextJob.id)

    return getJob(db, nextJob.id)
  })
}

export function appendEnrichmentAttempt(db: ArchiveDatabase, input: {
  jobId: string
  provider: string
  model: string
}) {
  const job = getJob(db, input.jobId)
  const attemptIndex = job.attemptCount > 0 ? job.attemptCount : 1
  const existingAttempt = db.prepare(
    `select
      id,
      job_id as jobId,
      attempt_index as attemptIndex,
      provider,
      model,
      status,
      started_at as startedAt,
      finished_at as finishedAt,
      error_kind as errorKind,
      error_message as errorMessage,
      usage_json as usageJson,
      created_at as createdAt
     from enrichment_attempts
     where job_id = ? and attempt_index = ?`
  ).get(input.jobId, attemptIndex) as {
    id: string
    jobId: string
    attemptIndex: number
    provider: string
    model: string
    status: string
    startedAt: string
    finishedAt: string | null
    errorKind: string | null
    errorMessage: string | null
    usageJson: string
    createdAt: string
  } | undefined

  if (existingAttempt) {
    return existingAttempt
  }

  const createdAt = new Date().toISOString()
  const attemptId = crypto.randomUUID()
  db.prepare(
    `insert into enrichment_attempts (
      id, job_id, attempt_index, provider, model, status,
      started_at, finished_at, error_kind, error_message, usage_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    input.jobId,
    attemptIndex,
    input.provider,
    input.model,
    'processing',
    job.startedAt ?? createdAt,
    null,
    null,
    null,
    '{}',
    createdAt
  )

  return {
    id: attemptId,
    jobId: input.jobId,
    attemptIndex,
    provider: input.provider,
    model: input.model,
    status: 'processing',
    startedAt: job.startedAt ?? createdAt,
    finishedAt: null,
    errorKind: null,
    errorMessage: null,
    usageJson: '{}',
    createdAt
  }
}

export function completeEnrichmentJob(db: ArchiveDatabase, input: {
  jobId: string
  usage?: Record<string, unknown> | null
  finishedAt?: string
}) {
  const finishedAt = input.finishedAt ?? new Date().toISOString()
  db.prepare(
    `update enrichment_jobs
     set status = ?,
         finished_at = ?,
         error_message = null,
         usage_json = ?,
         updated_at = ?
     where id = ?`
  ).run('completed', finishedAt, JSON.stringify(input.usage ?? {}), finishedAt, input.jobId)

  updateCurrentAttempt(db, {
    jobId: input.jobId,
    status: 'completed',
    finishedAt,
    usage: input.usage ?? {}
  })

  return getJob(db, input.jobId)
}

export function failEnrichmentJob(db: ArchiveDatabase, input: {
  jobId: string
  errorMessage: string
  errorKind?: string
  finishedAt?: string
}) {
  const finishedAt = input.finishedAt ?? new Date().toISOString()
  db.prepare(
    `update enrichment_jobs
     set status = ?,
         finished_at = ?,
         error_message = ?,
         updated_at = ?
     where id = ?`
  ).run('failed', finishedAt, input.errorMessage, finishedAt, input.jobId)

  updateCurrentAttempt(db, {
    jobId: input.jobId,
    status: 'failed',
    finishedAt,
    usage: {},
    errorMessage: input.errorMessage,
    errorKind: input.errorKind ?? null
  })

  return getJob(db, input.jobId)
}

export function createEnrichmentRunner(input: {
  appPaths: AppPaths
  intervalMs?: number
  concurrency?: number
  runCycle?: () => Promise<boolean>
}) {
  const intervalMs = input.intervalMs ?? parsePositiveInteger(process.env.FORGETME_ENRICHMENT_RUNNER_INTERVAL_MS, 5_000)
  const concurrency = Math.max(1, input.concurrency ?? 1)
  const defaultRunCycle = async () => {
    const db = openDatabase(databasePath(input.appPaths))
    runMigrations(db)

    try {
      const job = claimNextEnrichmentJob(db)
      if (!job) {
        return false
      }

      appendEnrichmentAttempt(db, {
        jobId: job.id,
        provider: job.provider,
        model: job.model
      })
      const { executeEnrichmentJob } = await import('./enrichmentExecutionService')
      await executeEnrichmentJob(db, { jobId: job.id })
      return true
    } finally {
      db.close()
    }
  }

  const runCycle = input.runCycle ?? defaultRunCycle
  let stopped = false
  let activeRuns = 0

  const timer = setInterval(() => {
    if (stopped || activeRuns >= concurrency) {
      return
    }

    activeRuns += 1
    Promise.resolve(runCycle())
      .catch(() => false)
      .finally(() => {
        activeRuns = Math.max(0, activeRuns - 1)
      })
  }, intervalMs)

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    }
  }
}
