import { ipcMain } from 'electron'
import {
  approveSafeReviewGroupInputSchema,
  decisionJournalFilterSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema,
  reviewQueueListInputSchema,
  reviewWorkbenchFilterSchema,
  reviewWorkbenchItemSchema
} from '../../../shared/schemas/review'
import type { AppPaths } from '../../services/appPaths'
import { createReviewModule } from './runtime/createReviewModule'

export function registerReviewIpc(appPaths: AppPaths) {
  const reviewModule = createReviewModule(appPaths)
  ipcMain.removeHandler('archive:listReviewQueue')
  ipcMain.removeHandler('archive:listDecisionJournal')
  ipcMain.removeHandler('archive:listReviewInboxPeople')
  ipcMain.removeHandler('archive:listReviewConflictGroups')
  ipcMain.removeHandler('archive:listReviewWorkbenchItems')
  ipcMain.removeHandler('archive:getReviewWorkbenchItem')
  ipcMain.removeHandler('archive:approveReviewItem')
  ipcMain.removeHandler('archive:approveSafeReviewGroup')
  ipcMain.removeHandler('archive:rejectReviewItem')
  ipcMain.removeHandler('archive:undoDecision')
  ipcMain.removeHandler('archive:searchDecisionJournal')

  ipcMain.handle('archive:listReviewQueue', async (_event, payload) => {
    const input = reviewQueueListInputSchema.parse(payload)
    return reviewModule.listQueue(input)
  })

  ipcMain.handle('archive:listDecisionJournal', async (_event, payload) => {
    const input = decisionJournalFilterSchema.parse(payload)
    return reviewModule.listDecisionJournal(input)
  })

  ipcMain.handle('archive:listReviewInboxPeople', async () => {
    return reviewModule.listInboxPeople()
  })

  ipcMain.handle('archive:listReviewConflictGroups', async () => {
    return reviewModule.listConflictGroups()
  })

  ipcMain.handle('archive:listReviewWorkbenchItems', async (_event, payload) => {
    const input = reviewWorkbenchFilterSchema.parse(payload)
    return reviewModule.listWorkbenchItems(input)
  })

  ipcMain.handle('archive:getReviewWorkbenchItem', async (_event, payload) => {
    const { queueItemId } = reviewWorkbenchItemSchema.parse(payload)
    return reviewModule.getWorkbenchItem({ queueItemId })
  })

  ipcMain.handle('archive:approveReviewItem', async (_event, payload) => {
    const { queueItemId } = queueItemIdSchema.parse(payload)
    return reviewModule.approveItem({ queueItemId })
  })

  ipcMain.handle('archive:approveSafeReviewGroup', async (_event, payload) => {
    const input = approveSafeReviewGroupInputSchema.parse(payload)
    return reviewModule.approveSafeGroup(input)
  })

  ipcMain.handle('archive:rejectReviewItem', async (_event, payload) => {
    const input = rejectReviewItemInputSchema.parse(payload)
    return reviewModule.rejectItem(input)
  })

  ipcMain.handle('archive:undoDecision', async (_event, payload) => {
    const { journalId } = journalIdSchema.parse(payload)
    return reviewModule.undoDecision({ journalId })
  })

  ipcMain.handle('archive:searchDecisionJournal', async (_event, payload) => {
    const input = decisionJournalFilterSchema.parse(payload)
    return reviewModule.searchDecisionJournal(input)
  })
}
