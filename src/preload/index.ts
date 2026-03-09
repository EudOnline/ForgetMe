import { contextBridge, ipcRenderer } from 'electron'
import type { ArchiveApi } from '../shared/archiveContracts'

const archiveApi: ArchiveApi = {
  selectImportFiles: () => ipcRenderer.invoke('archive:selectImportFiles'),
  createImportBatch: (input) => ipcRenderer.invoke('archive:createImportBatch', input),
  listImportBatches: () => ipcRenderer.invoke('archive:listImportBatches'),
  getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId })
}

contextBridge.exposeInMainWorld('archiveApi', archiveApi)
