import { dialog, ipcMain } from 'electron'
import path from 'node:path'
import type { AppPaths } from '../services/appPaths'
import { createImportBatch, getImportBatch, listImportBatches } from '../services/importBatchService'
import { batchIdSchema, createImportBatchInputSchema } from '../../shared/ipcSchemas'
import { SUPPORTED_IMPORT_FILTER_EXTENSIONS, SUPPORTED_IMPORT_FILTER_LABEL } from '../../shared/archiveTypes'

export function registerArchiveIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:selectImportFiles')
  ipcMain.removeHandler('archive:createImportBatch')
  ipcMain.removeHandler('archive:listImportBatches')
  ipcMain.removeHandler('archive:getImportBatch')

  ipcMain.handle('archive:selectImportFiles', async () => {
    if (process.env.FORGETME_E2E_FIXTURE) {
      return process.env.FORGETME_E2E_FIXTURE.split(path.delimiter).filter(Boolean)
    }

    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: SUPPORTED_IMPORT_FILTER_LABEL, extensions: [...SUPPORTED_IMPORT_FILTER_EXTENSIONS] }]
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
