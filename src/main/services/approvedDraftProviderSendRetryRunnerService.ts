import path from 'node:path'
import type { AppPaths } from './appPaths'
import type { ArchiveDatabase } from './db'
import { openDatabase, runMigrations } from './db'
import { retryApprovedPersonaDraftProviderSend } from './approvedDraftProviderSendService'

const DEFAULT_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS = 5_000

type ApprovedDraftProviderSendRetryJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'

type ApprovedDraftProviderSendRetryJobRow = {
  id: string
  failedArtifactId: string
  draftReviewId: string
  sourceTurnId: string
  destinationId: string | null
  destinationLabel: string | null
  status: ApprovedDraftProviderSendRetryJobStatus
  autoRetryAttemptIndex: number
  nextRetryAt: string
  claimedAt: string | null
  retryArtifactId: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

type RetryCallModel = NonNullable<Parameters<typeof retryApprovedPersonaDraftProviderSend>[1]['callModel']>

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
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

function getApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, jobId: string) {
  const row = db.prepare(
    `select
      id,
      failed_artifact_id as failedArtifactId,
      draft_review_id as draftReviewId,
      source_turn_id as sourceTurnId,
      destination_id as destinationId,
      destination_label as destinationLabel,
      status,
      auto_retry_attempt_index as autoRetryAttemptIndex,
      next_retry_at as nextRetryAt,
      claimed_at as claimedAt,
      retry_artifact_id as retryArtifactId,
      last_error_message as lastErrorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     from persona_draft_provider_send_retry_jobs
     where id = ?`
  ).get(jobId) as ApprovedDraftProviderSendRetryJobRow | undefined

  if (!row) {
    throw new Error(`Approved draft provider send retry job not found: ${jobId}`)
  }

  return row
}

function failedArtifactHasChildRetry(db: ArchiveDatabase, failedArtifactId: string) {
  const row = db.prepare(
    `select id
     from persona_draft_provider_egress_artifacts
     where retry_of_artifact_id = ?
     limit 1`
  ).get(failedArtifactId) as {
    id: string
  } | undefined

  return Boolean(row)
}

function failedArtifactLatestEventType(db: ArchiveDatabase, failedArtifactId: string) {
  const row = db.prepare(
    `select event_type as eventType
     from persona_draft_provider_egress_events
     where artifact_id = ?
     order by created_at desc, rowid desc
     limit 1`
  ).get(failedArtifactId) as {
    eventType: 'request' | 'response' | 'error'
  } | undefined

  return row?.eventType ?? null
}

export function claimNextApprovedDraftProviderSendRetryJob(db: ArchiveDatabase) {
  return inTransaction(db, () => {
    const now = new Date().toISOString()
    const nextJob = db.prepare(
      `select
        id,
        failed_artifact_id as failedArtifactId,
        draft_review_id as draftReviewId,
        source_turn_id as sourceTurnId,
        destination_id as destinationId,
        destination_label as destinationLabel,
        status,
        auto_retry_attempt_index as autoRetryAttemptIndex,
        next_retry_at as nextRetryAt,
        claimed_at as claimedAt,
        retry_artifact_id as retryArtifactId,
        last_error_message as lastErrorMessage,
        created_at as createdAt,
        updated_at as updatedAt
       from persona_draft_provider_send_retry_jobs
       where status = 'pending'
         and next_retry_at <= ?
       order by next_retry_at asc, created_at asc, id asc
       limit 1`
    ).get(now) as ApprovedDraftProviderSendRetryJobRow | undefined

    if (!nextJob) {
      return null
    }

    db.prepare(
      `update persona_draft_provider_send_retry_jobs
       set status = ?,
           claimed_at = ?,
           updated_at = ?
       where id = ?`
    ).run('processing', now, now, nextJob.id)

    return getApprovedDraftProviderSendRetryJob(db, nextJob.id)
  })
}

export function completeApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, input: {
  jobId: string
  retryArtifactId: string
}) {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update persona_draft_provider_send_retry_jobs
     set status = ?,
         retry_artifact_id = ?,
         last_error_message = null,
         updated_at = ?
     where id = ?`
  ).run('completed', input.retryArtifactId, updatedAt, input.jobId)

  return getApprovedDraftProviderSendRetryJob(db, input.jobId)
}

export function failApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, input: {
  jobId: string
  errorMessage: string
}) {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update persona_draft_provider_send_retry_jobs
     set status = ?,
         last_error_message = ?,
         updated_at = ?
     where id = ?`
  ).run('failed', input.errorMessage, updatedAt, input.jobId)

  return getApprovedDraftProviderSendRetryJob(db, input.jobId)
}

export function cancelApprovedDraftProviderSendRetryJob(db: ArchiveDatabase, input: {
  jobId: string
}) {
  const updatedAt = new Date().toISOString()
  db.prepare(
    `update persona_draft_provider_send_retry_jobs
     set status = ?,
         updated_at = ?
     where id = ?`
  ).run('cancelled', updatedAt, input.jobId)

  return getApprovedDraftProviderSendRetryJob(db, input.jobId)
}

export async function runApprovedDraftProviderSendRetryCycle(
  db: ArchiveDatabase,
  input?: {
    callModel?: RetryCallModel
  }
) {
  const job = claimNextApprovedDraftProviderSendRetryJob(db)
  if (!job) {
    return false
  }

  const artifactExists = db.prepare(
    `select id
     from persona_draft_provider_egress_artifacts
     where id = ?`
  ).get(job.failedArtifactId) as {
    id: string
  } | undefined

  if (
    !artifactExists
    || failedArtifactLatestEventType(db, job.failedArtifactId) !== 'error'
    || failedArtifactHasChildRetry(db, job.failedArtifactId)
  ) {
    cancelApprovedDraftProviderSendRetryJob(db, { jobId: job.id })
    return true
  }

  try {
    const retried = await retryApprovedPersonaDraftProviderSend(db, {
      artifactId: job.failedArtifactId,
      attemptKind: 'automatic_retry',
      callModel: input?.callModel
    })

    if (!retried) {
      cancelApprovedDraftProviderSendRetryJob(db, { jobId: job.id })
      return true
    }

    completeApprovedDraftProviderSendRetryJob(db, {
      jobId: job.id,
      retryArtifactId: retried.artifactId
    })
    return true
  } catch (error) {
    failApprovedDraftProviderSendRetryJob(db, {
      jobId: job.id,
      errorMessage: error instanceof Error ? error.message : String(error)
    })
    return true
  }
}

export function createApprovedDraftProviderSendRetryRunner(input: {
  appPaths: AppPaths
  intervalMs?: number
  runCycle?: () => Promise<boolean>
}) {
  const intervalMs = input.intervalMs ?? parsePositiveInteger(
    process.env.FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS,
    DEFAULT_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS
  )

  const defaultRunCycle = async () => {
    const db = openDatabase(databasePath(input.appPaths))
    runMigrations(db)

    try {
      return await runApprovedDraftProviderSendRetryCycle(db)
    } finally {
      db.close()
    }
  }

  const runCycle = input.runCycle ?? defaultRunCycle
  let stopped = false
  let activeRun = false

  const timer = setInterval(() => {
    if (stopped || activeRun) {
      return
    }

    activeRun = true
    Promise.resolve(runCycle())
      .catch(() => false)
      .finally(() => {
        activeRun = false
      })
  }, intervalMs)

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    }
  }
}
