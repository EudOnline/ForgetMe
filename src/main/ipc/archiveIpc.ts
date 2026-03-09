import { dialog, ipcMain } from 'electron'
import type { AppPaths } from '../services/appPaths'
import { createImportBatch, getImportBatch, listImportBatches } from '../services/importBatchService'
import { batchIdSchema, createImportBatchInputSchema } from '../../shared/ipcSchemas'

export function registerArchiveIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:selectImportFiles')
  ipcMain.removeHandler('archive:createImportBatch')
  ipcMain.removeHandler('archive:listImportBatches')
  ipcMain.removeHandler('archive:getImportBatch')

  ipcMain.handle('archive:selectImportFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported imports', extensions: ['json', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'pdf', 'docx'] }
      ]
    })

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('archive:createImportBatch', async (_event, payload) => {
    const input = createImportBatchInputSchema.parse(payload)
    return createImportBatch({ appPaths, ...input })
  })

  ipcMain.handle('archive:listImportBatches', async () => {
    return listImportBatches(appPaths)
  })

  ipcMain.handle('archive:getImportBatch', async (_event, payload) => {
    const { batchId } = batchIdSchema.parse(payload)
    return getImportBatch(appPaths, batchId)
  })
}
