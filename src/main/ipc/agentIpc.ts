import path from 'node:path'
import { ipcMain } from 'electron'
import {
  getAgentRunInputSchema,
  listAgentMemoriesInputSchema,
  listAgentPolicyVersionsInputSchema,
  listAgentRunsInputSchema,
  runAgentTaskInputSchema
} from '../../shared/ipcSchemas'
import type { RunAgentTaskInput } from '../../shared/archiveContracts'
import type { AppPaths } from '../services/appPaths'
import { createAgentRuntime } from '../services/agentRuntimeService'
import { createGovernanceAgentService } from '../services/agents/governanceAgentService'
import { createIngestionAgentService } from '../services/agents/ingestionAgentService'
import { createReviewAgentService } from '../services/agents/reviewAgentService'
import { createWorkspaceAgentService } from '../services/agents/workspaceAgentService'
import { openDatabase, runMigrations } from '../services/db'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function createArchiveAgentRuntime(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)

  const runtime = createAgentRuntime({
    db,
    adapters: [
      createIngestionAgentService(),
      createReviewAgentService(),
      createWorkspaceAgentService({
        publicationRoot: path.join(appPaths.root, 'agent-draft-publications')
      }),
      createGovernanceAgentService()
    ]
  })

  return {
    db,
    runtime
  }
}

async function withArchiveAgentRuntime<T>(
  appPaths: AppPaths,
  work: (runtime: ReturnType<typeof createAgentRuntime>) => Promise<T> | T
) {
  const { db, runtime } = createArchiveAgentRuntime(appPaths)

  try {
    return await work(runtime)
  } finally {
    db.close()
  }
}

export function registerAgentIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:runAgentTask')
  ipcMain.removeHandler('archive:listAgentRuns')
  ipcMain.removeHandler('archive:getAgentRun')
  ipcMain.removeHandler('archive:listAgentMemories')
  ipcMain.removeHandler('archive:listAgentPolicyVersions')

  ipcMain.handle('archive:runAgentTask', async (_event, payload) => {
    const input = runAgentTaskInputSchema.parse(payload) as RunAgentTaskInput
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.runTask(input))
  })

  ipcMain.handle('archive:listAgentRuns', async (_event, payload) => {
    const input = listAgentRunsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.listRuns(input))
  })

  ipcMain.handle('archive:getAgentRun', async (_event, payload) => {
    const input = getAgentRunInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.getRun(input))
  })

  ipcMain.handle('archive:listAgentMemories', async (_event, payload) => {
    const input = listAgentMemoriesInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.listMemories(input))
  })

  ipcMain.handle('archive:listAgentPolicyVersions', async (_event, payload) => {
    const input = listAgentPolicyVersionsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.listPolicyVersions(input))
  })
}
