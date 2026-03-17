import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations, type ArchiveDatabase } from '../../../src/main/services/db'
import {
  listApprovedPersonaDraftProviderSends,
  sendApprovedPersonaDraftToProvider
} from '../../../src/main/services/approvedDraftProviderSendService'
import {
  claimNextApprovedDraftProviderSendRetryJob,
  createApprovedDraftProviderSendRetryRunner,
  runApprovedDraftProviderSendRetryCycle
} from '../../../src/main/services/approvedDraftProviderSendRetryRunnerService'
import { seedApprovedPersonaDraftHandoffScenario } from './helpers/memoryWorkspaceScenario'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-retry-runner-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function insertRetryJob(db: ArchiveDatabase, input: {
  id: string
  failedArtifactId: string
  status?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed'
  autoRetryAttemptIndex?: number
  nextRetryAt?: string
  claimedAt?: string | null
  retryArtifactId?: string | null
  lastErrorMessage?: string | null
  createdAt?: string
  updatedAt?: string
}) {
  const createdAt = input.createdAt ?? '2026-03-17T09:00:00.000Z'
  const updatedAt = input.updatedAt ?? createdAt

  db.prepare(
    `insert into persona_draft_provider_send_retry_jobs (
      id,
      failed_artifact_id,
      draft_review_id,
      source_turn_id,
      destination_id,
      destination_label,
      status,
      auto_retry_attempt_index,
      next_retry_at,
      claimed_at,
      retry_artifact_id,
      last_error_message,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.failedArtifactId,
    'review-1',
    'turn-1',
    'openrouter-qwen25-72b',
    'OpenRouter / qwen-2.5-72b-instruct',
    input.status ?? 'pending',
    input.autoRetryAttemptIndex ?? 1,
    input.nextRetryAt ?? '2026-03-17T09:00:30.000Z',
    input.claimedAt ?? null,
    input.retryArtifactId ?? null,
    input.lastErrorMessage ?? null,
    createdAt,
    updatedAt
  )
}

afterEach(() => {
  vi.useRealTimers()
  delete process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS
  vi.restoreAllMocks()
})

describe('approved draft provider send retry runner core', () => {
  it('claims the oldest due pending retry job and marks it processing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T09:01:00.000Z'))

    const db = setupDatabase()
    insertRetryJob(db, {
      id: 'job-late',
      failedArtifactId: 'artifact-late',
      nextRetryAt: '2026-03-17T09:00:45.000Z',
      createdAt: '2026-03-17T09:00:45.000Z',
      updatedAt: '2026-03-17T09:00:45.000Z'
    })
    insertRetryJob(db, {
      id: 'job-early',
      failedArtifactId: 'artifact-early',
      nextRetryAt: '2026-03-17T09:00:30.000Z',
      createdAt: '2026-03-17T09:00:30.000Z',
      updatedAt: '2026-03-17T09:00:30.000Z'
    })

    const claimed = claimNextApprovedDraftProviderSendRetryJob(db)

    expect(claimed).toEqual(expect.objectContaining({
      id: 'job-early',
      failedArtifactId: 'artifact-early',
      status: 'processing',
      claimedAt: '2026-03-17T09:01:00.000Z'
    }))
    expect(db.prepare(
      `select status, claimed_at as claimedAt
       from persona_draft_provider_send_retry_jobs
       where id = ?`
    ).get('job-early')).toEqual({
      status: 'processing',
      claimedAt: '2026-03-17T09:01:00.000Z'
    })

    db.close()
  })

  it('runs a due automatic retry job to completion and records the retry artifact', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel: vi.fn().mockRejectedValue(new Error('provider offline'))
    })).rejects.toThrow('provider offline')

    vi.setSystemTime(new Date('2026-03-16T10:01:00.000Z'))

    const processed = await runApprovedDraftProviderSendRetryCycle(db, {
      callModel: vi.fn().mockResolvedValue({
        provider: 'openrouter',
        model: 'qwen/qwen-2.5-72b-instruct',
        receivedAt: '2026-03-16T10:01:05.000Z',
        usage: { total_tokens: 15 },
        payload: {
          acknowledgement: 'received'
        }
      })
    })
    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })
    const originalFailedArtifact = history[1]

    expect(processed).toBe(true)
    expect(history[0]).toMatchObject({
      attemptKind: 'automatic_retry',
      retryOfArtifactId: originalFailedArtifact?.artifactId
    })
    expect(db.prepare(
      `select
        status,
        retry_artifact_id as retryArtifactId,
        last_error_message as lastErrorMessage
       from persona_draft_provider_send_retry_jobs
       where failed_artifact_id = ?`
    ).get(originalFailedArtifact?.artifactId)).toEqual({
      status: 'completed',
      retryArtifactId: history[0]?.artifactId,
      lastErrorMessage: null
    })

    db.close()
  })

  it('marks the current retry job failed when an automatic retry attempt errors', async () => {
    process.env.FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS = '2'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T11:00:00.000Z'))

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()

    await expect(sendApprovedPersonaDraftToProvider(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationId: 'openrouter-qwen25-72b',
      callModel: vi.fn().mockRejectedValue(new Error('provider offline'))
    })).rejects.toThrow('provider offline')

    const originalFailedArtifact = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })[0]

    vi.setSystemTime(new Date('2026-03-16T11:01:00.000Z'))

    const processed = await runApprovedDraftProviderSendRetryCycle(db, {
      callModel: vi.fn().mockRejectedValue(new Error('provider still offline'))
    })
    const history = listApprovedPersonaDraftProviderSends(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(processed).toBe(true)
    expect(history[0]).toMatchObject({
      attemptKind: 'automatic_retry',
      retryOfArtifactId: originalFailedArtifact?.artifactId,
      backgroundRetry: {
        status: 'pending',
        autoRetryAttemptIndex: 2,
        maxAutoRetryAttempts: 2
      }
    })
    expect(db.prepare(
      `select
        status,
        retry_artifact_id as retryArtifactId,
        last_error_message as lastErrorMessage
       from persona_draft_provider_send_retry_jobs
       where failed_artifact_id = ?`
    ).get(originalFailedArtifact?.artifactId)).toEqual({
      status: 'failed',
      retryArtifactId: null,
      lastErrorMessage: 'provider still offline'
    })

    db.close()
  })

  it('cancels stale retry jobs when the failed artifact is missing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T09:01:00.000Z'))

    const db = setupDatabase()
    insertRetryJob(db, {
      id: 'job-stale',
      failedArtifactId: 'missing-artifact'
    })

    const processed = await runApprovedDraftProviderSendRetryCycle(db)

    expect(processed).toBe(true)
    expect(db.prepare(
      `select status, retry_artifact_id as retryArtifactId
       from persona_draft_provider_send_retry_jobs
       where id = ?`
    ).get('job-stale')).toEqual({
      status: 'cancelled',
      retryArtifactId: null
    })

    db.close()
  })
})

describe('createApprovedDraftProviderSendRetryRunner', () => {
  it('starts a polling loop and can stop cleanly', async () => {
    vi.useFakeTimers()
    try {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-retry-runner-loop-'))
      const appPaths = ensureAppPaths(root)
      const runCycle = vi.fn().mockResolvedValue(false)

      const runner = createApprovedDraftProviderSendRetryRunner({
        appPaths,
        intervalMs: 20,
        runCycle
      })

      await vi.advanceTimersByTimeAsync(20)
      expect(runCycle).toHaveBeenCalledTimes(1)

      runner.stop()
      await vi.advanceTimersByTimeAsync(60)
      expect(runCycle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
