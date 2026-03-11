import type {
  ArchiveApi,
  ArchiveSearchResult,
  CanonicalPersonDetail,
  CanonicalPersonSummary,
  CreateImportBatchInput,
  DecisionJournalEntry,
  DocumentEvidence,
  EnrichmentJob,
  ImportBatchSummary,
  PersonGraph,
  PersonTimelineEvent,
  ReviewQueueItem,
  StructuredFieldCandidate
} from '../shared/archiveContracts'

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
  logicalDeleteBatch: async (batchId: string) => ({ status: 'deleted' as const, batchId, deletedAt: '' }),
  listCanonicalPeople: async () => [] as CanonicalPersonSummary[],
  getCanonicalPerson: async (_canonicalPersonId: string) => null as CanonicalPersonDetail | null,
  getPersonTimeline: async (_canonicalPersonId: string) => [] as PersonTimelineEvent[],
  getPersonGraph: async (_canonicalPersonId: string) => ({ nodes: [], edges: [] } as PersonGraph),
  listReviewQueue: async () => [] as ReviewQueueItem[],
  listDecisionJournal: async () => [] as DecisionJournalEntry[],
  approveReviewItem: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  rejectReviewItem: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoDecision: async (journalId: string) => ({ status: 'undone' as const, journalId }),
  setRelationshipLabel: async () => ({ id: '', status: 'approved' as const }),
  listEnrichmentJobs: async () => [] as EnrichmentJob[],
  getDocumentEvidence: async (_fileId: string) => null as DocumentEvidence | null,
  rerunEnrichmentJob: async (_jobId: string) => null as EnrichmentJob | null,
  listStructuredFieldCandidates: async () => [] as StructuredFieldCandidate[],
  approveStructuredFieldCandidate: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  rejectStructuredFieldCandidate: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoStructuredFieldDecision: async (journalId: string) => ({ status: 'undone' as const, journalId })
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
    setRelationshipLabel: (input) => ipcRenderer.invoke('archive:setRelationshipLabel', input),
    listEnrichmentJobs: (input) => ipcRenderer.invoke('archive:listEnrichmentJobs', input),
    getDocumentEvidence: (fileId) => ipcRenderer.invoke('archive:getDocumentEvidence', { fileId }),
    rerunEnrichmentJob: (jobId) => ipcRenderer.invoke('archive:rerunEnrichmentJob', { jobId }),
    listStructuredFieldCandidates: (input) => ipcRenderer.invoke('archive:listStructuredFieldCandidates', input),
    approveStructuredFieldCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveStructuredFieldCandidate', { queueItemId }),
    rejectStructuredFieldCandidate: (input) => ipcRenderer.invoke('archive:rejectStructuredFieldCandidate', input),
    undoStructuredFieldDecision: (journalId) => ipcRenderer.invoke('archive:undoStructuredFieldDecision', { journalId })
  }
}

export function getArchiveApi(): ArchiveApi {
  return window.archiveApi ?? createIpcArchiveApi() ?? fallbackApi
}
