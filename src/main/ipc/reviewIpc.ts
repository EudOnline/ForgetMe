import path from 'node:path'
import { ipcMain } from 'electron'
import { journalIdSchema, queueItemIdSchema, rejectReviewItemInputSchema, reviewQueueListInputSchema, reviewWorkbenchFilterSchema, reviewWorkbenchItemSchema } from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import { approveReviewItem, listDecisionJournal, listReviewQueue, rejectReviewItem, undoDecision } from '../services/reviewQueueService'
import { getReviewWorkbenchItem, listReviewInboxPeople, listReviewWorkbenchItems } from '../services/reviewWorkbenchReadService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function registerReviewIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:listReviewQueue')
  ipcMain.removeHandler('archive:listDecisionJournal')
  ipcMain.removeHandler('archive:listReviewInboxPeople')
  ipcMain.removeHandler('archive:listReviewWorkbenchItems')
  ipcMain.removeHandler('archive:getReviewWorkbenchItem')
  ipcMain.removeHandler('archive:approveReviewItem')
  ipcMain.removeHandler('archive:rejectReviewItem')
  ipcMain.removeHandler('archive:undoDecision')

  ipcMain.handle('archive:listReviewQueue', async (_event, payload) => {
    const input = reviewQueueListInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const items = listReviewQueue(db, input)
    db.close()
    return items
  })

  ipcMain.handle('archive:listDecisionJournal', async () => {
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const items = listDecisionJournal(db)
    db.close()
    return items
  })

  ipcMain.handle('archive:listReviewInboxPeople', async () => {
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const items = listReviewInboxPeople(db)
    db.close()
    return items
  })

  ipcMain.handle('archive:listReviewWorkbenchItems', async (_event, payload) => {
    const input = reviewWorkbenchFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const items = listReviewWorkbenchItems(db, input)
    db.close()
    return items
  })

  ipcMain.handle('archive:getReviewWorkbenchItem', async (_event, payload) => {
    const { queueItemId } = reviewWorkbenchItemSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    try {
      return getReviewWorkbenchItem(db, { queueItemId })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Review queue item not found:')) {
        return null
      }
      throw error
    } finally {
      db.close()
    }
  })

  ipcMain.handle('archive:approveReviewItem', async (_event, payload) => {
    const { queueItemId } = queueItemIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = approveReviewItem(db, { queueItemId, actor: 'local-user' })
    db.close()
    return result
  })

  ipcMain.handle('archive:rejectReviewItem', async (_event, payload) => {
    const input = rejectReviewItemInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = rejectReviewItem(db, { ...input, actor: 'local-user' })
    db.close()
    return result
  })

  ipcMain.handle('archive:undoDecision', async (_event, payload) => {
    const { journalId } = journalIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = undoDecision(db, { journalId, actor: 'local-user' })
    db.close()
    return result
  })
}
