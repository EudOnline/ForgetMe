import { ipcMain } from 'electron'
import type { AppPaths } from '../services/appPaths'
import { logicalDeleteBatch } from '../services/deleteService'
import { searchArchive, searchDecisionJournal } from '../services/searchService'
import { batchIdSchema, decisionJournalFilterSchema } from '../../shared/ipcSchemas'

export function registerSearchIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:search')
  ipcMain.removeHandler('archive:searchDecisionJournal')
  ipcMain.removeHandler('archive:deleteBatch')

  ipcMain.handle('archive:search', async (_event, payload) => {
    return searchArchive({ appPaths, ...(payload ?? {}) })
  })

  ipcMain.handle('archive:searchDecisionJournal', async (_event, payload) => {
    const input = decisionJournalFilterSchema.parse(payload)
    return searchDecisionJournal({ appPaths, ...input })
  })

  ipcMain.handle('archive:deleteBatch', async (_event, payload) => {
    const { batchId } = batchIdSchema.parse(payload)
    return logicalDeleteBatch({ appPaths, batchId, actor: 'local-user' })
  })
}
