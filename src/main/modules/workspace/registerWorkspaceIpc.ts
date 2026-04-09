import { ipcMain } from 'electron'
import {
  askPersonAgentConsultationInputSchema,
  askMemoryWorkspaceInputSchema,
  askMemoryWorkspacePersistedInputSchema,
  approvedPersonaDraftReviewIdSchema,
  exportApprovedPersonaDraftInputSchema,
  getPersonAgentConsultationSessionInputSchema,
  getPersonAgentInspectionBundleInputSchema,
  listApprovedPersonaDraftHandoffsInputSchema,
  listPersonAgentConsultationSessionsInputSchema,
  listPersonAgentAuditEventsInputSchema,
  listApprovedPersonaDraftHostedShareLinksInputSchema,
  listApprovedPersonaDraftPublicationsInputSchema,
  listApprovedPersonaDraftProviderSendsInputSchema,
  createPersonaDraftReviewFromTurnInputSchema,
  getPersonAgentMemorySummaryInputSchema,
  getPersonAgentRuntimeStateInputSchema,
  getPersonAgentStateInputSchema,
  getPersonaDraftReviewByTurnInputSchema,
  executePersonAgentTaskInputSchema,
  listPersonAgentTasksInputSchema,
  listPersonAgentTaskRunsInputSchema,
  listPersonAgentRefreshQueueInputSchema,
  memoryWorkspaceCompareMatrixIdSchema,
  memoryWorkspaceCompareSessionFilterSchema,
  memoryWorkspaceCompareSessionIdSchema,
  memoryWorkspaceSessionFilterSchema,
  memoryWorkspaceSessionIdSchema,
  openApprovedDraftHostedShareLinkInputSchema,
  retryApprovedPersonaDraftProviderSendInputSchema,
  revokeApprovedPersonaDraftHostedShareLinkInputSchema,
  runMemoryWorkspaceCompareInputSchema,
  runMemoryWorkspaceCompareMatrixInputSchema,
  openApprovedDraftPublicationEntryInputSchema,
  publishApprovedPersonaDraftInputSchema,
  sendApprovedPersonaDraftToProviderInputSchema,
  transitionPersonAgentTaskInputSchema,
  transitionPersonaDraftReviewInputSchema,
  updatePersonaDraftReviewInputSchema
} from '../../../shared/schemas/workspace'
import type { AppPaths } from '../../services/appPaths'
import { createWorkspaceModule } from './runtime/createWorkspaceModule'

