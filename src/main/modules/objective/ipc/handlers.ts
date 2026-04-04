import { ipcMain } from 'electron'
import {
  confirmAgentProposalInputSchema,
  createAgentObjectiveInputSchema,
  getAgentObjectiveInputSchema,
  getAgentThreadInputSchema,
  listAgentMemoriesInputSchema,
  listAgentObjectivesInputSchema,
  listObjectiveRuntimeEventsInputSchema,
  listAgentPolicyVersionsInputSchema,
  updateObjectiveRuntimeSettingsInputSchema,
  respondToAgentProposalInputSchema
} from '../../../../shared/schemas/objective'
import type { AppPaths } from '../../../services/appPaths'
import { createObjectiveModule } from '../runtime/createObjectiveModule'

export function registerObjectiveHandlers(appPaths: AppPaths) {
  const objectiveModule = createObjectiveModule(appPaths)

  ipcMain.removeHandler('archive:createAgentObjective')
  ipcMain.removeHandler('archive:refreshObjectiveTriggers')
  ipcMain.removeHandler('archive:listAgentObjectives')
  ipcMain.removeHandler('archive:getAgentObjective')
  ipcMain.removeHandler('archive:getAgentThread')
  ipcMain.removeHandler('archive:respondToAgentProposal')
  ipcMain.removeHandler('archive:confirmAgentProposal')
  ipcMain.removeHandler('archive:listAgentMemories')
  ipcMain.removeHandler('archive:listAgentPolicyVersions')
  ipcMain.removeHandler('archive:getObjectiveRuntimeScorecard')
  ipcMain.removeHandler('archive:listObjectiveRuntimeEvents')
  ipcMain.removeHandler('archive:getObjectiveRuntimeSettings')
  ipcMain.removeHandler('archive:updateObjectiveRuntimeSettings')

  ipcMain.handle('archive:createAgentObjective', async (_event, payload) => {
    const input = createAgentObjectiveInputSchema.parse(payload)
    return objectiveModule.createObjective(input)
  })

  ipcMain.handle('archive:refreshObjectiveTriggers', async () => {
    return objectiveModule.refreshObjectiveTriggers()
  })

  ipcMain.handle('archive:listAgentObjectives', async (_event, payload) => {
    const input = listAgentObjectivesInputSchema.parse(payload)
    return objectiveModule.listObjectives(input)
  })

  ipcMain.handle('archive:getAgentObjective', async (_event, payload) => {
    const input = getAgentObjectiveInputSchema.parse(payload)
    return objectiveModule.getObjectiveDetail(input)
  })

  ipcMain.handle('archive:getAgentThread', async (_event, payload) => {
    const input = getAgentThreadInputSchema.parse(payload)
    return objectiveModule.getThreadDetail(input)
  })

  ipcMain.handle('archive:respondToAgentProposal', async (_event, payload) => {
    const input = respondToAgentProposalInputSchema.parse(payload)
    return objectiveModule.respondToAgentProposal(input)
  })

  ipcMain.handle('archive:confirmAgentProposal', async (_event, payload) => {
    const input = confirmAgentProposalInputSchema.parse(payload)
    return objectiveModule.confirmAgentProposal(input)
  })

  ipcMain.handle('archive:listAgentMemories', async (_event, payload) => {
    const input = listAgentMemoriesInputSchema.parse(payload)
    return objectiveModule.listMemories(input)
  })

  ipcMain.handle('archive:listAgentPolicyVersions', async (_event, payload) => {
    const input = listAgentPolicyVersionsInputSchema.parse(payload)
    return objectiveModule.listPolicyVersions(input)
  })

  ipcMain.handle('archive:getObjectiveRuntimeScorecard', async () => {
    return objectiveModule.getRuntimeScorecard()
  })

  ipcMain.handle('archive:listObjectiveRuntimeEvents', async (_event, payload) => {
    const input = listObjectiveRuntimeEventsInputSchema.parse(payload)
    return objectiveModule.listRuntimeEvents(input)
  })

  ipcMain.handle('archive:getObjectiveRuntimeSettings', async () => {
    return objectiveModule.getRuntimeSettings()
  })

  ipcMain.handle('archive:updateObjectiveRuntimeSettings', async (_event, payload) => {
    const input = updateObjectiveRuntimeSettingsInputSchema.parse(payload)
    return objectiveModule.updateRuntimeSettings(input)
  })
}
