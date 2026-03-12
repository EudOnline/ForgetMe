import type {
  ArchiveApi,
  ArchiveSearchResult,
  BackupExportResult,
  CanonicalPersonDetail,
  CanonicalPersonSummary,
  CreateImportBatchInput,
  DecisionJournalSearchResult,
  DecisionJournalEntry,
  ReviewConflictGroupSummary,
  ReviewInboxPersonSummary,
  DocumentEvidence,
  ProviderEgressArtifact,
  EnrichmentAttempt,
  EnrichmentJob,
  ImportBatchSummary,
  PersonGraph,
  PersonProfileAttribute,
  PersonTimelineEvent,
  ProfileAttributeCandidate,
  RestoreRunResult,
  ReviewQueueItem,
  ReviewWorkbenchDetail,
  ReviewWorkbenchListItem,
  StructuredFieldCandidate
} from '../shared/archiveContracts'

declare global {
  interface Window {
    require?: (moduleName: string) => any
  }
}

const fallbackApi: ArchiveApi = {
  selectImportFiles: async () => [],
  selectBackupExportDestination: async () => null,
  selectBackupExportSource: async () => null,
  selectRestoreTargetDirectory: async () => null,
  createBackupExport: async (_input: { destinationRoot: string; encryptionPassword?: string }) => null as BackupExportResult | null,
  restoreBackupExport: async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null,
  runRecoveryDrill: async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null,
  createImportBatch: async (_input: CreateImportBatchInput) => ({ batchId: '', sourceLabel: '', createdAt: '', files: [] }),
  listImportBatches: async () => [] as ImportBatchSummary[],
  getImportBatch: async () => null,
  searchArchive: async () => [] as ArchiveSearchResult[],
  logicalDeleteBatch: async (batchId: string) => ({ status: 'deleted' as const, batchId, deletedAt: '' }),
  listCanonicalPeople: async () => [] as CanonicalPersonSummary[],
  getCanonicalPerson: async (_canonicalPersonId: string) => null as CanonicalPersonDetail | null,
  getPersonTimeline: async (_canonicalPersonId: string) => [] as PersonTimelineEvent[],
  getPersonGraph: async (_canonicalPersonId: string) => ({ nodes: [], edges: [] } as PersonGraph),
  listPersonProfileAttributes: async () => [] as PersonProfileAttribute[],
  listProfileAttributeCandidates: async () => [] as ProfileAttributeCandidate[],
  approveProfileAttributeCandidate: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  rejectProfileAttributeCandidate: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoProfileAttributeDecision: async (journalId: string) => ({ status: 'undone' as const, journalId }),
  listReviewQueue: async () => [] as ReviewQueueItem[],
  listDecisionJournal: async () => [] as DecisionJournalEntry[],
  searchDecisionJournal: async () => [] as DecisionJournalSearchResult[],
  listReviewInboxPeople: async () => [] as ReviewInboxPersonSummary[],
  listReviewConflictGroups: async () => [] as ReviewConflictGroupSummary[],
  listReviewWorkbenchItems: async () => [] as ReviewWorkbenchListItem[],
  getReviewWorkbenchItem: async () => null as ReviewWorkbenchDetail | null,
  approveReviewItem: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  approveSafeReviewGroup: async ({ groupKey }: { groupKey: string }) => ({ status: 'approved' as const, batchId: '', journalId: '', groupKey, itemCount: 0, canonicalPersonId: null, canonicalPersonName: null, itemType: 'profile_attribute_candidate' as const, fieldKey: null, queueItemIds: [] }),
  rejectReviewItem: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoDecision: async (journalId: string) => ({ status: 'undone' as const, journalId }),
  setRelationshipLabel: async () => ({ id: '', status: 'approved' as const }),
  listEnrichmentJobs: async () => [] as EnrichmentJob[],
  listEnrichmentAttempts: async () => [] as EnrichmentAttempt[],
  listProviderEgressArtifacts: async (_jobId: string) => [] as ProviderEgressArtifact[],
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
    selectBackupExportDestination: () => ipcRenderer.invoke('archive:selectBackupExportDestination'),
    selectBackupExportSource: () => ipcRenderer.invoke('archive:selectBackupExportSource'),
    selectRestoreTargetDirectory: () => ipcRenderer.invoke('archive:selectRestoreTargetDirectory'),
    createBackupExport: (input) => ipcRenderer.invoke('archive:createBackupExport', input),
    restoreBackupExport: (input) => ipcRenderer.invoke('archive:restoreBackupExport', input),
    runRecoveryDrill: (input) => ipcRenderer.invoke('archive:runRecoveryDrill', input),
    createImportBatch: (input) => ipcRenderer.invoke('archive:createImportBatch', input),
    listImportBatches: () => ipcRenderer.invoke('archive:listImportBatches'),
    getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId }),
    searchArchive: (input) => ipcRenderer.invoke('archive:search', input),
    logicalDeleteBatch: (batchId) => ipcRenderer.invoke('archive:deleteBatch', { batchId }),
    listCanonicalPeople: () => ipcRenderer.invoke('archive:listCanonicalPeople'),
    getCanonicalPerson: (canonicalPersonId) => ipcRenderer.invoke('archive:getCanonicalPerson', { canonicalPersonId }),
    getPersonTimeline: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonTimeline', { canonicalPersonId }),
    getPersonGraph: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonGraph', { canonicalPersonId }),
    listPersonProfileAttributes: (input) => ipcRenderer.invoke('archive:listPersonProfileAttributes', input),
    listProfileAttributeCandidates: (input) => ipcRenderer.invoke('archive:listProfileAttributeCandidates', input),
    approveProfileAttributeCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveProfileAttributeCandidate', { queueItemId }),
    rejectProfileAttributeCandidate: (input) => ipcRenderer.invoke('archive:rejectProfileAttributeCandidate', input),
    undoProfileAttributeDecision: (journalId) => ipcRenderer.invoke('archive:undoProfileAttributeDecision', { journalId }),
    listReviewQueue: (input) => ipcRenderer.invoke('archive:listReviewQueue', input),
    listDecisionJournal: (input) => ipcRenderer.invoke('archive:listDecisionJournal', input),
    searchDecisionJournal: (input) => ipcRenderer.invoke('archive:searchDecisionJournal', input),
    listReviewInboxPeople: () => ipcRenderer.invoke('archive:listReviewInboxPeople'),
    listReviewConflictGroups: () => ipcRenderer.invoke('archive:listReviewConflictGroups'),
    listReviewWorkbenchItems: (input) => ipcRenderer.invoke('archive:listReviewWorkbenchItems', input),
    getReviewWorkbenchItem: (queueItemId) => ipcRenderer.invoke('archive:getReviewWorkbenchItem', { queueItemId }),
    approveReviewItem: (queueItemId) => ipcRenderer.invoke('archive:approveReviewItem', { queueItemId }),
    approveSafeReviewGroup: (input) => ipcRenderer.invoke('archive:approveSafeReviewGroup', input),
    rejectReviewItem: (input) => ipcRenderer.invoke('archive:rejectReviewItem', input),
    undoDecision: (journalId) => ipcRenderer.invoke('archive:undoDecision', { journalId }),
    setRelationshipLabel: (input) => ipcRenderer.invoke('archive:setRelationshipLabel', input),
    listEnrichmentJobs: (input) => ipcRenderer.invoke('archive:listEnrichmentJobs', input),
    listEnrichmentAttempts: (input) => ipcRenderer.invoke('archive:listEnrichmentAttempts', input),
    listProviderEgressArtifacts: (jobId) => ipcRenderer.invoke('archive:listProviderEgressArtifacts', { jobId }),
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
