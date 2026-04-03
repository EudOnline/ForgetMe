import type {
  ApprovedDraftSendDestination,
  ArchiveApi,
  BackupExportResult,
  DocumentEvidence,
  EnrichmentAttempt,
  EnrichmentJob,
  ProviderEgressArtifact,
  RestoreRunResult,
  StructuredFieldCandidate
} from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type OpsClient = Pick<
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
  | 'listApprovedDraftSendDestinations'
>

export function getOpsClient(): OpsClient {
  return {
    selectBackupExportDestination: bridgeMethod('selectBackupExportDestination', async () => null),
    selectBackupExportSource: bridgeMethod('selectBackupExportSource', async () => null),
    selectRestoreTargetDirectory: bridgeMethod('selectRestoreTargetDirectory', async () => null),
    createBackupExport: bridgeMethod(
      'createBackupExport',
      async (_input: { destinationRoot: string; encryptionPassword?: string }) => null as BackupExportResult | null
    ),
    restoreBackupExport: bridgeMethod(
      'restoreBackupExport',
      async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null
    ),
    runRecoveryDrill: bridgeMethod(
      'runRecoveryDrill',
      async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null
    ),
    listEnrichmentJobs: bridgeMethod('listEnrichmentJobs', async () => [] as EnrichmentJob[]),
    listEnrichmentAttempts: bridgeMethod('listEnrichmentAttempts', async () => [] as EnrichmentAttempt[]),
    listProviderEgressArtifacts: bridgeMethod('listProviderEgressArtifacts', async (_jobId: string) => [] as ProviderEgressArtifact[]),
    getDocumentEvidence: bridgeMethod('getDocumentEvidence', async (_fileId: string) => null as DocumentEvidence | null),
    rerunEnrichmentJob: bridgeMethod('rerunEnrichmentJob', async (_jobId: string) => null as EnrichmentJob | null),
    listStructuredFieldCandidates: bridgeMethod('listStructuredFieldCandidates', async () => [] as StructuredFieldCandidate[]),
    approveStructuredFieldCandidate: bridgeMethod(
      'approveStructuredFieldCandidate',
      async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    rejectStructuredFieldCandidate: bridgeMethod(
      'rejectStructuredFieldCandidate',
      async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    undoStructuredFieldDecision: bridgeMethod(
      'undoStructuredFieldDecision',
      async (journalId: string) => ({ status: 'undone' as const, journalId })
    ),
    listApprovedDraftSendDestinations: bridgeMethod('listApprovedDraftSendDestinations', async () => [] as ApprovedDraftSendDestination[])
  }
}
