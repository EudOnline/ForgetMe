import path from 'node:path'
import type { AppPaths } from './appPaths'
import { openDatabase, runMigrations } from './db'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  getPersonAgentCapsule,
  getPersonAgentRuntimeRunnerState,
  upsertPersonAgentRuntimeRunnerState
} from './governancePersistenceService'
import { runPersonAgentCapsuleBackfill } from './personAgentCapsuleBackfillService'
import { processNextPersonAgentRefresh } from './personAgentRefreshService'
import { syncPersonAgentCapsuleRuntimeArtifacts } from './personAgentCapsuleRuntimeArtifactsService'
import { processPersonAgentRuntimeLoop } from './personAgentRuntimeService'

const DEFAULT_PERSON_AGENT_RUNTIME_RUNNER_INTERVAL_MS = 5_000
const DEFAULT_PERSON_AGENT_RUNTIME_RUNNER_BATCH_LIMIT = 4
export const PERSON_AGENT_RUNTIME_RUNNER_NAME = 'person_agent_runtime'

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function runPersonAgentRuntimeStartupRepairs(input: {
  appPaths: AppPaths
  now?: string
  limit?: number
  runBackfill?: typeof runPersonAgentCapsuleBackfill
}) {
  const runBackfill = input.runBackfill ?? runPersonAgentCapsuleBackfill
  return runBackfill({
    appPaths: input.appPaths,
    now: input.now,
    limit: input.limit
  })
}

export function runPersonAgentRuntimeRunnerCycle(
  db: ArchiveDatabase,
  input: {
    appPaths?: AppPaths
    limit?: number
    source?: string
    now?: string
    runnerName?: string
    processNextRefresh?: typeof processNextPersonAgentRefresh
    processRuntimeLoop?: typeof processPersonAgentRuntimeLoop
    syncRuntimeArtifacts?: typeof syncPersonAgentCapsuleRuntimeArtifacts
  } = {}
) {
  const now = input.now ?? new Date().toISOString()
  const runnerName = input.runnerName ?? PERSON_AGENT_RUNTIME_RUNNER_NAME
  const processNextRefresh = input.processNextRefresh ?? processNextPersonAgentRefresh
  const processRuntimeLoop = input.processRuntimeLoop ?? processPersonAgentRuntimeLoop
  const syncRuntimeArtifacts = input.syncRuntimeArtifacts ?? syncPersonAgentCapsuleRuntimeArtifacts
  const existingState = getPersonAgentRuntimeRunnerState(db, {
    runnerName
  })

  upsertPersonAgentRuntimeRunnerState(db, {
    runnerName,
    status: 'running',
    lastStartedAt: now,
    lastCompletedAt: existingState?.lastCompletedAt ?? null,
    lastFailedAt: existingState?.lastFailedAt ?? null,
    lastProcessedTaskCount: existingState?.lastProcessedTaskCount ?? 0,
    totalProcessedTaskCount: existingState?.totalProcessedTaskCount ?? 0,
    lastError: null,
    updatedAt: now
  })

  try {
    const refreshRuns = [] as ReturnType<typeof processPersonAgentRuntimeLoop>
    const refreshed = processNextRefresh(db, {
      appPaths: input.appPaths,
      now,
      processRuntimeLoop(runtimeDb, refreshInput) {
        const runs = processRuntimeLoop(runtimeDb, refreshInput)
        refreshRuns.push(...runs)
        return runs
      }
    })
    const backgroundRuns = processRuntimeLoop(db, {
      limit: input.limit,
      source: input.source ?? 'background_runner',
      now
    })
    const runs = [...refreshRuns, ...backgroundRuns]
    const processedTaskCount = runs.length

    upsertPersonAgentRuntimeRunnerState(db, {
      runnerName,
      status: 'idle',
      lastStartedAt: now,
      lastCompletedAt: now,
      lastFailedAt: existingState?.lastFailedAt ?? null,
      lastProcessedTaskCount: processedTaskCount,
      totalProcessedTaskCount: (existingState?.totalProcessedTaskCount ?? 0) + processedTaskCount,
      lastError: null,
      updatedAt: now
    })

    const latestRun = runs[0] ?? null
    if (latestRun) {
      const personAgent = getPersonAgentByCanonicalPersonId(db, {
        canonicalPersonId: latestRun.canonicalPersonId
      })
      const capsule = getPersonAgentCapsule(db, {
        personAgentId: latestRun.personAgentId,
        canonicalPersonId: latestRun.canonicalPersonId
      })

      if (personAgent && capsule) {
        syncRuntimeArtifacts(db, {
          capsule,
          personAgent,
          now
        })
      }
    }

    return Boolean(refreshed) || processedTaskCount > 0
  } catch (error) {
    upsertPersonAgentRuntimeRunnerState(db, {
      runnerName,
      status: 'error',
      lastStartedAt: now,
      lastCompletedAt: existingState?.lastCompletedAt ?? null,
      lastFailedAt: now,
      lastProcessedTaskCount: 0,
      totalProcessedTaskCount: existingState?.totalProcessedTaskCount ?? 0,
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: now
    })
    throw error
  }
}

export function createPersonAgentRuntimeRunner(input: {
  appPaths: AppPaths
  intervalMs?: number
  limit?: number
  runCycle?: () => Promise<boolean>
}) {
  const intervalMs = input.intervalMs ?? parsePositiveInteger(
    process.env.FORGETME_PERSON_AGENT_RUNTIME_RUNNER_INTERVAL_MS,
    DEFAULT_PERSON_AGENT_RUNTIME_RUNNER_INTERVAL_MS
  )
  const limit = input.limit ?? parsePositiveInteger(
    process.env.FORGETME_PERSON_AGENT_RUNTIME_RUNNER_BATCH_LIMIT,
    DEFAULT_PERSON_AGENT_RUNTIME_RUNNER_BATCH_LIMIT
  )

  const defaultRunCycle = async () => {
    const db = openDatabase(databasePath(input.appPaths))
    runMigrations(db)

    try {
      return runPersonAgentRuntimeRunnerCycle(db, {
        appPaths: input.appPaths,
        limit,
        source: 'background_runner'
      })
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
