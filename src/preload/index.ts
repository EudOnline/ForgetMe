import { contextBridge, ipcRenderer } from 'electron'
import type { ArchiveApi } from '../shared/archiveContracts'

const archiveApi: ArchiveApi = {
  selectImportFiles: () => ipcRenderer.invoke('archive:selectImportFiles'),
  createImportBatch: (input) => ipcRenderer.invoke('archive:createImportBatch', input),
  listImportBatches: () => ipcRenderer.invoke('archive:listImportBatches'),
  getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId }),
  searchArchive: (input) => ipcRenderer.invoke('archive:search', input),
  logicalDeleteBatch: (batchId) => ipcRenderer.invoke('archive:deleteBatch', { batchId }),
  listCanonicalPeople: () => ipcRenderer.invoke('archive:listCanonicalPeople'),
  getCanonicalPerson: (canonicalPersonId) => ipcRenderer.invoke('archive:getCanonicalPerson', { canonicalPersonId }),
  getPersonTimeline: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonTimeline', { canonicalPersonId }),
  getPersonGraph: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonGraph', { canonicalPersonId }),
  listReviewQueue: (input) => ipcRenderer.invoke('archive:listReviewQueue', input),
  listDecisionJournal: () => ipcRenderer.invoke('archive:listDecisionJournal'),
  approveReviewItem: (queueItemId) => ipcRenderer.invoke('archive:approveReviewItem', { queueItemId }),
  rejectReviewItem: (input) => ipcRenderer.invoke('archive:rejectReviewItem', input),
  undoDecision: (journalId) => ipcRenderer.invoke('archive:undoDecision', { journalId }),
  setRelationshipLabel: (input) => ipcRenderer.invoke('archive:setRelationshipLabel', input)
}

contextBridge.exposeInMainWorld('archiveApi', archiveApi)
