import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type ImportPreloadModule = Pick<
  ArchiveApi,
  'selectImportFiles' | 'preflightImportBatch' | 'createImportBatch' | 'listImportBatches' | 'getImportBatch' | 'searchArchive' | 'logicalDeleteBatch'
>

export function createImportPreloadModule(ipcRenderer: IpcRenderer): ImportPreloadModule {
  return {
    selectImportFiles: invokeWithout(ipcRenderer, 'archive:selectImportFiles'),
    preflightImportBatch: invokeWith(ipcRenderer, 'archive:preflightImportBatch'),
    createImportBatch: invokeWith(ipcRenderer, 'archive:createImportBatch'),
    listImportBatches: invokeWithout(ipcRenderer, 'archive:listImportBatches'),
    getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId }),
    searchArchive: invokeWith(ipcRenderer, 'archive:search'),
    logicalDeleteBatch: (batchId) => ipcRenderer.invoke('archive:deleteBatch', { batchId })
  }
}
