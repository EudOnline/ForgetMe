import path from 'node:path'
import type { AppPaths } from './appPaths'
import { createAgentRuntime } from './agentRuntimeService'
import { createGovernanceAgentService } from './agents/governanceAgentService'
import { createIngestionAgentService } from './agents/ingestionAgentService'
import { createReviewAgentService } from './agents/reviewAgentService'
import { createWorkspaceAgentService } from './agents/workspaceAgentService'
import { openDatabase, runMigrations } from './db'

const DEFAULT_AGENT_PROACTIVE_RUNNER_INTERVAL_MS = 15_000

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function createAgentProactiveRunner(input: {
  appPaths: AppPaths
  intervalMs?: number
  runCycle?: () => Promise<unknown>
}) {
  const intervalMs = input.intervalMs ?? parsePositiveInteger(
    process.env.FORGETME_AGENT_PROACTIVE_RUNNER_INTERVAL_MS,
    DEFAULT_AGENT_PROACTIVE_RUNNER_INTERVAL_MS
  )

  const defaultRunCycle = async () => {
    const db = openDatabase(databasePath(input.appPaths))
    runMigrations(db)

    try {
      const runtime = createAgentRuntime({
        db,
        adapters: [
          createIngestionAgentService(),
          createReviewAgentService(),
          createWorkspaceAgentService({
            publicationRoot: path.join(input.appPaths.root, 'agent-draft-publications')
          }),
          createGovernanceAgentService()
        ]
      })

      runtime.refreshSuggestions()
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
