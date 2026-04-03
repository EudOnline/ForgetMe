import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type OpsPreloadModule = Pick<
  ArchiveApi,
  | 'selectBackupExportDestination'
  | 'selectBackupExportSource'
  | 'selectRestoreTargetDirectory'
  | 'createBackupExport'
  | 'restoreBackupExport'
  | 'runRecoveryDrill'
  | 'listEnrichmentJobs'
  | 'listEnrichmentAttempts'
  | 'listProviderEgressArtifacts'
  | 'getDocumentEvidence'
  | 'rerunEnrichmentJob'
  | 'listStructuredFieldCandidates'
  | 'approveStructuredFieldCandidate'
  | 'rejectStructuredFieldCandidate'
  | 'undoStructuredFieldDecision'
>

export function createOpsPreloadModule(ipcRenderer: IpcRenderer): OpsPreloadModule {
  return {
    selectBackupExportDestination: invokeWithout(ipcRenderer, 'archive:selectBackupExportDestination'),
    selectBackupExportSource: invokeWithout(ipcRenderer, 'archive:selectBackupExportSource'),
    selectRestoreTargetDirectory: invokeWithout(ipcRenderer, 'archive:selectRestoreTargetDirectory'),
    createBackupExport: invokeWith(ipcRenderer, 'archive:createBackupExport'),
    restoreBackupExport: invokeWith(ipcRenderer, 'archive:restoreBackupExport'),
    runRecoveryDrill: invokeWith(ipcRenderer, 'archive:runRecoveryDrill'),
    listEnrichmentJobs: invokeWith(ipcRenderer, 'archive:listEnrichmentJobs'),
    listEnrichmentAttempts: invokeWith(ipcRenderer, 'archive:listEnrichmentAttempts'),
    listProviderEgressArtifacts: (jobId) => ipcRenderer.invoke('archive:listProviderEgressArtifacts', { jobId }),
    getDocumentEvidence: (fileId) => ipcRenderer.invoke('archive:getDocumentEvidence', { fileId }),
    rerunEnrichmentJob: (jobId) => ipcRenderer.invoke('archive:rerunEnrichmentJob', { jobId }),
    listStructuredFieldCandidates: invokeWith(ipcRenderer, 'archive:listStructuredFieldCandidates'),
    approveStructuredFieldCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveStructuredFieldCandidate', { queueItemId }),
    rejectStructuredFieldCandidate: invokeWith(ipcRenderer, 'archive:rejectStructuredFieldCandidate'),
    undoStructuredFieldDecision: (journalId) => ipcRenderer.invoke('archive:undoStructuredFieldDecision', { journalId })
  }
}