export function registerWorkspaceIpc(appPaths: AppPaths) {
  const workspaceModule = createWorkspaceModule(appPaths)
  ipcMain.removeHandler('archive:askMemoryWorkspace')
  ipcMain.removeHandler('archive:listMemoryWorkspaceSessions')
  ipcMain.removeHandler('archive:getMemoryWorkspaceSession')
  ipcMain.removeHandler('archive:askMemoryWorkspacePersisted')
  ipcMain.removeHandler('archive:askPersonAgentConsultation')
  ipcMain.removeHandler('archive:listPersonAgentConsultationSessions')
  ipcMain.removeHandler('archive:getPersonAgentConsultationSession')
  ipcMain.removeHandler('archive:getPersonAgentRuntimeState')
  ipcMain.removeHandler('archive:getPersonAgentTaskQueueRunnerState')
  ipcMain.removeHandler('archive:getPersonAgentState')
  ipcMain.removeHandler('archive:listPersonAgentRefreshQueue')
  ipcMain.removeHandler('archive:listPersonAgentAuditEvents')
  ipcMain.removeHandler('archive:listPersonAgentTasks')
  ipcMain.removeHandler('archive:transitionPersonAgentTask')
  ipcMain.removeHandler('archive:listPersonAgentTaskRuns')
  ipcMain.removeHandler('archive:executePersonAgentTask')
  ipcMain.removeHandler('archive:getPersonAgentMemorySummary')
  ipcMain.removeHandler('archive:getPersonAgentInspectionBundle')
  ipcMain.removeHandler('archive:runMemoryWorkspaceCompare')
  ipcMain.removeHandler('archive:listMemoryWorkspaceCompareSessions')
  ipcMain.removeHandler('archive:getMemoryWorkspaceCompareSession')
  ipcMain.removeHandler('archive:runMemoryWorkspaceCompareMatrix')
  ipcMain.removeHandler('archive:listMemoryWorkspaceCompareMatrices')
  ipcMain.removeHandler('archive:getMemoryWorkspaceCompareMatrix')
  ipcMain.removeHandler('archive:getPersonaDraftReviewByTurn')
  ipcMain.removeHandler('archive:createPersonaDraftReviewFromTurn')
  ipcMain.removeHandler('archive:updatePersonaDraftReview')
  ipcMain.removeHandler('archive:transitionPersonaDraftReview')
  ipcMain.removeHandler('archive:selectPersonaDraftHandoffDestination')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftHandoffs')
  ipcMain.removeHandler('archive:exportApprovedPersonaDraft')
  ipcMain.removeHandler('archive:selectApprovedDraftPublicationDestination')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftPublications')
  ipcMain.removeHandler('archive:publishApprovedPersonaDraft')
  ipcMain.removeHandler('archive:openApprovedDraftPublicationEntry')
  ipcMain.removeHandler('archive:getApprovedDraftHostedShareHostStatus')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftHostedShareLinks')
  ipcMain.removeHandler('archive:createApprovedPersonaDraftHostedShareLink')
  ipcMain.removeHandler('archive:revokeApprovedPersonaDraftHostedShareLink')
  ipcMain.removeHandler('archive:openApprovedDraftHostedShareLink')
  ipcMain.removeHandler('archive:listApprovedDraftSendDestinations')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftProviderSends')
  ipcMain.removeHandler('archive:sendApprovedPersonaDraftToProvider')
  ipcMain.removeHandler('archive:retryApprovedPersonaDraftProviderSend')

  ipcMain.handle('archive:askMemoryWorkspace', async (_event, payload) => {
    const input = askMemoryWorkspaceInputSchema.parse(payload)
    return workspaceModule.ask(input)
  })

  ipcMain.handle('archive:listMemoryWorkspaceSessions', async (_event, payload) => {
    const input = memoryWorkspaceSessionFilterSchema.parse(payload)
    return workspaceModule.listSessions(input)
  })

  ipcMain.handle('archive:getMemoryWorkspaceSession', async (_event, payload) => {
    const input = memoryWorkspaceSessionIdSchema.parse(payload)
    return workspaceModule.getSession(input)
  })

  ipcMain.handle('archive:askMemoryWorkspacePersisted', async (_event, payload) => {
    const input = askMemoryWorkspacePersistedInputSchema.parse(payload)
    return workspaceModule.askPersisted(input)
  })

  ipcMain.handle('archive:askPersonAgentConsultation', async (_event, payload) => {
    const input = askPersonAgentConsultationInputSchema.parse(payload)
    return workspaceModule.askPersonAgentConsultation(input)
  })

  ipcMain.handle('archive:listPersonAgentConsultationSessions', async (_event, payload) => {
    const input = listPersonAgentConsultationSessionsInputSchema.parse(payload)
    return workspaceModule.listPersonAgentConsultationSessions(input)
  })

  ipcMain.handle('archive:getPersonAgentConsultationSession', async (_event, payload) => {
    const input = getPersonAgentConsultationSessionInputSchema.parse(payload)
    return workspaceModule.getPersonAgentConsultationSession(input)
  })

  ipcMain.handle('archive:getPersonAgentRuntimeState', async (_event, payload) => {
    const input = getPersonAgentRuntimeStateInputSchema.parse(payload)
    return workspaceModule.getPersonAgentRuntimeState(input)
  })

  ipcMain.handle('archive:getPersonAgentTaskQueueRunnerState', async () => {
    return workspaceModule.getPersonAgentTaskQueueRunnerState()
  })

  ipcMain.handle('archive:getPersonAgentState', async (_event, payload) => {
    const input = getPersonAgentStateInputSchema.parse(payload)
    return workspaceModule.getPersonAgentState(input)
  })

  ipcMain.handle('archive:listPersonAgentRefreshQueue', async (_event, payload) => {
    const input = listPersonAgentRefreshQueueInputSchema.parse(payload)
    return workspaceModule.listPersonAgentRefreshQueue(input)
  })

  ipcMain.handle('archive:listPersonAgentAuditEvents', async (_event, payload) => {
    const input = listPersonAgentAuditEventsInputSchema.parse(payload)
    return workspaceModule.listPersonAgentAuditEvents(input)
  })

  ipcMain.handle('archive:listPersonAgentTasks', async (_event, payload) => {
    const input = listPersonAgentTasksInputSchema.parse(payload)
    return workspaceModule.listPersonAgentTasks(input)
  })

  ipcMain.handle('archive:transitionPersonAgentTask', async (_event, payload) => {
    const input = transitionPersonAgentTaskInputSchema.parse(payload)
    return workspaceModule.transitionPersonAgentTask(input)
  })

  ipcMain.handle('archive:listPersonAgentTaskRuns', async (_event, payload) => {
    const input = listPersonAgentTaskRunsInputSchema.parse(payload)
    return workspaceModule.listPersonAgentTaskRuns(input)
  })

  ipcMain.handle('archive:executePersonAgentTask', async (_event, payload) => {
    const input = executePersonAgentTaskInputSchema.parse(payload)
    return workspaceModule.executePersonAgentTask(input)
  })

  ipcMain.handle('archive:getPersonAgentMemorySummary', async (_event, payload) => {
    const input = getPersonAgentMemorySummaryInputSchema.parse(payload)
    return workspaceModule.getPersonAgentMemorySummary(input)
  })

  ipcMain.handle('archive:getPersonAgentInspectionBundle', async (_event, payload) => {
    const input = getPersonAgentInspectionBundleInputSchema.parse(payload)
    return workspaceModule.getPersonAgentInspectionBundle(input)
  })

  ipcMain.handle('archive:runMemoryWorkspaceCompare', async (_event, payload) => {
    const input = runMemoryWorkspaceCompareInputSchema.parse(payload)
    return workspaceModule.runCompare(input)
  })

  ipcMain.handle('archive:listMemoryWorkspaceCompareSessions', async (_event, payload) => {
    const input = memoryWorkspaceCompareSessionFilterSchema.parse(payload)
    return workspaceModule.listCompareSessions(input)
  })

  ipcMain.handle('archive:getMemoryWorkspaceCompareSession', async (_event, payload) => {
    const input = memoryWorkspaceCompareSessionIdSchema.parse(payload)
    return workspaceModule.getCompareSession(input)
  })

  ipcMain.handle('archive:runMemoryWorkspaceCompareMatrix', async (_event, payload) => {
    const input = runMemoryWorkspaceCompareMatrixInputSchema.parse(payload)
    return workspaceModule.runCompareMatrix(input)
  })

  ipcMain.handle('archive:listMemoryWorkspaceCompareMatrices', async () => {
    return workspaceModule.listCompareMatrices()
  })

  ipcMain.handle('archive:getMemoryWorkspaceCompareMatrix', async (_event, payload) => {
    const input = memoryWorkspaceCompareMatrixIdSchema.parse(payload)
    return workspaceModule.getCompareMatrix(input)
  })

  ipcMain.handle('archive:getPersonaDraftReviewByTurn', async (_event, payload) => {
    const input = getPersonaDraftReviewByTurnInputSchema.parse(payload)
    return workspaceModule.getDraftReviewByTurn(input)
  })

  ipcMain.handle('archive:createPersonaDraftReviewFromTurn', async (_event, payload) => {
    const input = createPersonaDraftReviewFromTurnInputSchema.parse(payload)
    return workspaceModule.createDraftReviewFromTurn(input)
  })

  ipcMain.handle('archive:updatePersonaDraftReview', async (_event, payload) => {
    const input = updatePersonaDraftReviewInputSchema.parse(payload)
    return workspaceModule.updateDraftReview(input)
  })

  ipcMain.handle('archive:transitionPersonaDraftReview', async (_event, payload) => {
    const input = transitionPersonaDraftReviewInputSchema.parse(payload)
    return workspaceModule.transitionDraftReview(input)
  })

  ipcMain.handle('archive:selectPersonaDraftHandoffDestination', async () => {
    return workspaceModule.selectDraftHandoffDestination()
  })

  ipcMain.handle('archive:listApprovedPersonaDraftHandoffs', async (_event, payload) => {
    const input = listApprovedPersonaDraftHandoffsInputSchema.parse(payload)
    return workspaceModule.listApprovedDraftHandoffs(input)
  })

  ipcMain.handle('archive:exportApprovedPersonaDraft', async (_event, payload) => {
    const input = exportApprovedPersonaDraftInputSchema.parse(payload)
    return workspaceModule.exportApprovedDraft(input)
  })

  ipcMain.handle('archive:selectApprovedDraftPublicationDestination', async () => {
    return workspaceModule.selectPublicationDestination()
  })

  ipcMain.handle('archive:listApprovedPersonaDraftPublications', async (_event, payload) => {
    const input = listApprovedPersonaDraftPublicationsInputSchema.parse(payload)
    return workspaceModule.listApprovedDraftPublications(input)
  })

  ipcMain.handle('archive:publishApprovedPersonaDraft', async (_event, payload) => {
    const input = publishApprovedPersonaDraftInputSchema.parse(payload)
    return workspaceModule.publishApprovedDraft(input)
  })

  ipcMain.handle('archive:openApprovedDraftPublicationEntry', async (_event, payload) => {
    const input = openApprovedDraftPublicationEntryInputSchema.parse(payload)
    return workspaceModule.openApprovedDraftPublicationEntry(input)
  })

  ipcMain.handle('archive:getApprovedDraftHostedShareHostStatus', async () => {
    return workspaceModule.getHostedShareHostStatus()
  })

  ipcMain.handle('archive:listApprovedPersonaDraftHostedShareLinks', async (_event, payload) => {
    const input = listApprovedPersonaDraftHostedShareLinksInputSchema.parse(payload)
    return workspaceModule.listHostedShareLinks(input)
  })

  ipcMain.handle('archive:createApprovedPersonaDraftHostedShareLink', async (_event, payload) => {
    const input = approvedPersonaDraftReviewIdSchema.parse(payload)
    return workspaceModule.createHostedShareLink(input)
  })

  ipcMain.handle('archive:revokeApprovedPersonaDraftHostedShareLink', async (_event, payload) => {
    const input = revokeApprovedPersonaDraftHostedShareLinkInputSchema.parse(payload)
    return workspaceModule.revokeHostedShareLink(input)
  })

  ipcMain.handle('archive:openApprovedDraftHostedShareLink', async (_event, payload) => {
    const input = openApprovedDraftHostedShareLinkInputSchema.parse(payload)
    return workspaceModule.openHostedShareLink(input)
  })

  ipcMain.handle('archive:listApprovedDraftSendDestinations', async () => {
    return workspaceModule.listSendDestinations()
  })

  ipcMain.handle('archive:listApprovedPersonaDraftProviderSends', async (_event, payload) => {
    const input = listApprovedPersonaDraftProviderSendsInputSchema.parse(payload)
    return workspaceModule.listProviderSends(input)
  })

  ipcMain.handle('archive:sendApprovedPersonaDraftToProvider', async (_event, payload) => {
    const input = sendApprovedPersonaDraftToProviderInputSchema.parse(payload)
    return workspaceModule.sendToProvider(input)
  })

  ipcMain.handle('archive:retryApprovedPersonaDraftProviderSend', async (_event, payload) => {
    const input = retryApprovedPersonaDraftProviderSendInputSchema.parse(payload)
    return workspaceModule.retryProviderSend(input)
  })
}
