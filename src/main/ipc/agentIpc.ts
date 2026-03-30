import path from 'node:path'
import { ipcMain } from 'electron'
import {
  confirmAgentProposalInputSchema,
  createAgentObjectiveInputSchema,
  getAgentObjectiveInputSchema,
  getAgentThreadInputSchema,
  listAgentMemoriesInputSchema,
  listAgentObjectivesInputSchema,
  listAgentPolicyVersionsInputSchema,
  respondToAgentProposalInputSchema,
} from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import {
  listAgentMemories,
  listAgentPolicyVersions
} from '../services/agentPersistenceService'
import { createObjectiveRuntimeService } from '../services/objectiveRuntimeService'
import { createFacilitatorAgentService } from '../services/agents/facilitatorAgentService'
import { createRoleAgentRegistryService } from '../services/agents/roleAgentRegistryService'
import { createExternalVerificationBrokerService } from '../services/externalVerificationBrokerService'
import { createExternalWebSearchService } from '../services/externalWebSearchService'
import { createSubagentRegistryService } from '../services/subagentRegistryService'
import { openDatabase, runMigrations } from '../services/db'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function openArchiveDatabase(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)

  return db
}

function createArchiveObjectiveRuntime(appPaths: AppPaths) {
  const db = openArchiveDatabase(appPaths)
  const externalWebSearch = createExternalWebSearchService()

  const runtime = createObjectiveRuntimeService({
    db,
    facilitator: createFacilitatorAgentService(),
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: externalWebSearch.searchWeb,
      openSourcePage: externalWebSearch.openSourcePage
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: createRoleAgentRegistryService()
  })

  return {
    db,
    runtime
  }
}

async function withArchiveDatabase<T>(
  appPaths: AppPaths,
  work: (db: ReturnType<typeof openArchiveDatabase>) => Promise<T> | T
) {
  const db = openArchiveDatabase(appPaths)

  try {
    return await work(db)
  } finally {
    db.close()
  }
}

async function withArchiveObjectiveRuntime<T>(
  appPaths: AppPaths,
  work: (runtime: ReturnType<typeof createObjectiveRuntimeService>) => Promise<T> | T
) {
  const { db, runtime } = createArchiveObjectiveRuntime(appPaths)

  try {
    return await work(runtime)
  } finally {
    db.close()
  }
}

export function registerAgentIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:createAgentObjective')
  ipcMain.removeHandler('archive:listAgentObjectives')
  ipcMain.removeHandler('archive:getAgentObjective')
  ipcMain.removeHandler('archive:getAgentThread')
  ipcMain.removeHandler('archive:respondToAgentProposal')
  ipcMain.removeHandler('archive:confirmAgentProposal')
  ipcMain.removeHandler('archive:previewAgentTask')
  ipcMain.removeHandler('archive:runAgentTask')
  ipcMain.removeHandler('archive:listAgentRuns')
  ipcMain.removeHandler('archive:getAgentRun')
  ipcMain.removeHandler('archive:listAgentMemories')
  ipcMain.removeHandler('archive:listAgentPolicyVersions')
  ipcMain.removeHandler('archive:listAgentSuggestions')
  ipcMain.removeHandler('archive:refreshAgentSuggestions')
  ipcMain.removeHandler('archive:dismissAgentSuggestion')
  ipcMain.removeHandler('archive:runAgentSuggestion')
  ipcMain.removeHandler('archive:getAgentRuntimeSettings')
  ipcMain.removeHandler('archive:updateAgentRuntimeSettings')

  ipcMain.handle('archive:createAgentObjective', async (_event, payload) => {
    const input = createAgentObjectiveInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, async (runtime) => {
      const started = await runtime.startObjective({
        title: input.title,
        objectiveKind: input.objectiveKind,
        prompt: input.prompt,
        initiatedBy: input.initiatedBy
      })
      const detail = runtime.getObjectiveDetail({
        objectiveId: started.objective.objectiveId
      })
      if (!detail) {
        throw new Error(`objective not found after creation: ${started.objective.objectiveId}`)
      }

      return detail
    })
  })

  ipcMain.handle('archive:listAgentObjectives', async (_event, payload) => {
    const input = listAgentObjectivesInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, (runtime) => runtime.listObjectives(input))
  })

  ipcMain.handle('archive:getAgentObjective', async (_event, payload) => {
    const input = getAgentObjectiveInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, (runtime) => runtime.getObjectiveDetail(input))
  })

  ipcMain.handle('archive:getAgentThread', async (_event, payload) => {
    const input = getAgentThreadInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, (runtime) => runtime.getThreadDetail(input))
  })

  ipcMain.handle('archive:respondToAgentProposal', async (_event, payload) => {
    const input = respondToAgentProposalInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, (runtime) => runtime.respondToAgentProposal(input))
  })

  ipcMain.handle('archive:confirmAgentProposal', async (_event, payload) => {
    const input = confirmAgentProposalInputSchema.parse(payload)
    return withArchiveObjectiveRuntime(appPaths, (runtime) => runtime.confirmAgentProposal(input))
  })

  ipcMain.handle('archive:listAgentMemories', async (_event, payload) => {
    const input = listAgentMemoriesInputSchema.parse(payload)
    return withArchiveDatabase(appPaths, (db) => listAgentMemories(db, input))
  })

  ipcMain.handle('archive:listAgentPolicyVersions', async (_event, payload) => {
    const input = listAgentPolicyVersionsInputSchema.parse(payload)
    return withArchiveDatabase(appPaths, (db) => listAgentPolicyVersions(db, input))
  })
}
