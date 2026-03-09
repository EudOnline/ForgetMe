import type { ArchiveApi, ArchiveSearchResult, CreateImportBatchInput, ImportBatchSummary } from '../shared/archiveContracts'

declare global {
  interface Window {
    require?: (moduleName: string) => any
  }
}

const fallbackApi: ArchiveApi = {
  selectImportFiles: async () => [],
  createImportBatch: async (_input: CreateImportBatchInput) => ({ batchId: '', sourceLabel: '', createdAt: '', files: [] }),
  listImportBatches: async () => [] as ImportBatchSummary[],
  getImportBatch: async () => null,
  searchArchive: async () => [] as ArchiveSearchResult[],
  logicalDeleteBatch: async (batchId: string) => ({ status: 'deleted' as const, batchId, deletedAt: '' })
}

function createIpcArchiveApi(): ArchiveApi | null {
  const electron = window.require?.('electron')
  const ipcRenderer = electron?.ipcRenderer
  if (!ipcRenderer) {
    return null
  }

  return {
    selectImportFiles: () => ipcRenderer.invoke('archive:selectImportFiles'),
    createImportBatch: (input) => ipcRenderer.invoke('archive:createImportBatch', input),
    listImportBatches: () => ipcRenderer.invoke('archive:listImportBatches'),
    getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId }),
    searchArchive: (input) => ipcRenderer.invoke('archive:search', input),
    logicalDeleteBatch: (batchId) => ipcRenderer.invoke('archive:deleteBatch', { batchId })
  }
}

export function getArchiveApi(): ArchiveApi {
  return window.archiveApi ?? createIpcArchiveApi() ?? fallbackApi
}
