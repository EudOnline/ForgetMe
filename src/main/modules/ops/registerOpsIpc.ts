import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import {
  backupExportInputSchema,
  documentEvidenceInputSchema,
  enrichmentAttemptFilterSchema,
  enrichmentJobFilterSchema,
  jobIdSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema,
  restoreBackupInputSchema,
  structuredFieldCandidateFilterSchema
} from '../../../shared/schemas/ops'
import type { AppPaths } from '../../services/appPaths'
import { createBackupExport } from '../../services/backupExportService'
import { openDatabase, runMigrations } from '../../services/db'
import { approveStructuredFieldCandidate, rejectStructuredFieldCandidate, undoStructuredFieldDecision } from '../../services/enrichmentReviewService'
import { getDocumentEvidence, listEnrichmentJobs, listProviderEgressArtifacts, listStructuredFieldCandidates, rerunEnrichmentJob } from '../../services/enrichmentReadService'
import { listEnrichmentAttempts } from '../../services/profileReadService'
import { restoreBackupExport, runRecoveryDrill } from '../../services/restoreService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

async function selectDirectory(envKey: string) {
  const envValue = process.env[envKey]
  if (envValue) {
    return envValue
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : result.filePaths[0] ?? null
}

export function registerOpsIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:selectBackupExportDestination')
  ipcMain.removeHandler('archive:selectBackupExportSource')
  ipcMain.removeHandler('archive:selectRestoreTargetDirectory')
  ipcMain.removeHandler('archive:createBackupExport')
  ipcMain.removeHandler('archive:restoreBackupExport')
  ipcMain.removeHandler('archive:runRecoveryDrill')
  ipcMain.removeHandler('archive:listEnrichmentJobs')
  ipcMain.removeHandler('archive:listEnrichmentAttempts')
  ipcMain.removeHandler('archive:listProviderEgressArtifacts')
  ipcMain.removeHandler('archive:getDocumentEvidence')
  ipcMain.removeHandler('archive:rerunEnrichmentJob')
  ipcMain.removeHandler('archive:listStructuredFieldCandidates')
  ipcMain.removeHandler('archive:approveStructuredFieldCandidate')
  ipcMain.removeHandler('archive:rejectStructuredFieldCandidate')
  ipcMain.removeHandler('archive:undoStructuredFieldDecision')

  ipcMain.handle('archive:selectBackupExportDestination', async () => {
    return selectDirectory('FORGETME_E2E_BACKUP_DESTINATION_DIR')
  })
  ipcMain.handle('archive:selectBackupExportSource', async () => {
    return selectDirectory('FORGETME_E2E_BACKUP_SOURCE_DIR')
  })
  ipcMain.handle('archive:selectRestoreTargetDirectory', async () => {
    return selectDirectory('FORGETME_E2E_RESTORE_TARGET_DIR')
  })

  ipcMain.handle('archive:createBackupExport', async (_event, payload) => {
    const input = backupExportInputSchema.parse(payload)
    return createBackupExport({ appPaths, ...input })
  })

  ipcMain.handle('archive:restoreBackupExport', async (_event, payload) => {
    const input = restoreBackupInputSchema.parse(payload)
    return restoreBackupExport(input)
  })

  ipcMain.handle('archive:runRecoveryDrill', async (_event, payload) => {
    const input = restoreBackupInputSchema.parse(payload)
    return runRecoveryDrill(input)
  })

  ipcMain.handle('archive:listEnrichmentJobs', async (_event, payload) => {
    const input = enrichmentJobFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const jobs = listEnrichmentJobs(db, input)
    db.close()
    return jobs
  })

  ipcMain.handle('archive:listEnrichmentAttempts', async (_event, payload) => {
    const input = enrichmentAttemptFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const attempts = listEnrichmentAttempts(db, input)
    db.close()
    return attempts
  })

  ipcMain.handle('archive:listProviderEgressArtifacts', async (_event, payload) => {
    const { jobId } = jobIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const artifacts = listProviderEgressArtifacts(db, { jobId })
    db.close()
    return artifacts
  })

  ipcMain.handle('archive:getDocumentEvidence', async (_event, payload) => {
    const input = documentEvidenceInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const evidence = getDocumentEvidence(db, input)
    db.close()
    return evidence
  })

  ipcMain.handle('archive:rerunEnrichmentJob', async (_event, payload) => {
    const { jobId } = jobIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const job = rerunEnrichmentJob(db, { jobId })
    db.close()
    return job
  })

  ipcMain.handle('archive:listStructuredFieldCandidates', async (_event, payload) => {
    const input = structuredFieldCandidateFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const candidates = listStructuredFieldCandidates(db, input)
    db.close()
    return candidates
  })

  ipcMain.handle('archive:approveStructuredFieldCandidate', async (_event, payload) => {
    const { queueItemId } = queueItemIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = approveStructuredFieldCandidate(db, { queueItemId, actor: 'local-user' })
    db.close()
    return result
  })

  ipcMain.handle('archive:rejectStructuredFieldCandidate', async (_event, payload) => {
    const input = rejectReviewItemInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = rejectStructuredFieldCandidate(db, { queueItemId: input.queueItemId, actor: 'local-user', note: input.note })
    db.close()
    return result
  })

  ipcMain.handle('archive:undoStructuredFieldDecision', async (_event, payload) => {
    const { journalId } = journalIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = undoStructuredFieldDecision(db, { journalId, actor: 'local-user' })
    db.close()
    return result
  })
}
