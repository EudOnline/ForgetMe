import path from 'node:path'
import { ipcMain } from 'electron'
import {
  confirmAgentProposalInputSchema,
  createAgentObjectiveInputSchema,
  dismissAgentSuggestionInputSchema,
  getAgentRuntimeSettingsInputSchema,
  getAgentRunInputSchema,
  getAgentObjectiveInputSchema,
  getAgentThreadInputSchema,
  listAgentMemoriesInputSchema,
  listAgentObjectivesInputSchema,
  listAgentSuggestionsInputSchema,
  listAgentPolicyVersionsInputSchema,
  listAgentRunsInputSchema,
  previewAgentTaskInputSchema,
  refreshAgentSuggestionsInputSchema,
  respondToAgentProposalInputSchema,
  runAgentSuggestionInputSchema,
  runAgentTaskInputSchema,
  updateAgentRuntimeSettingsInputSchema
} from '../../shared/ipcSchemas'
import type { RunAgentTaskInput } from '../../shared/archiveContracts'
import type { AppPaths } from '../services/appPaths'
import { createAgentRuntime } from '../services/agentRuntimeService'
import { createObjectiveRuntimeService } from '../services/objectiveRuntimeService'
import { createFacilitatorAgentService } from '../services/agents/facilitatorAgentService'
import { createGovernanceAgentService } from '../services/agents/governanceAgentService'
import { createIngestionAgentService } from '../services/agents/ingestionAgentService'
import { createReviewAgentService } from '../services/agents/reviewAgentService'
import { createWorkspaceAgentService } from '../services/agents/workspaceAgentService'
import { createExternalVerificationBrokerService } from '../services/externalVerificationBrokerService'
import { createExternalWebSearchService } from '../services/externalWebSearchService'
import { createSubagentRegistryService } from '../services/subagentRegistryService'
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

function createArchiveObjectiveRuntime(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)
  const externalWebSearch = createExternalWebSearchService()

  const runtime = createObjectiveRuntimeService({
    db,
    facilitator: createFacilitatorAgentService(),
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: externalWebSearch.searchWeb,
      openSourcePage: externalWebSearch.openSourcePage
    }),
    subagentRegistry: createSubagentRegistryService()
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
    return withArchiveObjectiveRuntime(appPaths, (runtime) => {
      const started = runtime.startObjective({
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

  ipcMain.handle('archive:previewAgentTask', async (_event, payload) => {
    const input = previewAgentTaskInputSchema.parse(payload) as RunAgentTaskInput
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.previewTask(input))
  })

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

  ipcMain.handle('archive:listAgentSuggestions', async (_event, payload) => {
    const input = listAgentSuggestionsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.listSuggestions(input))
  })

  ipcMain.handle('archive:refreshAgentSuggestions', async (_event, payload) => {
    refreshAgentSuggestionsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.refreshSuggestions())
  })

  ipcMain.handle('archive:dismissAgentSuggestion', async (_event, payload) => {
    const input = dismissAgentSuggestionInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.dismissSuggestion(input))
  })

  ipcMain.handle('archive:runAgentSuggestion', async (_event, payload) => {
    const input = runAgentSuggestionInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.runSuggestion(input))
  })

  ipcMain.handle('archive:getAgentRuntimeSettings', async (_event, payload) => {
    getAgentRuntimeSettingsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.getRuntimeSettings())
  })

  ipcMain.handle('archive:updateAgentRuntimeSettings', async (_event, payload) => {
    const input = updateAgentRuntimeSettingsInputSchema.parse(payload)
    return withArchiveAgentRuntime(appPaths, (runtime) => runtime.updateRuntimeSettings(input))
  })
}
