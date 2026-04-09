import path from 'node:path'
import type { AppPaths } from './appPaths'
import { openDatabase, runMigrations } from './db'
import { processPersonAgentTaskQueue } from './personAgentTaskService'

const DEFAULT_PERSON_AGENT_TASK_QUEUE_RUNNER_INTERVAL_MS = 5_000
const DEFAULT_PERSON_AGENT_TASK_QUEUE_RUNNER_BATCH_LIMIT = 4

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function runPersonAgentTaskQueueCycle(
  db: Parameters<typeof processPersonAgentTaskQueue>[0],
  input: {
    limit?: number
    source?: string
    now?: string
  } = {}
) {
  const runs = processPersonAgentTaskQueue(db, {
    limit: input.limit,
    source: input.source ?? 'background_runner',
    now: input.now
  })

  return runs.length > 0
}

export function createPersonAgentTaskQueueRunner(input: {
  appPaths: AppPaths
  intervalMs?: number
  limit?: number
  runCycle?: () => Promise<boolean>
}) {
  const intervalMs = input.intervalMs ?? parsePositiveInteger(
    process.env.FORGETME_PERSON_AGENT_TASK_QUEUE_RUNNER_INTERVAL_MS,
    DEFAULT_PERSON_AGENT_TASK_QUEUE_RUNNER_INTERVAL_MS
  )
  const limit = input.limit ?? parsePositiveInteger(
    process.env.FORGETME_PERSON_AGENT_TASK_QUEUE_RUNNER_BATCH_LIMIT,
    DEFAULT_PERSON_AGENT_TASK_QUEUE_RUNNER_BATCH_LIMIT
  )

  const defaultRunCycle = async () => {
    const db = openDatabase(databasePath(input.appPaths))
    runMigrations(db)

    try {
      return runPersonAgentTaskQueueCycle(db, {
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
